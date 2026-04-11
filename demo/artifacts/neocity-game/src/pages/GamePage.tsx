// src/pages/GamePage.tsx
import { useState, useEffect, useCallback } from "react";
import { GameCanvas } from "@/game/GameCanvas";
import { ChatWindow, type TradeIntent } from "@/components/ChatWindow";
import { HUD } from "@/components/HUD";
import { isSdkReady, loadCharacters } from "@/lib/sdk";

interface ActiveNpc {
  id: string;   // game-local key: "scraper" | "cipher" | "enforcer"
  name: string; // display name sent to GuildCraft: "SCRAPER" | "CIPHER" | "ENFORCER"
}

export default function GamePage() {
  const [activeNpc, setActiveNpc] = useState<ActiveNpc | null>(null);
  const [pendingTrade, setPendingTrade] = useState<TradeIntent | null>(null);

  // Pre-warm the character cache as soon as the page mounts
  useEffect(() => {
    if (isSdkReady()) {
      void loadCharacters();
    }
  }, []);

  const handleOpenChat = useCallback((npcId: string, npcName: string) => {
    setActiveNpc({ id: npcId, name: npcName });
    setPendingTrade(null);
  }, []);

  const handleCloseChat = useCallback(() => {
    setActiveNpc(null);
    window.dispatchEvent(new CustomEvent("GAME_RESUME"));
  }, []);

  const handleTradeIntent = useCallback((trade: TradeIntent) => {
    setPendingTrade(trade);
  }, []);

  const handleTradeExecuted = useCallback(() => {
    // Keep trade panel visible so player can see the result, then clear
    setTimeout(() => setPendingTrade(null), 6000);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && activeNpc) handleCloseChat();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeNpc, handleCloseChat]);

  return (
    <div
      className="relative w-screen h-screen overflow-hidden"
      style={{ background: "#05050f", cursor: "crosshair" }}
    >
      {/* Layer 0: Phaser canvas */}
      <GameCanvas onOpenChat={handleOpenChat} onCloseChat={handleCloseChat} />

      {/* Layer 1: HUD — always visible */}
      <HUD
        activeNpc={activeNpc?.id ?? null}
        activeNpcName={activeNpc?.name ?? null}
        pendingTrade={pendingTrade}
        onTradeExecuted={handleTradeExecuted}
      />

      {/* Layer 2: Chat window */}
      {activeNpc && (
        <div
          className="absolute left-4 bottom-12 w-80 z-20"
          style={{ height: "55vh" }}
        >
          <ChatWindow
            npcId={activeNpc.id}
            npcName={activeNpc.name}
            onClose={handleCloseChat}
            onTradeIntent={handleTradeIntent}
          />
        </div>
      )}

      {/* Dim overlay while chat is open */}
      {activeNpc && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ zIndex: 15, background: "rgba(0,0,0,0.35)" }}
        />
      )}
    </div>
  );
}
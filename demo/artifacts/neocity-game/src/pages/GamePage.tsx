// src/pages/GamePage.tsx
import { useState, useEffect, useCallback } from "react";
import { GameCanvas } from "@/game/GameCanvas";
import { ChatWindow, type TradeIntent } from "@/components/ChatWindow";
import { HUD } from "@/components/HUD";

interface ActiveNpc {
  id: string;
  name: string;
}

export default function GamePage() {
  const [activeNpc, setActiveNpc] = useState<ActiveNpc | null>(null);
  const [pendingTrade, setPendingTrade] = useState<TradeIntent | null>(null);

  const handleOpenChat = useCallback((npcId: string, npcName: string) => {
    setActiveNpc({ id: npcId, name: npcName });
    setPendingTrade(null); // reset pending trade on new chat
  }, []);

  const handleCloseChat = useCallback(() => {
    setActiveNpc(null);
    window.dispatchEvent(new CustomEvent("GAME_RESUME"));
  }, []);

  const handleTradeIntent = useCallback((trade: TradeIntent) => {
    setPendingTrade(trade);
  }, []);

  const handleTradeExecuted = useCallback(() => {
    // Keep trade visible in HUD for a moment so player sees the result
    setTimeout(() => setPendingTrade(null), 6000);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && activeNpc) {
        handleCloseChat();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeNpc, handleCloseChat]);

  return (
    <div
      className="relative w-screen h-screen overflow-hidden"
      style={{ background: "#05050f", cursor: "crosshair" }}
    >
      {/* Layer 0: Phaser game canvas */}
      <GameCanvas onOpenChat={handleOpenChat} onCloseChat={handleCloseChat} />

      {/* Layer 1: HUD overlay (always visible) */}
      <HUD
        activeNpc={activeNpc?.id ?? null}
        pendingTrade={pendingTrade}
        onTradeExecuted={handleTradeExecuted}
      />

      {/* Layer 2: Chat window (visible when NPC is active) */}
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

      {/* Dim overlay when chat is open */}
      {activeNpc && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            zIndex: 15,
            background: "rgba(0, 0, 0, 0.35)",
          }}
        />
      )}
    </div>
  );
}
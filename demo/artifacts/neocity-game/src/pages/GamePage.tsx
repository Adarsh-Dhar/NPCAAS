// src/pages/GamePage.tsx
import { useState, useEffect, useCallback } from "react";
import { GameCanvas } from "@/game/GameCanvas";
import { ChatWindow, type TradeIntent } from "@/components/ChatWindow";
import { HUD } from "@/components/HUD";
import { WorldEventFeed } from "@/components/WorldEventFeed";
import { worldLoop } from "@/lib/npcWorldLoop";
import { getClient, isSdkReady, loadCharacters } from "@/lib/sdk";

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

  useEffect(() => {
    if (!isSdkReady()) return;

    let loopId: number | undefined;
    let cancelled = false;

    loadCharacters()
      .then(async (chars) => {
        if (cancelled) return;
        if (chars.size < 2) return;
        const client = getClient();
        if (!client) return;

        const allChars = await client.getCharacters();
        if (allChars.length < 2) return;

        const [scrap, cipher] = allChars;

        // Kick off an initial NPC conversation
        worldLoop
          .npcSpeak(
            scrap.id,
            cipher.name,
            "Heard you can craft the Root Key. What's it gonna cost me?"
          )
          .catch(() => {
            /* demo may not have API key */
          });

        // Simulate autonomous trade negotiation loop
        loopId = window.setInterval(async () => {
          if (allChars.length < 2) return;
          try {
            const initiator = allChars[Math.floor(Math.random() * allChars.length)];
            const others = allChars.filter((c: { id: any; }) => c.id !== initiator.id);
            if (others.length === 0) return;
            const target = others[Math.floor(Math.random() * others.length)];

            const prompts = [
              "What's your current inventory looking like?",
              'I have SCRP tokens. Looking to trade for crafted materials.',
              'The Enforcer has been watching us. Be careful what you say.',
              'Need the Root Key components. Name your price.',
            ];
            const msg = prompts[Math.floor(Math.random() * prompts.length)];

            await worldLoop.npcSpeak(initiator.id, target.name, msg);
          } catch {
            /* ignore */
          }
        }, 20000);
      })
      .catch(() => {
        /* ignore */
      });

    return () => {
      cancelled = true;
      if (loopId) clearInterval(loopId);
    };
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

      <WorldEventFeed />

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
// src/pages/GamePage.tsx
import { useState, useEffect, useCallback } from "react";
import { GameCanvas } from "../game/GameCanvas";
import { ChatWindow, type TradeIntent } from "../components/ChatWindow";
import { HUD } from "../components/HUD";
import { WorldEventFeed } from "../components/WorldEventFeed";
import DashboardPage from "./DashboardPage";
import { worldLoop } from "../lib/npcWorldLoop";
import { getClient, isSdkReady, loadCharacters } from "../lib/sdk";
import type { Character } from "../lib/sdk";
import { ensureMidnightManifestSetup } from "@/lib/midnightSetup";
import { resetDemoSession } from "@/lib/sessionReset";
import { isMidnightCharacter } from "@/lib/midnightManifest";

interface ActiveNpc {
  id: string;
  name: string; // canonical GuildCraft name, e.g. Forge_9
}

export default function GamePage() {
  const [activeNpc, setActiveNpc] = useState<ActiveNpc | null>(null);
  const [pendingTrade, setPendingTrade] = useState<TradeIntent | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [showDashboard, setShowDashboard] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);

  // Pre-warm the character cache as soon as the page mounts
  useEffect(() => {
    void ensureMidnightManifestSetup()
      .then(() => {
        if (isSdkReady()) {
          return loadCharacters();
        }
        return null;
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "Midnight setup failed";
        setSetupError(message);
      });
  }, []);

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      worldLoop.stop();
      try {
        await ensureMidnightManifestSetup();
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : "Midnight setup failed";
          setSetupError(message);
        }
      }

      if (!isSdkReady()) return;

      const client = getClient();
      if (!client) return;

      void loadCharacters();
      try {
        const allChars = (await client.getCharacters()) as Character[];
        if (cancelled) return;
        const midnightChars = Array.isArray(allChars)
          ? allChars.filter((character) => isMidnightCharacter(character.name))
          : [];
        setCharacters(midnightChars);
      } catch {
        if (!cancelled) {
          setCharacters([]);
        }
      }

      worldLoop.start(8000);
    };

    void boot();

    return () => {
      cancelled = true;
      worldLoop.stop();
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

  const handleRestartSession = useCallback(async () => {
    const confirmed = window.confirm("Restart the demo and clear the entire session?");
    if (!confirmed) return;

    worldLoop.stop();
    try {
      await resetDemoSession();
    } finally {
      window.location.reload();
    }
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      event.preventDefault();
      setShowDashboard((current) => !current);
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
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
      <GameCanvas characters={characters} onOpenChat={handleOpenChat} onCloseChat={handleCloseChat} />

      {/* Layer 1: HUD — always visible */}
      <HUD
        activeNpc={activeNpc?.id ?? null}
        activeNpcName={activeNpc?.name ?? null}
        pendingTrade={pendingTrade}
        onRestartSession={handleRestartSession}
        onTradeExecuted={handleTradeExecuted}
      />

      <WorldEventFeed />

      {showDashboard && (
        <DashboardPage
          characters={characters.map((character) => ({ id: character.id, name: character.name }))}
          onClose={() => setShowDashboard(false)}
        />
      )}

      {setupError && (
        <div
          className="absolute top-4 left-1/2 z-30 -translate-x-1/2 rounded border border-red-500/40 bg-black/80 px-3 py-2 text-xs text-red-300"
          style={{ fontFamily: "monospace" }}
        >
          MIDNIGHT SETUP ERROR: {setupError}
        </div>
      )}

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
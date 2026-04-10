import { useState, useEffect, useCallback } from "react";
import { GameCanvas } from "@/game/GameCanvas";
import { ChatWindow } from "@/components/ChatWindow";
import { HUD } from "@/components/HUD";

interface ActiveNpc {
  id: string;
  name: string;
}

export default function GamePage() {
  const [activeNpc, setActiveNpc] = useState<ActiveNpc | null>(null);

  const handleOpenChat = useCallback((npcId: string, npcName: string) => {
    setActiveNpc({ id: npcId, name: npcName });
  }, []);

  const handleCloseChat = useCallback(() => {
    setActiveNpc(null);
    window.dispatchEvent(new CustomEvent("GAME_RESUME"));
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
      <GameCanvas
        onOpenChat={handleOpenChat}
        onCloseChat={handleCloseChat}
      />

      <HUD activeNpc={activeNpc?.id ?? null} />

      {activeNpc && (
        <div className="absolute left-4 bottom-12 w-80 z-20" style={{ height: "55vh" }}>
          <ChatWindow
            npcId={activeNpc.id}
            npcName={activeNpc.name}
            onClose={handleCloseChat}
          />
        </div>
      )}

      {activeNpc && (
        <div
          className="absolute inset-0 z-15 pointer-events-none"
          style={{
            background: "rgba(0, 0, 0, 0.35)",
            backdropFilter: "none",
          }}
        />
      )}
    </div>
  );
}

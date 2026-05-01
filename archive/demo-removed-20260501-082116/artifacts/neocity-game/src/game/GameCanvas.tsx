import { useEffect, useRef } from "react";
import Phaser from "phaser";
import { MainScene } from "./scenes/MainScene";
import type { Character } from "../lib/sdk";
import { setSceneCharacters } from "@/lib/npcSceneState";

interface GameCanvasProps {
  onOpenChat: (npcId: string, npcName: string) => void;
  onCloseChat: () => void;
  characters: Character[];
}

export function GameCanvas({ onOpenChat, onCloseChat, characters }: GameCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    setSceneCharacters(characters);
  }, [characters]);

  useEffect(() => {
    if (!containerRef.current || gameRef.current) return;

    const handleOpenChat = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      onOpenChat(detail.npcId, detail.npcName);
    };

    window.addEventListener("OPEN_CHAT", handleOpenChat);

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
        backgroundColor: "#050510",
      parent: containerRef.current,
      physics: {
        default: "arcade",
        arcade: {
          gravity: { x: 0, y: 0 },
          debug: false,
        },
      },
      scene: [MainScene],
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight,
      },
      render: {
        antialias: false,
        pixelArt: true,
        roundPixels: true,
      },
    };

    gameRef.current = new Phaser.Game(config);

    return () => {
      window.removeEventListener("OPEN_CHAT", handleOpenChat);
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, [onCloseChat, onOpenChat]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-0"
      style={{ background: "#050510" }}
    />
  );
}

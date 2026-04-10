interface HUDProps {
  activeNpc: string | null;
}

export function HUD({ activeNpc }: HUDProps) {
  return (
    <>
      <div
        className="absolute top-4 left-4 z-10 text-xs"
        style={{ fontFamily: "monospace" }}
      >
        <div className="mb-2" style={{ color: "#00ffff", letterSpacing: 3 }}>
          NEOCITY-7
        </div>
        <div style={{ color: "#334466" }}>
          OBJECTIVE: Acquire the Root Key
        </div>
        <div className="mt-3 space-y-1" style={{ color: "#223344" }}>
          <div>
            <span style={{ color: "#445566" }}>MOVE</span> — WASD / ARROWS
          </div>
          <div>
            <span style={{ color: "#445566" }}>INTERACT</span> — [E]
          </div>
          {activeNpc && (
            <div>
              <span style={{ color: "#445566" }}>CLOSE</span> — ESC
            </div>
          )}
        </div>
      </div>

      <div
        className="absolute top-4 right-4 z-10 text-xs"
        style={{ fontFamily: "monospace", color: "#334466" }}
      >
        <div className="flex items-center gap-2 mb-1">
          <div
            className="w-2 h-2 rounded-full animate-pulse"
            style={{ background: "#ff6600" }}
          />
          <span style={{ color: "#ff6600" }}>SCRAP</span>
          <span>· The Scavenger</span>
        </div>
        <div className="flex items-center gap-2 mb-1">
          <div
            className="w-2 h-2 rounded-full animate-pulse"
            style={{ background: "#00ffcc", animationDelay: "0.5s" }}
          />
          <span style={{ color: "#00ffcc" }}>CIPHER</span>
          <span>· The Crafter</span>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full animate-pulse"
            style={{ background: "#ff0066", animationDelay: "1s" }}
          />
          <span style={{ color: "#ff0066" }}>ENFORCER</span>
          <span>· The Rival</span>
        </div>
      </div>

      <div
        className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 text-xs"
        style={{ fontFamily: "monospace", color: "#1a2233" }}
      >
        DISTRICT-7 SURVEILLANCE ACTIVE
      </div>
    </>
  );
}

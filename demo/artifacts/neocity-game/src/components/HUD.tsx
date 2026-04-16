// src/components/HUD.tsx
import { useEffect, useState, useCallback, useRef } from "react";
import {
  Loader2,
  CheckCircle,
  XCircle,
  Zap,
  RefreshCw,
} from "lucide-react";
import {
  getClient,
  getCharacterByName,
  isSdkReady,
} from "@/lib/sdk";
import type { TradeIntent } from "@/components/ChatWindow";
import { formatNpcDisplayName, PROTOCOL_BABEL_NODE_NAMES } from "@/lib/protocolBabel";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface TokenBalance {
  address: string;
  symbol: string;
  balanceFormatted: string;
}

interface WalletState {
  walletAddress: string;
  native: { symbol: string; balanceFormatted: string };
  tokens: TokenBalance[];
  fetchedAt: string;
}

type TxStatus =
  | { state: "idle" }
  | { state: "pending" }
  | { state: "success"; txHash?: string; mode: string }
  | { state: "error"; message: string };

export interface HUDProps {
  /** Active NPC id, or null when no chat is open */
  activeNpc: string | null;
  /** Canonical NPC name used for GuildCraft character lookup */
  activeNpcName: string | null;
  pendingTrade: TradeIntent | null;
  onTradeExecuted?: () => void;
}

// ---------------------------------------------------------------------------
export function HUD({
  activeNpc,
  activeNpcName,
  pendingTrade,
  onTradeExecuted,
}: HUDProps) {
  const [walletState, setWalletState] = useState<WalletState | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);
  const [txStatus, setTxStatus] = useState<TxStatus>({ state: "idle" });
  const [sdkActive] = useState(isSdkReady);
  // Resolved GuildCraft character id for the active NPC
  const [resolvedCharId, setResolvedCharId] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Resolve character id by name whenever activeNpcName changes ──────
  useEffect(() => {
    setResolvedCharId(null);
    setWalletState(null);
    if (!activeNpcName || !sdkActive) return;

    getCharacterByName(activeNpcName).then((char) => {
      if (char) {
        setResolvedCharId(char.id);
      } else {
        console.warn(
          `[HUD] No character found for name "${activeNpcName}" — wallet panel disabled.`
        );
      }
    });
  }, [activeNpcName, sdkActive]);

  // ── Wallet polling ────────────────────────────────────────────────────
  const fetchBalances = useCallback(async () => {
    if (!resolvedCharId) return;
    const client = getClient();
    if (!client) return;

    try {
      setWalletLoading(true);
      const data = await client.getWalletBalances(resolvedCharId);
      setWalletState({
        walletAddress: data.walletAddress,
        native: data.native,
        tokens: data.tokens ?? [],
        fetchedAt: data.fetchedAt,
      });
    } catch (err) {
      console.warn("[HUD] Failed to fetch wallet balances:", err);
    } finally {
      setWalletLoading(false);
    }
  }, [resolvedCharId]);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (!resolvedCharId) return;

    void fetchBalances();
    intervalRef.current = setInterval(() => void fetchBalances(), 10_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [resolvedCharId, fetchBalances]);

  // Reset tx status when trade changes
  useEffect(() => {
    setTxStatus({ state: "idle" });
  }, [pendingTrade]);

  // ── Trade execution ───────────────────────────────────────────────────
  const executeTrade = useCallback(async () => {
    if (!resolvedCharId || !pendingTrade) return;
    const client = getClient();
    if (!client) return;

    setTxStatus({ state: "pending" });
    try {
      const result = await client.executeTransaction(
        resolvedCharId,
        pendingTrade
      );
      setTxStatus({ state: "success", txHash: result.txHash, mode: result.mode });
      // Refresh balances 2 s after the tx lands
      setTimeout(() => void fetchBalances(), 2000);
      onTradeExecuted?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      setTxStatus({ state: "error", message: msg });
    }
  }, [resolvedCharId, pendingTrade, fetchBalances, onTradeExecuted]);

  const npcColor = activeNpcName
    ? `#${Array.from(activeNpcName).reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 7).toString(16).slice(-6).padStart(6, "0")}`
    : "#00ffff";

  return (
    <>
      {/* ── Top-left: game info + controls ─────────────────────────── */}
      <div
        className="absolute top-4 left-4 z-10 text-xs select-none"
        style={{ fontFamily: "monospace" }}
      >
        <div
          className="mb-2 flex items-center gap-2"
          style={{ color: "#00ffff", letterSpacing: 3 }}
        >
          NEOCITY-7
          {sdkActive && (
            <span
              className="flex items-center gap-1 px-1.5 py-0.5 rounded"
              style={{
                background: "rgba(0,255,255,0.08)",
                border: "1px solid rgba(0,255,255,0.2)",
                color: "#00ffff88",
                fontSize: "8px",
                letterSpacing: 1,
              }}
            >
              <Zap size={7} />
              LIVE
            </span>
          )}
        </div>
        <div style={{ color: "#334466" }}>OBJECTIVE: Acquire the Root Key</div>
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

      {/* ── Top-right: NPC legend + wallet + trade panel ───────────── */}
      <div
        className="absolute top-4 right-4 z-10 text-xs select-none"
        style={{ fontFamily: "monospace" }}
      >
        <div
          className="rounded p-3 mb-3"
          style={{
            background: "rgba(5,5,15,0.92)",
            border: "1px solid rgba(0,255,255,0.12)",
            minWidth: "180px",
          }}
        >
          <div className="text-xs font-bold mb-2" style={{ color: "#00ffff", letterSpacing: 2 }}>
            PROTOCOL BABEL
          </div>
          <div style={{ color: "#445566" }}>
            <div className="mb-1">NODES ACTIVE</div>
            <div className="text-cyan-300">{PROTOCOL_BABEL_NODE_NAMES.map((name) => formatNpcDisplayName(name)).join(" · ")}</div>
            <div className="mt-2 text-white/60">TAB — macro dashboard</div>
          </div>
        </div>

        {/* Wallet panel — only when SDK is live and character resolved */}
        {activeNpc && sdkActive && (
          <div
            className="mt-3 rounded p-3 space-y-1"
            style={{
              background: "rgba(5,5,15,0.92)",
              border: `1px solid ${npcColor}44`,
              boxShadow: `0 0 12px ${npcColor}11`,
              minWidth: "180px",
            }}
          >
            <div
              className="text-xs font-bold flex items-center justify-between gap-2 mb-2"
              style={{ color: npcColor, letterSpacing: 2 }}
            >
              TARGET UPLINK
              <button
                onClick={() => void fetchBalances()}
                disabled={walletLoading || !resolvedCharId}
                style={{ color: "#445566" }}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLElement).style.color = npcColor)
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLElement).style.color = "#445566")
                }
              >
                <RefreshCw
                  size={10}
                  className={walletLoading ? "animate-spin" : ""}
                />
              </button>
            </div>

            {!resolvedCharId && (
              <div
                className="flex items-center gap-2 text-xs"
                style={{ color: "#445566" }}
              >
                <Loader2 size={10} className="animate-spin" />
                resolving…
              </div>
            )}

            {resolvedCharId && walletState && (
              <>
                <div
                  className="text-xs truncate"
                  style={{ color: "#334455" }}
                >
                  {walletState.walletAddress.slice(0, 6)}…
                  {walletState.walletAddress.slice(-4)}
                </div>
                <div style={{ color: "#aaccdd" }}>
                  {walletState.native.symbol}:{" "}
                  <span style={{ color: "#fff" }}>
                    {walletState.native.balanceFormatted}
                  </span>
                </div>
                {walletState.tokens.map((t) => (
                  <div key={t.address} style={{ color: "#aaccdd" }}>
                    {t.symbol}:{" "}
                    <span style={{ color: "#fff" }}>
                      {t.balanceFormatted}
                    </span>
                  </div>
                ))}
                <div
                  style={{ color: "#223344", fontSize: "9px" }}
                  className="mt-1"
                >
                  updated {new Date(walletState.fetchedAt).toLocaleTimeString()}
                </div>
              </>
            )}

            {resolvedCharId && !walletState && !walletLoading && (
              <div style={{ color: "#445566" }}>no data</div>
            )}
          </div>
        )}

        {/* Pending trade panel */}
        {pendingTrade && (
          <div
            className="mt-3 rounded p-3"
            style={{
              background: "rgba(5,5,15,0.92)",
              border: "1px solid rgba(255,200,0,0.4)",
              boxShadow: "0 0 12px rgba(255,200,0,0.08)",
              minWidth: "180px",
            }}
          >
            <div
              className="text-xs font-bold mb-2 flex items-center gap-1"
              style={{ color: "#ffcc00", letterSpacing: 2 }}
            >
              <Zap size={10} />
              TRADE PROPOSAL
            </div>

            <div
              className="text-xs space-y-0.5 mb-3"
              style={{ color: "#aaccdd" }}
            >
              <div>
                ITEM:{" "}
                <span style={{ color: "#fff" }}>{pendingTrade.item}</span>
              </div>
              <div>
                PRICE:{" "}
                <span style={{ color: "#fff" }}>{pendingTrade.price}</span>
              </div>
              <div>
                CURRENCY:{" "}
                <span style={{ color: "#fff" }}>{pendingTrade.currency}</span>
              </div>
            </div>

            {txStatus.state === "idle" && (
              <button
                onClick={() => void executeTrade()}
                disabled={!resolvedCharId}
                className="w-full text-xs py-1.5 px-2 rounded font-bold tracking-widest transition-all"
                style={{
                  background: resolvedCharId
                    ? "rgba(255,200,0,0.15)"
                    : "rgba(255,200,0,0.05)",
                  border: "1px solid rgba(255,200,0,0.5)",
                  color: resolvedCharId ? "#ffcc00" : "#66550088",
                  cursor: resolvedCharId ? "pointer" : "not-allowed",
                }}
                onMouseEnter={(e) => {
                  if (resolvedCharId)
                    (e.currentTarget as HTMLElement).style.background =
                      "rgba(255,200,0,0.25)";
                }}
                onMouseLeave={(e) => {
                  if (resolvedCharId)
                    (e.currentTarget as HTMLElement).style.background =
                      "rgba(255,200,0,0.15)";
                }}
              >
                SIGN &amp; EXECUTE
              </button>
            )}

            {txStatus.state === "pending" && (
              <div
                className="w-full text-xs py-1.5 px-2 rounded flex items-center justify-center gap-2"
                style={{
                  background: "rgba(255,200,0,0.08)",
                  border: "1px solid rgba(255,200,0,0.3)",
                  color: "#ffcc0088",
                }}
              >
                <Loader2 size={10} className="animate-spin" />
                broadcasting…
              </div>
            )}

            {txStatus.state === "success" && (
              <div className="space-y-1">
                <div
                  className="w-full text-xs py-1.5 px-2 rounded flex items-center justify-center gap-2"
                  style={{
                    background: "rgba(0,255,100,0.08)",
                    border: "1px solid rgba(0,255,100,0.3)",
                    color: "#00ff64",
                  }}
                >
                  <CheckCircle size={10} />
                  {txStatus.mode === "sponsored"
                    ? "GASLESS SUCCESS"
                    : "SUCCESS"}
                </div>
                {txStatus.txHash && (
                  <div
                    className="text-xs truncate text-center"
                    style={{ color: "#334455", fontSize: "9px" }}
                  >
                    {txStatus.txHash.slice(0, 10)}…
                    {txStatus.txHash.slice(-6)}
                  </div>
                )}
              </div>
            )}

            {txStatus.state === "error" && (
              <div
                className="w-full text-xs py-1.5 px-2 rounded flex items-center gap-2"
                style={{
                  background: "rgba(255,0,100,0.08)",
                  border: "1px solid rgba(255,0,100,0.3)",
                  color: "#ff0064",
                }}
              >
                <XCircle size={10} />
                <span className="truncate">{txStatus.message}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Bottom: district label ──────────────────────────────────── */}
      <div
        className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 text-xs select-none"
        style={{ fontFamily: "monospace", color: "#1a2233" }}
      >
        DISTRICT-7 SURVEILLANCE ACTIVE
      </div>
    </>
  );
}
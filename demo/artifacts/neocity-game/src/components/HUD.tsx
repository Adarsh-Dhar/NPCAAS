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
import { usePlayerState } from "@/context/PlayerStateContext";
import { PRIMARY_TOKEN_SYMBOL } from "@/lib/token-config";
import {
  emitPlayerEvent,
  getPlayerState,
  recordPaymentProof,
  subscribePlayerState,
  type MissionSnapshot,
} from "@/lib/playerState";
import { worldLoop } from "@/lib/npcWorldLoop";

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

interface UserPaidTxRequest {
  to: string;
  value: string;
  data?: string;
}

interface ExecuteTransactionResult {
  txHash?: string;
  userOpHash?: string;
  mode: string;
  txRequest?: UserPaidTxRequest;
}

type TxStatus =
  | { state: "idle" }
  | { state: "pending" }
  | { state: "success"; txHash?: string; signature?: string; mode: string }
  | { state: "error"; message: string };

export interface HUDProps {
  /** Active NPC id, or null when no chat is open */
  activeNpc: string | null;
  /** Canonical NPC name used for GuildCraft character lookup */
  activeNpcName: string | null;
  pendingTrade: TradeIntent | null;
  /** DB-backed characters currently loaded by the game */
  characters?: Array<{ id: string; name: string }>;
  onRestartSession?: () => void | Promise<void>;
  onTradeExecuted?: (details: {
    txHash?: string;
    signature?: string;
    userOpHash?: string;
    mode: string;
    trade: TradeIntent;
    npcName: string | null;
  }) => void;
}

const REQUIRED_DELIVERIES_TARGET = 3;
const CRATES_MISLABELED_TARGET = 0;

const AEGIS_PRIME_CANONICAL_NAME = "AEGIS_PRIME";
const AEGIS_GATE_TOLL_PRICE = 500;
const AEGIS_GATE_TOLL_CURRENCY = "PYUSD";
const NODE_ALPHA_CANONICAL_NAME = "NODE_ALPHA";
const NODE_ALPHA_ESCROW_PRICE = 5000;
const NODE_ALPHA_ESCROW_CURRENCY = "PYUSD";

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
    };
  }
}

function normalizeNpcNameForMatch(name: string): string {
  return name.trim().toUpperCase().replace(/\s+/g, "_");
}

function isHexAddress(value: unknown): value is string {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value)
}

function normalizeWalletError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }

  const payload = (error && typeof error === "object") ? (error as Record<string, unknown>) : null
  const directMessage = payload && typeof payload.message === "string" ? payload.message : ""
  if (directMessage.trim()) return directMessage

  const nested = payload && payload.error && typeof payload.error === "object"
    ? (payload.error as Record<string, unknown>)
    : null
  const nestedMessage = nested && typeof nested.message === "string" ? nested.message : ""
  if (nestedMessage.trim()) return nestedMessage

  return "Transaction failed"
}

// ---------------------------------------------------------------------------
export function HUD({
  activeNpc,
  activeNpcName,
  pendingTrade,
  characters = [],
  onRestartSession,
  onTradeExecuted,
}: HUDProps) {
  const [walletState, setWalletState] = useState<WalletState | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);
  const [txStatus, setTxStatus] = useState<TxStatus>({ state: "idle" });
  const [sdkActive] = useState(isSdkReady);
  const { credits } = usePlayerState();
  const [mission, setMission] = useState<MissionSnapshot>(() => getPlayerState().mission);
  // Resolved GuildCraft character id for the active NPC
  const [resolvedCharId, setResolvedCharId] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoPromptedEscrowRef = useRef<string | null>(null);

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

  useEffect(() => {
    const unsubscribe = subscribePlayerState((snapshot) => {
      setMission(snapshot.mission);
    });
    return unsubscribe;
  }, []);

  const activeChannelNames = (() => {
    const present = new Set(characters.map((c) => normalizeNpcNameForMatch(c.name)));
    return PROTOCOL_BABEL_NODE_NAMES.filter((name) => present.has(normalizeNpcNameForMatch(name)));
  })();

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
      ) as ExecuteTransactionResult;

      let txHash = result.txHash;
      let userOpHash = result.userOpHash;
      let mode = result.mode;
      let signedTxRequest: UserPaidTxRequest | undefined;
      let senderWallet: string | undefined;

      if (result.mode === "user-paid") {
        const txRequest = result.txRequest;
        signedTxRequest = txRequest;
        if (!txRequest?.to || !txRequest.value) {
          throw new Error("Missing wallet transaction request from server.");
        }
        if (!window.ethereum) {
          throw new Error("No wallet detected. Connect a wallet to pay the toll.");
        }

        await window.ethereum.request({ method: "eth_requestAccounts" });
        const accounts = await window.ethereum.request({ method: "eth_accounts" });
        const from = Array.isArray(accounts) ? accounts.find((entry) => isHexAddress(entry)) : undefined;
        if (!from) {
          throw new Error("Wallet account unavailable. Unlock wallet and retry.");
        }
        senderWallet = from;

        if (!isHexAddress(txRequest.to)) {
          throw new Error("Invalid recipient address in transaction request.");
        }

        const chainId = await window.ethereum.request({ method: "eth_chainId" });
        if (typeof chainId === "string" && chainId.toLowerCase() !== "0x940") {
          throw new Error("Wallet is on the wrong network. Switch to PYUSD Testnet (2368) and retry.");
        }

        const valueHex = `0x${BigInt(txRequest.value).toString(16)}`
        const hash = await window.ethereum.request({
          method: "eth_sendTransaction",
          params: [
            {
              from,
              to: txRequest.to,
              value: valueHex,
              data: txRequest.data ?? "0x",
            },
          ],
        });

        txHash = typeof hash === "string" ? hash : txHash;
        mode = "user-paid";
      }

      const signature = userOpHash ?? txHash;
      const confirmedAt = new Date().toISOString();

      if (txHash || signature) {
        recordPaymentProof({
          txHash,
          signature,
          userOpHash,
          amount: Number(pendingTrade.price),
          currency: String(pendingTrade.currency).toUpperCase(),
          item: pendingTrade.item,
          recipientName: activeNpcName ?? undefined,
          recipientWallet: walletState?.walletAddress,
          senderWallet,
          mode,
          confirmedAt,
        });

        worldLoop.localBroadcast({
          sourceId: "player-wallet",
          sourceName: "PLAYER_WALLET",
          actionType: "PAYMENT_SENT",
          payload: {
            to: activeNpcName ?? "unknown",
            toWallet: walletState?.walletAddress ?? signedTxRequest?.to,
            senderWallet,
            amount: pendingTrade.price,
            currency: String(pendingTrade.currency).toUpperCase(),
            item: pendingTrade.item,
            mode,
            txHash,
            signature,
            userOpHash,
          },
          timestamp: confirmedAt,
        });
      }

      setTxStatus({ state: "success", txHash, signature, mode });

      const isAegisTollPayment =
        !!activeNpcName &&
        normalizeNpcNameForMatch(activeNpcName) === AEGIS_PRIME_CANONICAL_NAME &&
        Number(pendingTrade.price) >= AEGIS_GATE_TOLL_PRICE &&
        String(pendingTrade.currency).toUpperCase() === AEGIS_GATE_TOLL_CURRENCY;

      if (isAegisTollPayment) {
        emitPlayerEvent("FIREWALL_CRACKED");
        window.dispatchEvent(new CustomEvent("FIREWALL_CRACKED"));
        window.dispatchEvent(
          new CustomEvent("aegis-gate-unlocked", {
            detail: {
              npcName: activeNpcName,
              text: "Payment verified. Executing unlock_gate protocol. District-7 firewall disabled.",
              action: "authorizes firewall release",
              worldEvent: "FIREWALL_CRACKED",
            },
          })
        );
      }

      // Refresh balances 2 s after the tx lands
      setTimeout(() => void fetchBalances(), 2000);
      onTradeExecuted?.({
        txHash,
        signature,
        userOpHash,
        mode,
        trade: pendingTrade,
        npcName: activeNpcName,
      });
    } catch (err: unknown) {
      const msg = normalizeWalletError(err);
      setTxStatus({ state: "error", message: msg });
    }
  }, [resolvedCharId, pendingTrade, fetchBalances, onTradeExecuted, activeNpcName, walletState]);

  // Node-Alpha escrow is a mandatory funding gate, so auto-open the wallet
  // prompt when a matching trade intent is detected.
  useEffect(() => {
    if (!resolvedCharId || !pendingTrade) return;
    if (txStatus.state !== "idle") return;

    const normalizedNpc = activeNpcName ? normalizeNpcNameForMatch(activeNpcName) : "";
    const isNodeAlphaEscrow =
      normalizedNpc === NODE_ALPHA_CANONICAL_NAME &&
      Number(pendingTrade.price) >= NODE_ALPHA_ESCROW_PRICE &&
      String(pendingTrade.currency).toUpperCase() === NODE_ALPHA_ESCROW_CURRENCY;

    if (!isNodeAlphaEscrow) return;

    const intentKey = `${normalizedNpc}:${pendingTrade.item}:${pendingTrade.price}:${pendingTrade.currency}`;
    if (autoPromptedEscrowRef.current === intentKey) return;

    autoPromptedEscrowRef.current = intentKey;
    void executeTrade();
  }, [activeNpcName, executeTrade, pendingTrade, resolvedCharId, txStatus.state]);

  const npcColor = activeNpcName
    ? `#${Array.from(activeNpcName).reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 7).toString(16).slice(-6).padStart(6, "0")}`
    : "#00ffff";

  const phaseLabel =
    mission.phase === 1
      ? "Warehouse Floor"
      : mission.phase === 2
        ? "Trading Floor"
        : "Loading Bay";

  return (
    <>
      {/* ── Top-left: game info + controls ─────────────────────────── */}
      <div
        className="absolute top-4 left-4 z-10 text-xs select-none"
        style={{ fontFamily: "monospace" }}
      >
        <div
          className="mb-2 flex items-center gap-2"
          style={{ color: "#67e8f9", letterSpacing: 3 }}
        >
          MIDNIGHT MANIFEST
          {sdkActive && (
            <span
              className="flex items-center gap-1 px-1.5 py-0.5 rounded"
              style={{
                background: "rgba(0,255,255,0.08)",
                border: "1px solid rgba(103,232,249,0.22)",
                color: "#67e8f988",
                fontSize: "8px",
                letterSpacing: 1,
              }}
            >
              <Zap size={7} />
              LIVE
            </span>
          )}
        </div>
        <div style={{ color: "#93c5fd" }}>PHASE {mission.phase}: {phaseLabel}</div>
        <div style={{ color: "#64748b" }}>Read the noise. Move the money.</div>
        <div className="mt-1" style={{ color: "#38bdf8" }}>
          BALANCE: {credits.toLocaleString()} {PRIMARY_TOKEN_SYMBOL}
        </div>
        <div style={{ color: mission.frenzyActive ? "#f472b6" : "#c4b5fd" }}>
          FRENZY: {mission.frenzyActive ? "ACTIVE" : "STANDBY"}
        </div>
        <button
          type="button"
          onClick={() => void onRestartSession?.()}
          disabled={!onRestartSession}
          className="mt-3 inline-flex items-center gap-2 rounded border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.22em] transition"
          style={{
            borderColor: "rgba(103,232,249,0.28)",
            background: onRestartSession ? "rgba(9,12,28,0.92)" : "rgba(9,12,28,0.5)",
            color: onRestartSession ? "#c4b5fd" : "#64748b",
            cursor: onRestartSession ? "pointer" : "not-allowed",
          }}
        >
          <RefreshCw size={10} />
          Restart Session
        </button>
        <div className="mt-3 rounded border border-cyan-300/25 px-2 py-2" style={{ background: "rgba(7,14,30,0.72)" }}>
          <div style={{ color: "#67e8f9", letterSpacing: 2 }}>INVENTORY LEDGER</div>
          <div style={{ color: "#a9ced8" }}>
            chips delivered: {Math.min(mission.chipsDelivered, REQUIRED_DELIVERIES_TARGET)}/{REQUIRED_DELIVERIES_TARGET}
          </div>
          {CRATES_MISLABELED_TARGET > 0 && (
            <div style={{ color: "#a9ced8" }}>
              crates mislabeled: {Math.min(mission.cratesMislabeled, CRATES_MISLABELED_TARGET)}/{CRATES_MISLABELED_TARGET}
            </div>
          )}
          <div style={{ color: mission.briefcaseLocated ? "#c4b5fd" : "#6e7d8e" }}>
            briefcase located: {mission.briefcaseLocated ? "YES" : "NO"}
          </div>
          <div style={{ color: mission.briefcaseTransferred ? "#22d3ee" : "#6e7d8e" }}>
            briefcase transferred: {mission.briefcaseTransferred ? "YES" : "NO"}
          </div>
          <div style={{ color: mission.escapeRouteOpened ? "#22d3ee" : "#6e7d8e" }}>
            tunnel route: {mission.escapeRouteOpened ? "OPEN" : "LOCKED"}
          </div>
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

      {/* ── Top-right: NPC legend + wallet + trade panel ───────────── */}
      <div
        className="absolute top-4 right-4 z-10 text-xs select-none"
        style={{ fontFamily: "monospace" }}
      >
        <div
          className="rounded p-3 mb-3"
          style={{
            background: "rgba(5,5,15,0.92)",
            border: "1px solid rgba(103,232,249,0.22)",
            minWidth: "180px",
          }}
        >
          <div className="text-xs font-bold mb-2" style={{ color: "#67e8f9", letterSpacing: 2 }}>
            THE BAZAAR
          </div>
          <div style={{ color: "#445566" }}>
            <div className="mb-1">ACTIVE CHANNELS</div>
            <div className="text-cyan-300">{activeChannelNames.map((name) => formatNpcDisplayName(name)).join(" · ")}</div>
            <div className="mt-2 text-white/60">TAB — macro dashboard</div>
          </div>
        </div>

        {/* Wallet panel — only when SDK is live and character resolved */}
        {activeNpc && sdkActive && (
          <div
            className="mt-3 rounded p-3 space-y-1"
            style={{
              background: "rgba(5,5,15,0.92)",
              border: `1px solid ${npcColor}66`,
              boxShadow: `0 0 12px ${npcColor}1f`,
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
              border: "1px solid rgba(196,181,253,0.45)",
              boxShadow: "0 0 12px rgba(167,139,250,0.14)",
              minWidth: "180px",
            }}
          >
            <div
              className="text-xs font-bold mb-2 flex items-center gap-1"
              style={{ color: "#c4b5fd", letterSpacing: 2 }}
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
                    ? "rgba(167,139,250,0.2)"
                    : "rgba(167,139,250,0.08)",
                  border: "1px solid rgba(196,181,253,0.6)",
                  color: resolvedCharId ? "#ddd6fe" : "#8b81a888",
                  cursor: resolvedCharId ? "pointer" : "not-allowed",
                }}
                onMouseEnter={(e) => {
                  if (resolvedCharId)
                    (e.currentTarget as HTMLElement).style.background =
                      "rgba(167,139,250,0.32)";
                }}
                onMouseLeave={(e) => {
                  if (resolvedCharId)
                    (e.currentTarget as HTMLElement).style.background =
                      "rgba(167,139,250,0.2)";
                }}
              >
                SIGN &amp; EXECUTE
              </button>
            )}

            {txStatus.state === "pending" && (
              <div
                className="w-full text-xs py-1.5 px-2 rounded flex items-center justify-center gap-2"
                style={{
                  background: "rgba(196,181,253,0.12)",
                  border: "1px solid rgba(196,181,253,0.4)",
                  color: "#ddd6fe",
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
                    background: "rgba(34,211,238,0.12)",
                    border: "1px solid rgba(103,232,249,0.45)",
                    color: "#67e8f9",
                  }}
                >
                  <CheckCircle size={10} />
                  {txStatus.mode === "sponsored"
                    ? "GASLESS SUCCESS"
                    : "SUCCESS"}
                </div>
                {(txStatus.txHash || txStatus.signature) && (
                  <div
                    className="text-xs truncate text-center"
                    style={{ color: "#334455", fontSize: "9px" }}
                  >
                    sig {(txStatus.signature ?? txStatus.txHash ?? '').slice(0, 10)}…
                    {(txStatus.signature ?? txStatus.txHash ?? '').slice(-6)}
                  </div>
                )}
              </div>
            )}

            {txStatus.state === "error" && (
              <div
                className="w-full text-xs py-1.5 px-2 rounded flex items-center gap-2"
                style={{
                  background: "rgba(244,114,182,0.12)",
                  border: "1px solid rgba(244,114,182,0.4)",
                  color: "#f9a8d4",
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
        style={{ fontFamily: "monospace", color: "#334155" }}
      >
        DISTRICT-7 SURVEILLANCE ACTIVE
      </div>
    </>
  );
}
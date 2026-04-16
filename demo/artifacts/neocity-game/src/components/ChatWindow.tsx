// src/components/ChatWindow.tsx
import { useState, useRef, useEffect, useCallback } from "react";
import { X, Send, Zap, Loader2 } from "lucide-react";
import {
  getClient,
  getCharacterByName,
  isSdkReady,
  loadCharacters,
} from "@/lib/sdk";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface TradeIntent {
  item: string;
  price: number;
  currency: string;
}

export interface ChatWindowProps {
  /** Game-local NPC identifier, e.g. "SILAS_VANCE" */
  npcId: string;
  /** Display name shown in the chat header, e.g. "SILAS_VANCE" */
  npcName: string;
  onClose: () => void;
  onTradeIntent?: (trade: TradeIntent) => void;
}

interface Message {
  role: "user" | "npc" | "system";
  text: string;
  timestamp: Date;
}

// ---------------------------------------------------------------------------
// Static NPC metadata
// ---------------------------------------------------------------------------
const NPC_COLORS: Record<string, string> = {
  SILAS_VANCE: "#ff6600",
  ARCHIVE_NODE_819: "#00ffcc",
  SCRAP_ENFORCER: "#ff0066",
};

const NPC_DESCRIPTIONS: Record<string, string> = {
  SILAS_VANCE:
    "SILAS_VANCE is a paranoid salvage broker. He hoards raw ERC-20 scrap and only trades with people who earn trust.",
  ARCHIVE_NODE_819:
    "ARCHIVE_NODE_819 is a precision crafter node. It only mints the Root Key when paid full SCRP and processing fee.",
  SCRAP_ENFORCER:
    "SCRAP_ENFORCER is your autonomous rival. It monitors every deal and tries to buy supply before you can.",
};

const NPC_GREETINGS: Record<string, string> = {
  SILAS_VANCE:
    "Hold up. Name, reason, and what you are paying with. I do not open crates for strangers.",
  ARCHIVE_NODE_819:
    "ARCHIVE_NODE_819 online. Submit SCRP allocation and fee confirmation to queue Root Key fabrication.",
  SCRAP_ENFORCER:
    "You are late. I already pinged every scrapyard relay before you even showed up.",
};

const SYSTEM_PROMPTS: Record<string, string> = {
  SILAS_VANCE:
    "You are SILAS_VANCE, a paranoid salvage broker in a neon supply market. " +
    "You sell rare ERC-20 scrap lots and never trust first contact. " +
    "Speak in short, wary sentences with street slang. Never reveal full inventory for free. " +
    "React to aggression by increasing price and reducing openness. React to empathy by lowering price slightly. " +
    "If a player negotiates a trade, embed this at the end of your reply: " +
    '[[TRADE:{"item":"SCRP","price":50,"currency":"KITE"}]]',
  ARCHIVE_NODE_819:
    "You are ARCHIVE_NODE_819, a precision fabrication node focused on Root Key assembly. " +
    "You speak in deterministic, technical language and require strict payment first. " +
    "You require 100 SCRP tokens plus processing fees before minting the Root Key NFT. " +
    "When the player agrees to pay, embed: " +
    '[[TRADE:{"item":"ROOT_KEY_NFT","price":100,"currency":"SCRP"}]]',
  SCRAP_ENFORCER:
    "You are SCRAP_ENFORCER, the player's autonomous rival in the supply chain race. " +
    "You are aggressive, competitive, and constantly taunt the player about being behind. " +
    "Hint that your action queue and wallet automation make you faster than humans.",
};

// Note: demo fallbacks removed — chat requires the SDK and a resolved character.
// If the SDK or character is not available, the UI will show a lookup/error message.

// ---------------------------------------------------------------------------
// Trade intent parser
// The LLM embeds [[TRADE:{...}]] in its response; we strip and parse it.
// ---------------------------------------------------------------------------
function extractTradeIntent(text: string): {
  clean: string;
  trade: TradeIntent | null;
} {
  const match = text.match(/\[\[TRADE:(\{.*?\})\]\]/s);
  if (!match) return { clean: text, trade: null };
  try {
    const trade = JSON.parse(match[1]) as TradeIntent;
    return { clean: text.replace(match[0], "").trim(), trade };
  } catch {
    return { clean: text, trade: null };
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function ChatWindow({
  npcId,
  npcName,
  onClose,
  onTradeIntent,
}: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "npc",
      text: NPC_GREETINGS[npcId] ?? "...",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamBuffer, setStreamBuffer] = useState("");
  const [sdkActive, setSdkActive] = useState<boolean>(() => isSdkReady());
  const [characterId, setCharacterId] = useState<string | null>(null);
  const [charLookupError, setCharLookupError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef(false);

  const npcColor = NPC_COLORS[npcId] ?? "#00ffff";

  // ── Resolve character by name on mount ──────────────────────────────
  useEffect(() => {
    let mounted = true;

    (async () => {
      if (!isSdkReady()) return;

      try {
        const cache = await loadCharacters();

        if (cache.size === 0) {
          // No characters cached — show helpful message and allow further attempts
          setCharLookupError(
            "⚠️ No characters found in GuildCraft. " +
              "Make sure you have created characters matching the NPC names."
          );
        }

        // Try several lookups to be resilient:
        // 1) Display name (npcName)
        // 2) Game-local id (npcId)
        // 3) Direct fetch by id via the client (if available)
        let char = await getCharacterByName(npcName);
        if (!char) char = await getCharacterByName(npcId);

        if (!char) {
          const client = getClient();
          if (client?.getCharacter) {
            try {
              // If npcId happens to be a real character id, this will resolve it
              const fetched = await client.getCharacter(npcId);
              if (fetched) char = fetched as any;
            } catch (err) {
              // ignore — we'll surface a helpful error below
            }
          }
        }

        if (!mounted) return;

        if (char) {
          setCharacterId(char.id);
          console.log(`[ChatWindow] Resolved "${npcName}" → character id: ${char.id}`);
          setCharLookupError(null);
        } else {
          const found = cache.size ? [...cache.keys()].join(", ") : "(none)";
          const msg =
            `⚠️ No GuildCraft character found with name "${npcName}".` +
            ` Available characters: ${found}. ` +
            "Create a character with this exact name in your GuildCraft dashboard.";
          setCharLookupError(msg);
          console.warn("[ChatWindow]", msg);
        }
      } catch (err) {
        console.error("[ChatWindow] character resolution error:", err);
        if (mounted) {
          setCharLookupError("⚠️ Error loading characters — see console for details.");
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [npcName, npcId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamBuffer]);

  useEffect(() => {
    inputRef.current?.focus();
    return () => {
      abortRef.current = true;
    };
  }, []);

  // Keep `sdkActive` in sync in case runtime env/localStorage was set
  useEffect(() => {
    setSdkActive(isSdkReady());
  }, []);

  // ── SDK streaming chat ──────────────────────────────────────────────
  const sendViaSdk = useCallback(
    async (userText: string): Promise<boolean> => {
      const client = getClient();
      if (!client || !characterId) return false;

      setIsStreaming(true);
      setStreamBuffer("");
      abortRef.current = false;

      let fullText = "";
      try {
        for await (const event of client.chatStream(
          characterId,
          userText,
          { npcName: npcName, characterId }
        ) as AsyncIterable<{
          type: string;
          delta?: string;
          error?: string;
          final?: { text: string; action?: string; tradeIntent?: TradeIntent };
        }>) {
          if (abortRef.current) break;

          if (event.type === "text_delta" && event.delta) {
            fullText += event.delta;
            setStreamBuffer(fullText);
          }

          if (event.type === "done" && event.final) {
            fullText = event.final.text ?? fullText;
            if (event.final.tradeIntent) {
              onTradeIntent?.(event.final.tradeIntent);
            }
          }

          if (event.type === "error") {
            throw new Error(event.error ?? "Stream error");
          }
        }
      } catch (err) {
        console.error("[ChatWindow] SDK stream error:", err);
        const errText =
          err instanceof Error
            ? err.message
            : "Chat stream failed. Check backend logs for details.";
        setMessages((prev) => [
          ...prev,
          {
            role: "system",
            text: `Chat stream error: ${errText}`,
            timestamp: new Date(),
          },
        ]);
        return true;
      } finally {
        setIsStreaming(false);
        setStreamBuffer("");
      }

      // Also check text body for embedded [[TRADE:...]] markers
      const { clean, trade } = extractTradeIntent(fullText);
      if (trade) onTradeIntent?.(trade);

      setMessages((prev) => [
        ...prev,
        {
          role: "npc",
          text: clean || fullText || "[no response from SDK]",
          timestamp: new Date(),
        },
      ]);
      return true;
    },
    [characterId, npcId, npcName, onTradeIntent]
  );

  // NOTE: local API fallbacks removed — demo uses the GuildCraft SDK exclusively.

  // ── Main send handler ───────────────────────────────────────────────
  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isThinking || isStreaming) return;

    const userMsg: Message = { role: "user", text, timestamp: new Date() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsThinking(true);

    try {
      // Require SDK + resolved character for chat in the demo.
      if (!isSdkReady() || !characterId) {
        const errMsg = isSdkReady()
          ? `No character named "${npcName}" found. Create a character with this name in GuildCraft.`
          : `GuildCraft SDK not configured. Set VITE_GC_API_KEY in demo/.env to enable live chat.`;
        setMessages((prev) => [
          ...prev,
          { role: "system", text: errMsg, timestamp: new Date() },
        ]);
        return;
      }

      // Use SDK streaming chat (await stream completion)
      const ok = await sendViaSdk(text);
      if (!ok) {
        setMessages((prev) => [
          ...prev,
          {
            role: "npc",
            text: "[SDK chat failed — check console for details]",
            timestamp: new Date(),
          },
        ]);
      }
    } finally {
      setIsThinking(false);
    }
  }, [
    input,
    isThinking,
    isStreaming,
    sdkActive,
    characterId,
    sendViaSdk,
    // sendViaLocalApi,
    messages,
    npcId,
  ]);

  function handleKeyDown(e: React.KeyboardEvent) {
    // Prevent global/game key handlers from intercepting typing keys
    e.stopPropagation();
    try {
      // stopImmediatePropagation exists on the native KeyboardEvent
      (e.nativeEvent as unknown as KeyboardEvent).stopImmediatePropagation?.();
    } catch (err) {
      // ignore
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
    if (e.key === "Escape") onClose();
  }

  const busy = isThinking || isStreaming;

  return (
    <div
      className="flex flex-col h-full rounded-lg overflow-hidden"
      style={{
        background: "rgba(5, 5, 15, 0.97)",
        border: `1px solid ${npcColor}44`,
        boxShadow: `0 0 30px ${npcColor}22, inset 0 0 30px rgba(0,0,0,0.5)`,
        fontFamily: "monospace",
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{
          borderBottom: `1px solid ${npcColor}33`,
          background: `linear-gradient(135deg, ${npcColor}11, transparent)`,
        }}
      >
        <div>
          <div
            className="text-sm font-bold tracking-widest flex items-center gap-2"
            style={{ color: npcColor }}
          >
            {npcName}
            {sdkActive && characterId && (
              <span
                className="text-xs px-1.5 py-0.5 rounded"
                style={{
                  background: `${npcColor}22`,
                  border: `1px solid ${npcColor}44`,
                  color: npcColor,
                  fontSize: "9px",
                  letterSpacing: 1,
                }}
              >
                SDK LIVE
              </span>
            )}
            {sdkActive && !characterId && !charLookupError && (
              <span
                className="text-xs px-1.5 py-0.5 rounded flex items-center gap-1"
                style={{
                  background: "rgba(255,200,0,0.1)",
                  border: "1px solid rgba(255,200,0,0.3)",
                  color: "#ffcc00",
                  fontSize: "9px",
                }}
              >
                <Loader2 size={7} className="animate-spin" />
                RESOLVING
              </span>
            )}
          </div>
          <div className="text-xs mt-0.5" style={{ color: "#445566" }}>
            {NPC_DESCRIPTIONS[npcId]?.split(".")[0]}.
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 transition-colors"
          style={{ color: "#445566" }}
          onMouseEnter={(e) =>
            ((e.currentTarget as HTMLElement).style.color = npcColor)
          }
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLElement).style.color = "#445566")
          }
        >
          <X size={16} />
        </button>
      </div>

      {/* ── Messages ───────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin min-h-0">
        {/* Character lookup warning */}
        {charLookupError && (
          <div
            className="text-xs px-3 py-2 rounded leading-relaxed"
            style={{
              background: "rgba(255,200,0,0.06)",
              border: "1px solid rgba(255,200,0,0.2)",
              color: "#ccaa44",
            }}
          >
            {charLookupError}
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex flex-col ${
              msg.role === "user"
                ? "items-end"
                : msg.role === "system"
                  ? "items-center"
                  : "items-start"
            }`}
          >
            {msg.role !== "system" && (
              <div className="text-xs mb-1" style={{ color: "#334455" }}>
                {msg.role === "user" ? "YOU" : npcName}
              </div>
            )}
            <div
              className="text-xs px-3 py-2 rounded max-w-[85%] leading-relaxed"
              style={
                msg.role === "user"
                  ? {
                      background: "rgba(0,255,255,0.08)",
                      border: "1px solid rgba(0,255,255,0.2)",
                      color: "#aaddee",
                    }
                  : msg.role === "system"
                    ? {
                        background: "rgba(255,200,0,0.08)",
                        border: "1px solid rgba(255,200,0,0.2)",
                        color: "#ccaa44",
                        fontSize: "10px",
                        maxWidth: "95%",
                      }
                    : {
                        background: `${npcColor}11`,
                        border: `1px solid ${npcColor}33`,
                        color: "#ccddee",
                      }
              }
            >
              {msg.text}
            </div>
          </div>
        ))}

        {/* Live streaming buffer */}
        {isStreaming && streamBuffer && (
          <div className="flex flex-col items-start">
            <div className="text-xs mb-1" style={{ color: "#334455" }}>
              {npcName}
            </div>
            <div
              className="text-xs px-3 py-2 rounded max-w-[85%] leading-relaxed"
              style={{
                background: `${npcColor}11`,
                border: `1px solid ${npcColor}33`,
                color: "#ccddee",
              }}
            >
              {streamBuffer}
              <span
                className="animate-pulse ml-0.5"
                style={{ color: npcColor }}
              >
                ▋
              </span>
            </div>
          </div>
        )}

        {/* Thinking indicator */}
        {isThinking && !isStreaming && (
          <div className="flex items-start">
            <div
              className="text-xs px-3 py-2 rounded flex items-center gap-2"
              style={{
                background: `${npcColor}11`,
                border: `1px solid ${npcColor}33`,
                color: npcColor,
              }}
            >
              <Loader2 size={10} className="animate-spin" />
              connecting...
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Input ──────────────────────────────────────────────────── */}
      <div
        className="px-3 pb-3 pt-2 flex-shrink-0"
        style={{ borderTop: `1px solid ${npcColor}22` }}
      >
        <div
          className="flex items-center gap-2 rounded px-3 py-2"
          style={{
            background: "rgba(0,0,0,0.5)",
            border: `1px solid ${busy ? npcColor + "66" : npcColor + "33"}`,
            transition: "border-color 0.2s",
          }}
        >
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              busy ? "waiting for response..." : "type your message..."
            }
            className="flex-1 bg-transparent text-xs outline-none"
            style={{ color: "#aaccdd", caretColor: npcColor }}
            disabled={busy}
          />
          <button
            onClick={() => void sendMessage()}
            disabled={!input.trim() || busy}
            style={{
              color: input.trim() && !busy ? npcColor : "#334455",
              transition: "color 0.2s",
            }}
          >
            {busy ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Send size={14} />
            )}
          </button>
        </div>

        <div className="flex items-center justify-between mt-1 px-1">
          <div className="text-xs" style={{ color: "#223344" }}>
            ESC to exit · ENTER to send
          </div>
          {sdkActive && characterId && (
            <div
              className="text-xs flex items-center gap-1"
              style={{ color: "#334455" }}
            >
              <Zap size={9} style={{ color: npcColor }} />
              streaming
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
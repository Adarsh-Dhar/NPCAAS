// src/components/ChatWindow.tsx
import { useState, useRef, useEffect, useCallback } from "react";
import { X, Send, Zap, Loader2 } from "lucide-react";
import { getClient, getCharacterId, isSdkReady } from "@/lib/sdk";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Message {
  role: "user" | "npc" | "system";
  text: string;
  timestamp: Date;
}

export interface TradeIntent {
  item: string;
  price: number;
  currency: string;
}

export interface ChatWindowProps {
  npcId: string;
  npcName: string;
  onClose: () => void;
  onTradeIntent?: (trade: TradeIntent) => void;
}

// ---------------------------------------------------------------------------
// Static NPC metadata
// ---------------------------------------------------------------------------
const NPC_COLORS: Record<string, string> = {
  scrap:    "#ff6600",
  cipher:   "#00ffcc",
  enforcer: "#ff0066",
};

const NPC_DESCRIPTIONS: Record<string, string> = {
  scrap:
    "SCRAP is a paranoid scavenger. He has rare materials but doesn't trust easily.",
  cipher:
    "CIPHER is a cold, precise crafter. She speaks in calculations and requires payment upfront.",
  enforcer:
    "THE ENFORCER is your rival. He's watching every move you make.",
};

const SYSTEM_PROMPTS: Record<string, string> = {
  scrap:
    "You are SCRAP, a paranoid underground scavenger in a cyberpunk city. " +
    "You deal in rare ERC-20 materials. You are suspicious of everyone but can be won over. " +
    "Speak in short, terse sentences. Use slang. Never give information freely. " +
    "React to aggression by raising prices. React to empathy by warming up slightly. " +
    "If a player asks to buy materials, respond with a tradeIntent JSON block at the end like: " +
    '[[TRADE:{"item":"SCRP","price":50,"currency":"KITE"}]]',
  cipher:
    "You are CIPHER, a precise AI-augmented crafter. " +
    "You speak in cold, calculated terms. You charge heavy fees. " +
    "You require raw material tokens before crafting the Root Key NFT. " +
    "If player has enough SCRP tokens, respond with a tradeIntent like: " +
    '[[TRADE:{"item":"ROOT_KEY_NFT","price":100,"currency":"SCRP"}]]',
  enforcer:
    "You are THE ENFORCER, the player's main rival. " +
    "You are aggressive, competitive, and enjoy taunting the player. " +
    "Hint that you are always one step ahead. Use intimidation.",
};

const NPC_GREETINGS: Record<string, string> = {
  scrap:
    "...you got three seconds before I raise my hood. What do you want.",
  cipher:
    "Connection established. State your purpose and transfer amount. I don't do small talk.",
  enforcer:
    "Heh. You're still chasing the Root Key? I'm already three trades ahead of you. Good luck.",
};

// ---------------------------------------------------------------------------
// Fallbacks (used when SDK is not configured or request fails)
// ---------------------------------------------------------------------------
const FALLBACK_RESPONSES: Record<string, string[]> = {
  scrap: [
    "...don't like repeating myself. You want the goods or not?",
    "Quiet. I'm thinking.",
    "Watch your tone. I got eyes everywhere.",
    "Maybe. Maybe not. Depends on what you got.",
  ],
  cipher: [
    "Insufficient data. Elaborate.",
    "Transaction pending. Awaiting confirmation.",
    "Computation in progress. Stand by.",
    "Your parameters are unclear. Be precise.",
  ],
  enforcer: [
    "Hah. You think that matters?",
    "Keep talking. I've already made my move.",
    "You're running out of time. I'm not.",
    "Cute strategy. Shame it won't work.",
  ],
};

function randomFallback(npcId: string): string {
  const opts = FALLBACK_RESPONSES[npcId] ?? ["..."];
  return opts[Math.floor(Math.random() * opts.length)];
}

// ---------------------------------------------------------------------------
// Trade intent parser
// Parses [[TRADE:{...}]] markers that the LLM embeds in its response
// ---------------------------------------------------------------------------
function extractTradeIntent(
  text: string
): { clean: string; trade: TradeIntent | null } {
  const match = text.match(/\[\[TRADE:(\{.*?\})\]\]/s);
  if (!match) return { clean: text, trade: null };
  try {
    const trade = JSON.parse(match[1]) as TradeIntent;
    const clean = text.replace(match[0], "").trim();
    return { clean, trade };
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
  const [sdkActive] = useState(isSdkReady);
  const [streamBuffer, setStreamBuffer] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<boolean>(false);

  const npcColor = NPC_COLORS[npcId] ?? "#00ffff";

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamBuffer]);

  useEffect(() => {
    inputRef.current?.focus();
    return () => {
      abortRef.current = true;
    };
  }, []);

  // ── SDK streaming chat ──────────────────────────────────────────────────
  const sendViaSdk = useCallback(
    async (userText: string) => {
      const client = getClient();
      if (!client) return false;

      const characterId = getCharacterId(npcId);
      if (characterId.startsWith("REPLACE_WITH")) {
        addSystemMessage(
          `⚠️ NPC character ID not configured for "${npcId}". ` +
            "Set VITE_NPC_ID_SCRAP / VITE_NPC_ID_CIPHER / VITE_NPC_ID_ENFORCER in your .env"
        );
        return false;
      }

      setIsStreaming(true);
      setStreamBuffer("");
      abortRef.current = false;

      let fullText = "";
      try {
        for await (const event of client.chatStream(characterId, userText)) {
          if (abortRef.current) break;

          if (event.type === "text_delta" && event.delta) {
            fullText += event.delta;
            setStreamBuffer(fullText);
          }

          if (event.type === "done" && event.final) {
            fullText = event.final.text ?? fullText;
            // Check for trade intent from SDK-level extraction
            if (event.final.tradeIntent) {
              onTradeIntent?.(event.final.tradeIntent as TradeIntent);
            }
          }

          if (event.type === "error") {
            throw new Error(event.error ?? "Stream error");
          }
        }
      } catch (err) {
        console.error("[ChatWindow] SDK stream error:", err);
        // Fall through to local fallback
        return false;
      } finally {
        setIsStreaming(false);
        setStreamBuffer("");
      }

      // Also check text for embedded [[TRADE:...]] markers
      const { clean, trade } = extractTradeIntent(fullText);
      if (trade) onTradeIntent?.(trade);

      setMessages((prev) => [
        ...prev,
        { role: "npc", text: clean || fullText, timestamp: new Date() },
      ]);
      return true;
    },
    [npcId, onTradeIntent]
  );

  // ── Local API fallback ──────────────────────────────────────────────────
  const sendViaLocalApi = useCallback(
    async (userText: string, history: Message[]) => {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          npcId,
          message: userText,
          systemPrompt: SYSTEM_PROMPTS[npcId],
          history: history.map((m) => ({
            role: m.role === "user" ? "user" : "assistant",
            content: m.text,
          })),
        }),
      });
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = (await res.json()) as {
        response?: string;
        message?: string;
        tradeIntent?: TradeIntent;
      };
      const text = data.response ?? data.message ?? "...";
      if (data.tradeIntent) onTradeIntent?.(data.tradeIntent);
      const { clean, trade } = extractTradeIntent(text);
      if (trade) onTradeIntent?.(trade);
      return clean || text;
    },
    [npcId, onTradeIntent]
  );

  function addSystemMessage(text: string) {
    setMessages((prev) => [
      ...prev,
      { role: "system", text, timestamp: new Date() },
    ]);
  }

  // ── Main send handler ───────────────────────────────────────────────────
  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isThinking || isStreaming) return;

    const userMsg: Message = { role: "user", text, timestamp: new Date() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsThinking(true);

    try {
      // Try SDK first (streaming)
      if (sdkActive) {
        const ok = await sendViaSdk(text);
        if (ok) return;
      }

      // Fallback to local API server
      const currentMessages = [...messages, userMsg];
      try {
        const reply = await sendViaLocalApi(text, currentMessages);
        setMessages((prev) => [
          ...prev,
          { role: "npc", text: reply, timestamp: new Date() },
        ]);
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            role: "npc",
            text: randomFallback(npcId),
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
    sendViaSdk,
    sendViaLocalApi,
    messages,
    npcId,
  ]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
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
      {/* Header */}
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
            {sdkActive && (
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

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin min-h-0">
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
              <span className="animate-pulse ml-1" style={{ color: npcColor }}>
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
              <span>connecting...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
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
            placeholder={busy ? "waiting for response..." : "type your message..."}
            className="flex-1 bg-transparent text-xs outline-none"
            style={{ color: "#aaccdd", caretColor: npcColor }}
            disabled={busy}
          />
          <button
            onClick={sendMessage}
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
          {sdkActive && (
            <div
              className="text-xs flex items-center gap-1"
              style={{ color: "#334455" }}
            >
              <Zap size={9} style={{ color: npcColor }} />
              <span>streaming</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
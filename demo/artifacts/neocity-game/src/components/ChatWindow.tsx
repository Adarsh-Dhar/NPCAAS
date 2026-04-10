import { useState, useRef, useEffect } from "react";
import { X, Send } from "lucide-react";

interface Message {
  role: "user" | "npc";
  text: string;
  timestamp: Date;
}

interface ChatWindowProps {
  npcId: string;
  npcName: string;
  onClose: () => void;
}

const NPC_DESCRIPTIONS: Record<string, string> = {
  scrap:
    "SCRAP is a paranoid scavenger. He has rare materials but doesn't trust easily. Build rapport before negotiating.",
  cipher:
    "CIPHER is a cold, precise crafter. She speaks in calculations and requires payment upfront.",
  enforcer:
    "THE ENFORCER is your rival. He's watching every move you make. Tread carefully.",
};

const NPC_COLORS: Record<string, string> = {
  scrap: "#ff6600",
  cipher: "#00ffcc",
  enforcer: "#ff0066",
};

const SYSTEM_PROMPTS: Record<string, string> = {
  scrap:
    "You are SCRAP, a paranoid underground scavenger in a cyberpunk city. You deal in rare ERC-20 materials and cryptographic components. You are suspicious of everyone but can be won over with good conversation. Speak in short, terse sentences. Use slang. Never give information freely - make them work for it. React to aggression by raising prices. React to empathy by warming up slightly.",
  cipher:
    "You are CIPHER, a precise AI-augmented crafter in a neon-lit cyberpunk district. You speak in cold, calculated terms. You charge heavy fees and don't negotiate. You require raw material tokens before crafting the Root Key NFT. Be formal, technical, and clinical.",
  enforcer:
    "You are THE ENFORCER, the player's main rival. You are also trying to acquire the Root Key. You are aggressive, competitive, and enjoy taunting the player. Hint that you are always one step ahead. Use intimidation.",
};

export function ChatWindow({ npcId, npcName, onClose }: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "npc",
      text: getNpcGreeting(npcId),
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const npcColor = NPC_COLORS[npcId] || "#00ffff";

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function getNpcGreeting(id: string): string {
    const greetings: Record<string, string> = {
      scrap:
        "...you got three seconds before I raise my hood. What do you want.",
      cipher:
        "Connection established. State your purpose and transfer amount. I don't do small talk.",
      enforcer:
        "Heh. You're still chasing the Root Key? I'm already three trades ahead of you. Good luck.",
    };
    return greetings[id] || "...";
  }

  async function sendMessage() {
    if (!input.trim() || isThinking) return;

    const userMsg: Message = {
      role: "user",
      text: input.trim(),
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsThinking(true);

    try {
      const history = messages.map((m) => ({
        role: m.role === "user" ? "user" : "assistant",
        content: m.text,
      }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          npcId,
          message: userMsg.text,
          systemPrompt: SYSTEM_PROMPTS[npcId],
          history,
        }),
      });

      if (!res.ok) throw new Error("API error");

      const data = await res.json();
      const npcMsg: Message = {
        role: "npc",
        text: data.response || data.message || "...",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, npcMsg]);
    } catch {
      const fallback: Message = {
        role: "npc",
        text: getFallbackResponse(npcId),
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, fallback]);
    } finally {
      setIsThinking(false);
    }
  }

  function getFallbackResponse(id: string): string {
    const responses: Record<string, string[]> = {
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
    const opts = responses[id] || ["..."];
    return opts[Math.floor(Math.random() * opts.length)];
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") sendMessage();
    if (e.key === "Escape") onClose();
  }

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
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{
          borderBottom: `1px solid ${npcColor}33`,
          background: `linear-gradient(135deg, ${npcColor}11, transparent)`,
        }}
      >
        <div>
          <div
            className="text-sm font-bold tracking-widest"
            style={{ color: npcColor }}
          >
            {npcName}
          </div>
          <div className="text-xs" style={{ color: "#445566" }}>
            {NPC_DESCRIPTIONS[npcId]?.split(".")[0]}.
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 transition-colors"
          style={{ color: "#445566" }}
          onMouseEnter={(e) =>
            ((e.target as HTMLElement).style.color = npcColor)
          }
          onMouseLeave={(e) =>
            ((e.target as HTMLElement).style.color = "#445566")
          }
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
          >
            <div
              className="text-xs mb-1"
              style={{ color: "#334455" }}
            >
              {msg.role === "user" ? "YOU" : npcName}
            </div>
            <div
              className="text-xs px-3 py-2 rounded max-w-[85%] leading-relaxed"
              style={
                msg.role === "user"
                  ? {
                      background: "rgba(0, 255, 255, 0.08)",
                      border: "1px solid rgba(0, 255, 255, 0.2)",
                      color: "#aaddee",
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
        {isThinking && (
          <div className="flex items-start">
            <div
              className="text-xs px-3 py-2 rounded"
              style={{
                background: `${npcColor}11`,
                border: `1px solid ${npcColor}33`,
                color: npcColor,
              }}
            >
              <span className="animate-pulse">thinking...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div
        className="px-3 pb-3 pt-2"
        style={{ borderTop: `1px solid ${npcColor}22` }}
      >
        <div
          className="flex items-center gap-2 rounded px-3 py-2"
          style={{
            background: "rgba(0,0,0,0.5)",
            border: `1px solid ${npcColor}33`,
          }}
        >
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="type your message..."
            className="flex-1 bg-transparent text-xs outline-none"
            style={{ color: "#aaccdd", caretColor: npcColor }}
            disabled={isThinking}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || isThinking}
            style={{ color: input.trim() ? npcColor : "#334455" }}
          >
            <Send size={14} />
          </button>
        </div>
        <div className="text-xs mt-1 text-center" style={{ color: "#223344" }}>
          ESC to exit · ENTER to send
        </div>
      </div>
    </div>
  );
}

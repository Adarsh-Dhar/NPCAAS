import { Router } from "express";

const router = Router();

const NPC_FALLBACK_LINES: Record<string, string[]> = {
  scrap: [
    "...watch yourself. I got eyes on every corner of this block.",
    "Maybe I got what you need. Maybe I don't. Depends on your credits.",
    "You think I trust just anyone who walks up? Think again.",
    "Materials cost more when you waste my time.",
    "I heard the Enforcer's already been sniffin' around. You better hurry.",
  ],
  cipher: [
    "Transaction parameters received. Processing fee: 0.05 ETH. Confirm to proceed.",
    "Your input lacks precision. Provide exact token quantities.",
    "The Root Key mint requires 100 RAW tokens transferred to address 0xC1PH3R.",
    "Computation cycle: 2.3 seconds. Your request is in queue.",
    "Emotional appeals are inefficient. Speak in numbers.",
  ],
  enforcer: [
    "I was at Scrap's stall an hour ago. Already bought half his stock.",
    "You're still talking while I'm already moving. Cute.",
    "The Root Key? Oh you mean the one I'll have by end of cycle? Yeah.",
    "Every second you spend talking, I spend acting. Do the math.",
    "I've been watching your moves. Predictable. Amateur.",
  ],
};

router.post("/chat", async (req, res) => {
  const { npcId, message, systemPrompt, history } = req.body;

  if (!message || !npcId) {
    return res.status(400).json({ error: "Missing npcId or message" });
  }

  const fallbackLines = NPC_FALLBACK_LINES[npcId] || ["..."];
  const fallbackResponse =
    fallbackLines[Math.floor(Math.random() * fallbackLines.length)];

  res.json({
    response: fallbackResponse,
    npcId,
    timestamp: new Date().toISOString(),
  });
});

export default router;

'use client'

import { useState } from 'react'
import RetroButton from '@/components/ui/RetroButton'

interface ExportModalProps {
  isOpen: boolean
  onClose: () => void
}

const codeSnippet = `import { GuildCraft } from '@guildcraft/sdk';

const npc = await GuildCraft.summon({
  apiKey: "gc_live_9a8b7c6...",
  npcId: "char_cm28x9...",
  environment: "Kite_Mainnet"
});

// Attach to game engine player proximity event
npc.on("player_approach", (player) => {
  npc.speak("Welcome to my forge.");
});`

export default function ExportModal({ isOpen, onClose }: ExportModalProps) {
  const [copied, setCopied] = useState(false)

  const handleCopyToClipboard = () => {
    navigator.clipboard.writeText(codeSnippet)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 p-4">
      {/* Modal Container */}
      <div className="w-full max-w-2xl border-4 border-purple-500 bg-black p-8 shadow-[8px_8px_0px_0px_rgba(168,85,247,1)]">
        {/* Header */}
        <div className="mb-6 pb-4 border-b-4 border-purple-500">
          <h2 className="text-2xl font-bold text-white uppercase">
            INTEGRATE NPC TO GAME ENGINE
          </h2>
          <p className="text-purple-300 text-xs uppercase font-bold mt-2">
            Copy this SDK code to your game project
          </p>
        </div>

        {/* Code Block */}
        <div className="bg-slate-950 border-4 border-blue-400 p-6 mb-6 overflow-x-auto">
          <pre className="font-mono text-xs text-blue-300 whitespace-pre-wrap break-words">
            {codeSnippet}
          </pre>
        </div>

        {/* Footer with Actions */}
        <div className="flex gap-4 justify-end">
          <RetroButton
            variant="blue"
            size="md"
            onClick={onClose}
            className="text-sm"
          >
            CLOSE
          </RetroButton>
          <RetroButton
            variant={copied ? 'blue' : 'purple'}
            size="md"
            onClick={handleCopyToClipboard}
            className="text-sm"
          >
            {copied ? 'COPIED!' : 'COPY TO CLIPBOARD'}
          </RetroButton>
        </div>
      </div>
    </div>
  )
}

'use client'

import DemoAgent from '@/components/creator/DemoAgent'
import Terminal from '@/components/creator/Terminal'

interface LeftPanelProps {
  characterId?: string
}

export default function LeftPanel({ characterId }: LeftPanelProps) {
  return (
    <div className="border-r-4 border-white bg-black flex flex-col h-screen sticky top-0">
      {/* Top Half - Demo Agent */}
      <div className="flex-1 overflow-y-auto p-4 border-b-4 border-white">
        <DemoAgent />
      </div>

      {/* Bottom Half - Terminal */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col">
        <Terminal characterId={characterId} />
      </div>
    </div>
  )
}

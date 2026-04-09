'use client'

import { useState } from 'react'
import DemoAgent from '@/components/creator/DemoAgent'
import Terminal from '@/components/creator/Terminal'

interface LeftPanelProps {
  characterId?: string
}

export default function LeftPanel({ characterId }: LeftPanelProps) {
  // Lifted state: Terminal emits actions, DemoAgent consumes them
  const [currentAction, setCurrentAction] = useState<string>('')

  return (
    <div className="border-r-4 border-white bg-black flex flex-col h-screen sticky top-0">
      {/* Top Half - Animated Demo Agent */}
      <div className="flex-1 overflow-y-auto p-4 border-b-4 border-white">
        <DemoAgent currentAction={currentAction} />
      </div>

      {/* Bottom Half - Terminal Chat */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col">
        <Terminal
          characterId={characterId}
          onAction={setCurrentAction}
        />
      </div>
    </div>
  )
}
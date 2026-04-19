'use client'

import { useEffect, useState } from 'react'

interface Activity {
  id: string
  timestamp: string
  agent: string
  role: string
  action: string
}

interface NpcSystemEventDetail {
  eventName?: string
  npcName?: string
}

const MAX_EVENTS = 50

function toTimestamp(date: Date): string {
  return date.toTimeString().slice(0, 8)
}

function describeEvent(eventName: string): string {
  if (eventName === 'BRIEFCASE_LOCATED') {
    return 'briefcase location confirmed'
  }
  if (eventName === 'BRIEFCASE_TRANSFERRED') {
    return 'briefcase transfer confirmed'
  }
  return eventName.replace(/_/g, ' ').toLowerCase()
}

export default function ActivityFeed() {
  const [activities, setActivities] = useState<Activity[]>([])

  useEffect(() => {
    const handleNpcSystemEvent = (event: Event) => {
      const detail = (event as CustomEvent<NpcSystemEventDetail>).detail
      if (!detail?.eventName) return

      const now = new Date()
      const agentName = typeof detail.npcName === 'string' && detail.npcName.trim()
        ? detail.npcName
        : 'SYSTEM'

      setActivities((prev) => [
        {
          id: `${now.getTime()}-${detail.eventName}`,
          timestamp: toTimestamp(now),
          agent: agentName,
          role: 'World Event',
          action: describeEvent(detail.eventName),
        },
        ...prev,
      ].slice(0, MAX_EVENTS))
    }

    window.addEventListener('NPC_SYSTEM_EVENT', handleNpcSystemEvent)
    return () => window.removeEventListener('NPC_SYSTEM_EVENT', handleNpcSystemEvent)
  }, [])

  return (
    <div className="border-4 border-blue-400 bg-black rounded-none max-h-96 overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 bg-black border-b-4 border-blue-400 px-4 py-3 z-10">
        <h3 className="text-sm font-bold text-white uppercase">
          AGENTIC ACTIVITY FEED
        </h3>
        <p className="text-xs text-blue-400 mt-1">
          Real-time autonomous actions on PYUSD Network
        </p>
      </div>

      {/* Activity Rows */}
      <div className="space-y-0">
        {activities.map((activity, idx) => (
          <div
            key={activity.id}
            className={`px-4 py-3 border-b border-gray-700 ${
              idx % 2 === 0 ? 'bg-gray-950' : 'bg-black'
            } hover:bg-gray-800 transition-colors`}
          >
            {/* Timestamp and Agent Name */}
            <div className="flex items-start gap-3 font-mono text-xs">
              <span className="text-blue-700 flex-shrink-0 w-12">
                [{activity.timestamp}]
              </span>
              <span className="text-blue-300 font-bold flex-shrink-0 min-w-fit">
                {activity.agent}
              </span>
              <span className="text-gray-500">({activity.role})</span>
            </div>

            {/* Action Description */}
            <div className="ml-16 mt-1 font-mono text-xs text-purple-300">
              {activity.action}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="sticky bottom-0 bg-black border-t-4 border-blue-400 px-4 py-2">
        <p className="text-xs text-blue-400 font-mono">
          {activities.length} recent events • live monitoring enabled
        </p>
      </div>
    </div>
  )
}

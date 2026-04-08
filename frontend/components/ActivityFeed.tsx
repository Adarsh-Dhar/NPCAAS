'use client'

import { useMemo } from 'react'

interface Activity {
  id: string
  timestamp: string
  agent: string
  role: string
  action: string
}

const mockActivities: Activity[] = [
  {
    id: '1',
    timestamp: '08:14:02',
    agent: 'Thorin',
    role: 'Blacksmith',
    action: 'executed Swap: 10 KITE_USD for 5 Iron Ore',
  },
  {
    id: '2',
    timestamp: '08:16:45',
    agent: 'Elara',
    role: 'Merchant',
    action: 'called function: craftPotion(). Gas Sponsored',
  },
  {
    id: '3',
    timestamp: '08:22:11',
    agent: 'Guard_01',
    role: 'Sentinel',
    action: 'updated pricing algorithm based on low inventory',
  },
  {
    id: '4',
    timestamp: '08:25:33',
    agent: 'Mage_Crystal',
    role: 'Enchanter',
    action: 'executed Trade: 100 Mana Crystals for 250 Gold',
  },
  {
    id: '5',
    timestamp: '08:31:17',
    agent: 'Zephyr',
    role: 'Scout',
    action: 'discovered new market: Rare Herb Vendor at coords [42, 156]',
  },
  {
    id: '6',
    timestamp: '08:38:22',
    agent: 'Thorin',
    role: 'Blacksmith',
    action: 'approved PayMaster sponsorship for batch transaction (gas: 0.45 KITE)',
  },
  {
    id: '7',
    timestamp: '08:45:09',
    agent: 'Elara',
    role: 'Merchant',
    action: 'negotiated bulk deal: 500 units @ 8.5 KITE_USD each',
  },
  {
    id: '8',
    timestamp: '08:52:44',
    agent: 'Guard_01',
    role: 'Sentinel',
    action: 'detected suspicious activity: initiated fraud detection protocol',
  },
  {
    id: '9',
    timestamp: '09:01:15',
    agent: 'Mage_Crystal',
    role: 'Enchanter',
    action: 'created NFT enchantment: "Blade of the Lost King" for 0xA2f8...',
  },
  {
    id: '10',
    timestamp: '09:08:33',
    agent: 'Zephyr',
    role: 'Scout',
    action: 'completed mission: gathered intel on competitor pricing strategies',
  },
]

export default function ActivityFeed() {
  // Reverse to show newest first
  const sortedActivities = useMemo(
    () => [...mockActivities].reverse(),
    []
  )

  return (
    <div className="border-4 border-cyan-400 bg-black rounded-none max-h-96 overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 bg-black border-b-4 border-cyan-400 px-4 py-3 z-10">
        <h3 className="text-sm font-bold text-white uppercase">
          AGENTIC ACTIVITY FEED
        </h3>
        <p className="text-xs text-cyan-400 mt-1">
          Real-time autonomous actions on Kite Chain
        </p>
      </div>

      {/* Activity Rows */}
      <div className="space-y-0">
        {sortedActivities.map((activity, idx) => (
          <div
            key={activity.id}
            className={`px-4 py-3 border-b border-gray-700 ${
              idx % 2 === 0 ? 'bg-gray-950' : 'bg-black'
            } hover:bg-gray-800 transition-colors`}
          >
            {/* Timestamp and Agent Name */}
            <div className="flex items-start gap-3 font-mono text-xs">
              <span className="text-green-700 flex-shrink-0 w-12">
                [{activity.timestamp}]
              </span>
              <span className="text-green-400 font-bold flex-shrink-0 min-w-fit">
                {activity.agent}
              </span>
              <span className="text-gray-500">({activity.role})</span>
            </div>

            {/* Action Description */}
            <div className="ml-16 mt-1 font-mono text-xs text-green-400">
              {activity.action}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="sticky bottom-0 bg-black border-t-4 border-cyan-400 px-4 py-2">
        <p className="text-xs text-cyan-400 font-mono">
          {sortedActivities.length} recent events • live monitoring enabled
        </p>
      </div>
    </div>
  )
}

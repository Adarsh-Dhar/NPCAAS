'use client'

import { useState } from 'react'
import TopNav from '@/components/TopNav'
import RetroButton from '@/components/ui/RetroButton'

interface NPC {
  id: string
  name: string
  role: string
  status: 'online' | 'sleeping'
  wallet: string
  balance: string
  trades: number
}

const mockNPCs: NPC[] = [
  {
    id: '1',
    name: 'Thorin',
    role: 'Blacksmith',
    status: 'online',
    wallet: '0x2A8f...91c2',
    balance: '$450.00 KITE',
    trades: 24,
  },
  {
    id: '2',
    name: 'Elara',
    role: 'Merchant',
    status: 'online',
    wallet: '0x5B3d...7e44',
    balance: '$1,230.00 KITE',
    trades: 67,
  },
  {
    id: '3',
    name: 'Guard_01',
    role: 'Sentinel',
    status: 'sleeping',
    wallet: '0x9c1e...5f88',
    balance: '$89.50 KITE',
    trades: 12,
  },
  {
    id: '4',
    name: 'Mage_Crystal',
    role: 'Enchanter',
    status: 'online',
    wallet: '0x4F7a...3b19',
    balance: '$2,100.00 KITE',
    trades: 156,
  },
  {
    id: '5',
    name: 'Zephyr',
    role: 'Scout',
    status: 'sleeping',
    wallet: '0x8d2c...9a07',
    balance: '$320.75 KITE',
    trades: 38,
  },
]

export default function FleetPage() {
  const [npcs, setNpcs] = useState(mockNPCs)

  const handleKillSwitch = (id: string) => {
    alert(`KILL SWITCH activated for NPC: ${npcs.find((n) => n.id === id)?.name}`)
  }

  const totalBalance = npcs.reduce((sum, npc) => {
    const amount = parseFloat(npc.balance.replace(/[$,]/g, ''))
    return sum + amount
  }, 0)

  const totalTrades = npcs.reduce((sum, npc) => sum + npc.trades, 0)
  const onlineCount = npcs.filter((n) => n.status === 'online').length

  return (
    <div className="min-h-screen bg-black text-white">
      <TopNav />

      <main className="p-8 max-w-7xl mx-auto">
        {/* Page Title */}
        <div className="mb-8">
          <h1 className="gradient-text gradient-cyan-magenta text-4xl font-bold mb-2">
            NPC FLEET DASHBOARD
          </h1>
          <p className="text-cyan-400 text-sm uppercase font-bold">
            Real-time management and monitoring
          </p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-6 mb-8">
          {/* Card 1: Total Active Agents */}
          <div className="retro-card-cyan border-4 border-cyan-400 p-6">
            <p className="text-xs text-cyan-400 uppercase font-bold mb-2">
              TOTAL ACTIVE AGENTS
            </p>
            <p className="text-3xl font-bold text-white">{onlineCount}</p>
            <p className="text-xs text-gray-400 mt-2">
              out of {npcs.length} deployed
            </p>
          </div>

          {/* Card 2: Total AI API Calls */}
          <div className="retro-card-magenta border-4 border-pink-400 p-6">
            <p className="text-xs text-pink-400 uppercase font-bold mb-2">
              TOTAL AI API CALLS
            </p>
            <p className="text-3xl font-bold text-white">
              {totalTrades * 7}
            </p>
            <p className="text-xs text-gray-400 mt-2">
              trade queries processed
            </p>
          </div>

          {/* Card 3: Network Volume */}
          <div className="retro-card-yellow border-4 border-yellow-400 p-6">
            <p className="text-xs text-yellow-400 uppercase font-bold mb-2">
              NETWORK VOLUME
            </p>
            <p className="text-3xl font-bold text-white">
              ${totalBalance.toFixed(2)}
            </p>
            <p className="text-xs text-gray-400 mt-2">
              KITE in treasury
            </p>
          </div>
        </div>

        {/* Data Table */}
        <div className="border-4 border-white bg-black overflow-x-auto">
          <table className="w-full font-mono text-sm">
            {/* Header */}
            <thead className="border-b-4 border-white">
              <tr className="bg-gray-900">
                <th className="px-4 py-3 text-left border-r-2 border-gray-700">
                  NPC NAME & ROLE
                </th>
                <th className="px-4 py-3 text-left border-r-2 border-gray-700">
                  STATUS
                </th>
                <th className="px-4 py-3 text-left border-r-2 border-gray-700">
                  WALLET ADDRESS
                </th>
                <th className="px-4 py-3 text-left border-r-2 border-gray-700">
                  TREASURY BALANCE
                </th>
                <th className="px-4 py-3 text-left border-r-2 border-gray-700">
                  TOTAL TRADES
                </th>
                <th className="px-4 py-3 text-left">ACTIONS</th>
              </tr>
            </thead>

            {/* Body */}
            <tbody>
              {npcs.map((npc, idx) => (
                <tr
                  key={npc.id}
                  className={
                    idx % 2 === 0 ? 'bg-gray-950' : 'bg-black border-b border-gray-700'
                  }
                >
                  <td className="px-4 py-3 border-r-2 border-gray-700">
                    <span className="text-white font-bold">{npc.name}</span>
                    <span className="text-gray-400 text-xs ml-2">
                      / {npc.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 border-r-2 border-gray-700">
                    <span
                      className={
                        npc.status === 'online'
                          ? 'text-green-400 font-bold animate-pulse'
                          : 'text-gray-500'
                      }
                    >
                      {npc.status === 'online' ? '[ ONLINE ]' : '[ SLEEPING ]'}
                    </span>
                  </td>
                  <td className="px-4 py-3 border-r-2 border-gray-700 text-cyan-400">
                    {npc.wallet}
                  </td>
                  <td className="px-4 py-3 border-r-2 border-gray-700 text-yellow-400">
                    {npc.balance}
                  </td>
                  <td className="px-4 py-3 border-r-2 border-gray-700 text-white">
                    {npc.trades}
                  </td>
                  <td className="px-4 py-3">
                    <RetroButton
                      variant="red"
                      size="sm"
                      onClick={() => handleKillSwitch(npc.id)}
                      className="text-xs"
                    >
                      KILL SWITCH
                    </RetroButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  )
}

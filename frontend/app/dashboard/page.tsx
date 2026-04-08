'use client'

import { useState } from 'react'
import TopNav from '@/components/TopNav'
import ActivityFeed from '@/components/ActivityFeed'
import ExportModal from '@/components/ExportModal'
import RetroButton from '@/components/ui/RetroButton'

export default function DashboardPage() {
  const [showExportModal, setShowExportModal] = useState(false)

  return (
    <div className="min-h-screen bg-black text-white">
      <TopNav />

      <main className="p-8 max-w-7xl mx-auto">
        {/* Page Title */}
        <div className="mb-8">
          <h1 className="gradient-text gradient-cyan-magenta text-4xl font-bold mb-2">
            DEVELOPER DASHBOARD
          </h1>
          <p className="text-cyan-400 text-sm uppercase font-bold">
            Monitor agents and export SDK
          </p>
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-3 gap-6">
          {/* Left: Activity Feed (2 columns) */}
          <div className="col-span-2">
            <ActivityFeed />
          </div>

          {/* Right: Quick Actions */}
          <div className="flex flex-col gap-4">
            {/* Export SDK Card */}
            <div className="border-4 border-magenta-500 bg-black p-6">
              <h3 className="text-sm font-bold text-white uppercase mb-3">
                Export SDK
              </h3>
              <p className="text-xs text-gray-400 mb-4">
                Integrate your NPCs into game engines
              </p>
              <RetroButton
                variant="magenta"
                size="md"
                onClick={() => setShowExportModal(true)}
                className="w-full text-xs"
              >
                OPEN MODAL
              </RetroButton>
            </div>

            {/* Stats Card */}
            <div className="border-4 border-yellow-400 bg-black p-6">
              <h3 className="text-sm font-bold text-white uppercase mb-4">
                QUICK STATS
              </h3>
              <div className="space-y-2 font-mono text-xs">
                <div>
                  <p className="text-yellow-400">NPCs Active</p>
                  <p className="text-2xl font-bold text-white">5</p>
                </div>
                <div className="pt-2 border-t border-yellow-400">
                  <p className="text-yellow-400">Network Volume</p>
                  <p className="text-lg font-bold text-white">$4,190.25</p>
                </div>
              </div>
            </div>

            {/* Navigation Card */}
            <div className="border-4 border-cyan-400 bg-black p-6">
              <h3 className="text-sm font-bold text-white uppercase mb-3">
                NAVIGATION
              </h3>
              <RetroButton
                variant="cyan"
                size="md"
                onClick={() => window.location.href = '/dashboard/fleet'}
                className="w-full text-xs"
              >
                FLEET DASHBOARD
              </RetroButton>
            </div>
          </div>
        </div>
      </main>

      {/* Export Modal */}
      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
      />
    </div>
  )
}

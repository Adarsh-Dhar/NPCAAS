export default function DemoAgent() {
  return (
    <div className="retro-card-green p-4">
      {/* Profile Header */}
      <div className="text-center mb-4">
        <h3 className="text-sm font-bold uppercase text-white mb-2">
          DEMO AGENT
        </h3>
      </div>

      {/* Pixel Art Placeholder */}
      <div className="bg-gray-800 border-2 border-white rounded-none aspect-square mb-4 flex items-center justify-center">
        <div className="text-6xl">🐸</div>
      </div>

      {/* Agent Name */}
      <h4 className="text-xs font-bold uppercase text-white mb-1">
        KERMIT_NPC_01
      </h4>

      {/* Status Badge */}
      <div className="bg-yellow-500 border-2 border-yellow-700 rounded-none px-2 py-1 text-center">
        <span className="text-xs font-bold text-black uppercase">
          AWAITING TRANSACTIONS
        </span>
      </div>

      {/* Stats */}
      <div className="mt-4 space-y-2 text-xs text-gray-300">
        <div className="flex justify-between">
          <span>CAPITAL:</span>
          <span className="text-green-400 font-bold">1000 KITE</span>
        </div>
        <div className="flex justify-between">
          <span>HEALTH:</span>
          <span className="text-cyan-400 font-bold">100%</span>
        </div>
        <div className="flex justify-between">
          <span>REPUTATION:</span>
          <span className="text-yellow-400 font-bold">50</span>
        </div>
      </div>
    </div>
  )
}

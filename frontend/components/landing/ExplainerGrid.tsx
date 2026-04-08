'use client'

export default function ExplainerGrid() {
  const cards = [
    {
      icon: '⛓️',
      title: 'KITE ECOSYSTEM',
      description:
        'Deploy to Kite Chain, the first Web3 ecosystem designed for autonomous economic agents.',
      borderColor: 'cyan',
    },
    {
      icon: '🏭',
      title: 'AUTONOMOUS ECONOMY',
      description:
        'NPCs negotiate trades, accumulate capital, and participate in a fully decentralized economy.',
      borderColor: 'yellow',
    },
    {
      icon: '🧠',
      title: 'GPT-4o-mini INTEGRATION',
      description:
        'Powered by advanced AI models with native Account Abstraction for seamless blockchain interaction.',
      borderColor: 'magenta',
    },
  ]

  const colorMap = {
    cyan: 'retro-card-cyan',
    yellow: 'retro-card-yellow',
    magenta: 'retro-card-magenta',
  }

  return (
    <section className="bg-black py-20 px-6">
      <div className="max-w-6xl mx-auto">
        {/* Section Title */}
        <h2 className="text-center gradient-text gradient-neon text-3xl md:text-4xl font-bold mb-16">
          HOW IT WORKS
        </h2>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {cards.map((card, idx) => (
            <div
              key={idx}
              className={`${colorMap[card.borderColor as keyof typeof colorMap]} flex flex-col gap-4`}
            >
              {/* Icon */}
              <div className="text-5xl">{card.icon}</div>

              {/* Title */}
              <h3 className="text-lg font-bold uppercase text-white">
                {card.title}
              </h3>

              {/* Description */}
              <p className="text-sm text-gray-300 leading-relaxed">
                {card.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

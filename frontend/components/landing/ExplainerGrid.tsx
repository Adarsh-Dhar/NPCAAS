'use client'

const cards = [
  {
    num: '01',
    title: 'PYUSD Ecosystem',
    description:
      'Deploy on the PYUSD network — the first Web3 ecosystem designed for autonomous economic agents with native account abstraction.',
  },
  {
    num: '02',
    title: 'Autonomous Economy',
    description:
      'NPCs negotiate trades, accumulate capital, and participate in a fully decentralised economy without scripted menus.',
  },
  {
    num: '03',
    title: 'GPT-4o Powered',
    description:
      'Advanced AI models with live memory, faction systems, and programmable game-engine event hooks.',
  },
]

export default function ExplainerGrid() {
  return (
    <section style={{
      backgroundColor: '#1a1715',
      padding: '6rem 2rem',
      position: 'relative',
    }}>
      {/* top rule */}
      <div style={{
        height: '1px',
        background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.08), transparent)',
        marginBottom: '4rem',
      }} />

      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '3.5rem' }}>
          <p className="font-condensed" style={{
            fontSize: '0.65rem',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            color: '#D8315B',
            marginBottom: '0.75rem',
          }}>
            How It Works
          </p>
          <h2 className="font-display" style={{
            fontSize: 'clamp(1.75rem, 4vw, 2.75rem)',
            fontWeight: 400,
            color: '#ffffff',
            letterSpacing: '-0.02em',
          }}>
            Three layers.<br />One platform.
          </h2>
        </div>

        {/* Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '1px',
          backgroundColor: 'rgba(255,255,255,0.06)',
        }}>
          {cards.map((card) => (
            <div key={card.num} style={{
              backgroundColor: '#1E1B18',
              padding: '2.5rem 2rem',
              position: 'relative',
              transition: 'background-color 0.2s ease',
            }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(216,49,91,0.04)')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#1E1B18')}
            >
              <div className="font-display" style={{
                fontSize: '3rem',
                color: 'rgba(216,49,91,0.2)',
                lineHeight: 1,
                marginBottom: '1.5rem',
                fontWeight: 400,
              }}>
                {card.num}
              </div>

              <h3 className="font-condensed" style={{
                fontSize: '0.9rem',
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: '#ffffff',
                marginBottom: '0.875rem',
              }}>
                {card.title}
              </h3>

              <p className="font-body" style={{
                fontSize: '0.875rem',
                lineHeight: 1.7,
                color: 'rgba(255,255,255,0.5)',
                fontWeight: 300,
              }}>
                {card.description}
              </p>

              {/* accent dot */}
              <div style={{
                position: 'absolute',
                top: '2.5rem',
                right: '2rem',
                width: '6px',
                height: '6px',
                backgroundColor: 'rgba(216,49,91,0.4)',
                borderRadius: '50%',
              }} />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
import Link from 'next/link'
import TopNav from '@/components/TopNav'

const principles = [
  {
    title: 'Live NPC Economies',
    description:
      'NPCs negotiate, react, and trade in real time so your world feels like a living market, not static dialog trees.',
  },
  {
    title: 'Web3-Native Actions',
    description:
      'Trade intent routes straight into transaction execution flows with sponsored, fallback, or user-paid paths.',
  },
  {
    title: 'Game-Ready Integration',
    description:
      'One SDK to fetch characters, stream chat, execute actions, and wire gameplay loops from prototype to production.',
  },
]

const capabilities = [
  'Character + game/project management APIs',
  'Streaming chat events for real-time UX',
  'Trade intent to transaction execution bridge',
  'NPC memory, logs, loop automation, and webhooks',
]

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <p className="font-condensed" style={{
    fontSize: '0.65rem', letterSpacing: '0.15em', textTransform: 'uppercase',
    color: '#D8315B', marginBottom: '0.75rem',
  }}>{children}</p>
)

export default function AboutPage() {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#1E1B18', color: '#ffffff' }}>
      <TopNav />

      <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '4rem 2rem' }}>

        {/* Hero */}
        <section style={{
          marginBottom: '5rem',
          paddingBottom: '4rem',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}>
          <SectionLabel>About GuildCraft</SectionLabel>
          <h1 className="font-display" style={{
            fontSize: 'clamp(2.5rem, 6vw, 4.5rem)',
            fontWeight: 400, letterSpacing: '-0.03em',
            color: '#ffffff', marginBottom: '1.5rem', lineHeight: 1.0,
          }}>
            The autonomous NPC<br />
            <span style={{ color: '#D8315B' }}>infrastructure</span>.
          </h1>
          <p className="font-body" style={{
            fontSize: '1rem', lineHeight: 1.75,
            color: 'rgba(255,255,255,0.5)',
            maxWidth: '600px', fontWeight: 300,
          }}>
            In NeoCity, every faction pushes for advantage. GuildCraft brings that same energy
            into your game through autonomous NPCs that talk, reason, and trade with players
            using programmable Web3 rails.
          </p>
        </section>

        {/* Core Principles */}
        <section style={{ marginBottom: '5rem' }}>
          <SectionLabel>Core Principles</SectionLabel>
          <h2 className="font-display" style={{
            fontSize: '2rem', fontWeight: 400,
            color: '#ffffff', marginBottom: '2.5rem', letterSpacing: '-0.02em',
          }}>
            Design language: reactive, composable, game-first
          </h2>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '1px',
            backgroundColor: 'rgba(255,255,255,0.06)',
          }}>
            {principles.map((item, i) => (
              <div key={item.title} style={{
                backgroundColor: '#1E1B18',
                padding: '2rem 1.75rem',
              }}>
                <div style={{
                  fontSize: '2rem', color: 'rgba(216,49,91,0.2)',
                  marginBottom: '1rem', fontWeight: 400,
                  }} className="font-display">
                  {String(i + 1).padStart(2, '0')}
                </div>
                  <h3 className="font-condensed" style={{
                  fontSize: '0.85rem', fontWeight: 700,
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                  color: '#ffffff', marginBottom: '0.75rem',
                }}>
                  {item.title}
                </h3>
                  <p className="font-body" style={{
                  fontSize: '0.875rem', lineHeight: 1.7,
                  color: 'rgba(255,255,255,0.45)', fontWeight: 300,
                }}>
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* What you can build + Ecosystem */}
        <section style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '1px',
          backgroundColor: 'rgba(255,255,255,0.06)',
          marginBottom: '5rem',
        }}>
          <div style={{ backgroundColor: '#1E1B18', padding: '2.5rem 2rem' }}>
            <SectionLabel>What You Can Build</SectionLabel>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              {capabilities.map((cap) => (
                <li key={cap} style={{
                  display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
                  fontSize: '0.875rem', color: 'rgba(255,255,255,0.55)',
                  lineHeight: 1.6,
                }} className="font-body">
                  <span style={{ color: '#D8315B', marginTop: '0.1rem', flexShrink: 0 }}>—</span>
                  {cap}
                </li>
              ))}
            </ul>
          </div>

          <div style={{ backgroundColor: '#1E1B18', padding: '2.5rem 2rem' }}>
            <SectionLabel>Ecosystem Fit</SectionLabel>
            <p className="font-body" style={{
              fontSize: '0.875rem', lineHeight: 1.75,
              color: 'rgba(255,255,255,0.5)', marginBottom: '1.5rem',
              fontWeight: 300,
            }}>
              GuildCraft is designed for teams building interactive worlds, live marketplaces,
              and persistent social loops. Start with a local API base and scale toward
              production endpoints as your game loop matures.
            </p>
            <p className="font-condensed" style={{
              fontSize: '0.65rem', letterSpacing: '0.1em',
              textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)',
            }}>
              Node.js 18+ recommended
            </p>
          </div>
        </section>

        {/* CTA */}
        <section style={{
          backgroundColor: 'rgba(216,49,91,0.06)',
          border: '1px solid rgba(216,49,91,0.2)',
          padding: '3rem 2.5rem',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: '1.5rem',
        }}>
          <div>
            <h2 className="font-display" style={{
              fontSize: '1.75rem', fontWeight: 400,
              color: '#ffffff', marginBottom: '0.375rem',
            }}>
              Ready to integrate?
            </h2>
            <p className="font-body" style={{
              fontSize: '0.875rem', color: 'rgba(255,255,255,0.45)',
            }}>
              Jump into the SDK quickstart or start creating live NPC flows now.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <Link href="/quickstart" style={{ textDecoration: 'none' }}>
              <button className="font-condensed" style={{
                fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em',
                textTransform: 'uppercase', padding: '0.6rem 1.5rem',
                backgroundColor: 'transparent',
                border: '2px solid rgba(255,255,255,0.25)',
                color: 'rgba(255,255,255,0.8)', cursor: 'pointer', borderRadius: 0,
              }}>Quickstart</button>
            </Link>
            <Link href="/creator" style={{ textDecoration: 'none' }}>
              <button className="font-condensed" style={{
                fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em',
                textTransform: 'uppercase', padding: '0.6rem 1.5rem',
                backgroundColor: '#D8315B', border: '2px solid #D8315B',
                color: '#ffffff', cursor: 'pointer', borderRadius: 0,
                boxShadow: '0 0 20px rgba(216,49,91,0.3)',
              }}>Launch Creator</button>
            </Link>
          </div>
        </section>
      </main>
    </div>
  )
}
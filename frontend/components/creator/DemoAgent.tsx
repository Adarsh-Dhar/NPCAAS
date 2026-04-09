'use client'

import { useEffect, useState, useRef } from 'react'

interface DemoAgentProps {
  currentAction?: string
}

type AnimState = 'idle' | 'wave' | 'happy' | 'think' | 'greet' | 'rub_hands' | 'shrug' | 'excited'

function mapActionToState(action: string): AnimState {
  const a = action.toLowerCase()
  if (a.includes('wave') || a.includes('beckon') || a.includes('greet') || a.includes('welcome')) return 'wave'
  if (a.includes('bounce') || a.includes('excit') || a.includes('jump') || a.includes('delight')) return 'excited'
  if (a.includes('happy') || a.includes('laugh') || a.includes('grin') || a.includes('chuckl') || a.includes('smile')) return 'happy'
  if (a.includes('think') || a.includes('ponder') || a.includes('contempl') || a.includes('scratch') || a.includes('chin') || a.includes('hmm')) return 'think'
  if (a.includes('bow') || a.includes('nod') || a.includes('gesture')) return 'greet'
  if (a.includes('rub') || a.includes('eager') || a.includes('hands together') || a.includes('hand') || a.includes('presentt')) return 'rub_hands'
  if (a.includes('shrug') || a.includes('sigh') || a.includes('unsure')) return 'shrug'
  return 'idle'
}

export default function DemoAgent({ currentAction }: DemoAgentProps) {
  const [animState, setAnimState] = useState<AnimState>('idle')
  const [isBlinking, setIsBlinking] = useState(false)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const blinkIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Map action string → animation state, revert to idle after 3.5s
  useEffect(() => {
    if (!currentAction) return
    const newState = mapActionToState(currentAction)
    setAnimState(newState)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => setAnimState('idle'), 3500)
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current) }
  }, [currentAction])

  // Blink loop
  useEffect(() => {
    const scheduleBlink = () => {
      const delay = 2500 + Math.random() * 2000
      blinkIntervalRef.current = setTimeout(() => {
        setIsBlinking(true)
        setTimeout(() => setIsBlinking(false), 150)
        scheduleBlink()
      }, delay)
    }
    scheduleBlink()
    return () => { if (blinkIntervalRef.current) clearTimeout(blinkIntervalRef.current) }
  }, [])

  const bodyClass = {
    idle: 'frog-idle',
    wave: 'frog-wave',
    happy: 'frog-happy',
    think: 'frog-think',
    greet: 'frog-greet',
    rub_hands: 'frog-rub',
    shrug: 'frog-shrug',
    excited: 'frog-excited',
  }[animState]

  const statusLabel = {
    idle: 'STANDING BY',
    wave: 'GREETING',
    happy: 'DELIGHTED',
    think: 'PONDERING',
    greet: 'BOWING',
    rub_hands: 'EAGER',
    shrug: 'UNCERTAIN',
    excited: 'EXCITED',
  }[animState]

  const statusColor = {
    idle: 'text-yellow-400 bg-yellow-500',
    wave: 'text-cyan-400 bg-cyan-500',
    happy: 'text-green-400 bg-green-500',
    think: 'text-purple-400 bg-purple-500',
    greet: 'text-blue-400 bg-blue-500',
    rub_hands: 'text-orange-400 bg-orange-500',
    shrug: 'text-gray-400 bg-gray-500',
    excited: 'text-pink-400 bg-pink-500',
  }[animState]

  return (
    <div className="retro-card-green p-4">
      <style>{`
        /* ── Base float ─────────────────────────────── */
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-5px); }
        }
        /* ── Wave right arm ─────────────────────────── */
        @keyframes wave-arm {
          0%   { transform: rotate(0deg); }
          20%  { transform: rotate(-55deg); }
          40%  { transform: rotate(-20deg); }
          60%  { transform: rotate(-55deg); }
          80%  { transform: rotate(-20deg); }
          100% { transform: rotate(0deg); }
        }
        /* ── Happy bounce ───────────────────────────── */
        @keyframes bounce {
          0%, 100% { transform: translateY(0px) scaleX(1) scaleY(1); }
          30%       { transform: translateY(-18px) scaleX(0.95) scaleY(1.05); }
          50%       { transform: translateY(0px) scaleX(1.05) scaleY(0.95); }
          70%       { transform: translateY(-10px) scaleX(0.97) scaleY(1.02); }
        }
        /* ── Think tilt ─────────────────────────────── */
        @keyframes think-tilt {
          0%, 100% { transform: rotate(0deg) translateY(0); }
          50%       { transform: rotate(-6deg) translateY(-2px); }
        }
        /* ── Greet bow ──────────────────────────────── */
        @keyframes bow {
          0%   { transform: rotate(0deg); transform-origin: bottom center; }
          30%  { transform: rotate(18deg); transform-origin: bottom center; }
          60%  { transform: rotate(5deg); transform-origin: bottom center; }
          100% { transform: rotate(0deg); transform-origin: bottom center; }
        }
        /* ── Rub hands pulse ────────────────────────── */
        @keyframes rub-pulse {
          0%, 100% { transform: translateY(0px) scale(1); }
          50%       { transform: translateY(-3px) scale(1.03); }
        }
        /* ── Shrug ──────────────────────────────────── */
        @keyframes shrug-arms {
          0%, 100% { transform: rotate(0deg); }
          40%       { transform: rotate(-30deg); }
          60%       { transform: rotate(-30deg); }
        }
        @keyframes shrug-right {
          0%, 100% { transform: rotate(0deg); }
          40%       { transform: rotate(30deg); }
          60%       { transform: rotate(30deg); }
        }
        /* ── Excited ────────────────────────────────── */
        @keyframes excited-bounce {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          25%       { transform: translateY(-20px) rotate(-4deg); }
          50%       { transform: translateY(0px) rotate(4deg); }
          75%       { transform: translateY(-12px) rotate(-2deg); }
        }
        /* ── Blink ──────────────────────────────────── */
        @keyframes blink-squish {
          0%, 100% { transform: scaleY(1); }
          50%       { transform: scaleY(0.08); }
        }

        /* ── State classes ──────────────────────────── */
        .frog-idle   { animation: float 2.8s ease-in-out infinite; }
        .frog-wave   { animation: float 2.8s ease-in-out infinite; }
        .frog-happy  { animation: bounce 0.6s ease-in-out 5; }
        .frog-think  { animation: think-tilt 1.2s ease-in-out 3; }
        .frog-greet  { animation: bow 1s ease-in-out 2; transform-origin: bottom center; }
        .frog-rub    { animation: rub-pulse 0.5s ease-in-out infinite; }
        .frog-shrug  { animation: float 2s ease-in-out infinite; }
        .frog-excited{ animation: excited-bounce 0.5s ease-in-out 6; }

        /* ── Arm animations ─────────────────────────── */
        .arm-right-wave  { animation: wave-arm 0.7s ease-in-out 4; transform-origin: 92px 86px; }
        .arm-left-shrug  { animation: shrug-arms 0.8s ease-in-out 3; transform-origin: 28px 86px; }
        .arm-right-shrug { animation: shrug-right 0.8s ease-in-out 3; transform-origin: 92px 86px; }

        /* ── Rub arms together ──────────────────────── */
        .arm-rub-left  {
          animation: none;
          transform: rotate(30deg);
          transform-origin: 28px 86px;
          transition: transform 0.3s;
        }
        .arm-rub-right {
          animation: none;
          transform: rotate(-30deg);
          transform-origin: 92px 86px;
          transition: transform 0.3s;
        }

        /* ── Think arm (left up to chin) ────────────── */
        .arm-think-left {
          animation: none;
          transform: rotate(-55deg);
          transform-origin: 28px 86px;
          transition: transform 0.4s ease;
        }

        /* ── Blink ──────────────────────────────────── */
        .eye-blink { animation: blink-squish 0.15s ease-in-out 1; transform-origin: center; }
      `}</style>

      {/* Header */}
      <div className="text-center mb-3">
        <h3 className="text-sm font-bold uppercase text-white mb-1">KERMIT_NPC_01</h3>
        <div className="text-[10px] text-green-400 font-mono">AUTONOMOUS AGENT</div>
      </div>

      {/* SVG Character */}
      <div className="flex justify-center mb-3">
        <svg
          className={bodyClass}
          viewBox="0 0 120 165"
          width="140"
          height="165"
          xmlns="http://www.w3.org/2000/svg"
          style={{ overflow: 'visible', filter: 'drop-shadow(0 4px 8px rgba(34,197,94,0.3))' }}
        >
          {/* Shadow */}
          <ellipse cx="60" cy="160" rx="28" ry="5" fill="#000" opacity="0.25" />

          {/* ── LEGS ── */}
          <g>
            {/* Left leg */}
            <line x1="42" y1="120" x2="22" y2="148" stroke="#15803d" strokeWidth="9" strokeLinecap="round"/>
            <ellipse cx="17" cy="150" rx="10" ry="5" fill="#15803d"/>
            {/* Right leg */}
            <line x1="78" y1="120" x2="98" y2="148" stroke="#15803d" strokeWidth="9" strokeLinecap="round"/>
            <ellipse cx="103" cy="150" rx="10" ry="5" fill="#15803d"/>
          </g>

          {/* ── BODY ── */}
          <ellipse cx="60" cy="100" rx="34" ry="28" fill="#16a34a"/>
          {/* Belly */}
          <ellipse cx="60" cy="103" rx="23" ry="18" fill="#86efac"/>

          {/* ── ARMS ── */}
          {/* Left arm */}
          <g className={
            animState === 'shrug' ? 'arm-left-shrug' :
            animState === 'rub_hands' ? 'arm-rub-left' :
            animState === 'think' ? 'arm-think-left' : ''
          }>
            <line x1="28" y1="86" x2="8" y2="106" stroke="#16a34a" strokeWidth="8" strokeLinecap="round"/>
            <circle cx="6" cy="108" r="5" fill="#15803d"/>
          </g>
          {/* Right arm */}
          <g className={
            animState === 'wave' ? 'arm-right-wave' :
            animState === 'shrug' ? 'arm-right-shrug' :
            animState === 'rub_hands' ? 'arm-rub-right' : ''
          }>
            <line x1="92" y1="86" x2="112" y2="106" stroke="#16a34a" strokeWidth="8" strokeLinecap="round"/>
            <circle cx="114" cy="108" r="5" fill="#15803d"/>
          </g>

          {/* ── HEAD ── */}
          <ellipse cx="60" cy="55" rx="30" ry="27" fill="#16a34a"/>

          {/* Eye bumps */}
          <ellipse cx="38" cy="34" rx="13" ry="10" fill="#16a34a"/>
          <ellipse cx="82" cy="34" rx="13" ry="10" fill="#16a34a"/>

          {/* Eye whites */}
          <ellipse
            cx="38" cy="31"
            rx="9" ry="8"
            fill="white"
            className={isBlinking ? 'eye-blink' : ''}
            style={{ transformOrigin: '38px 31px' }}
          />
          <ellipse
            cx="82" cy="31"
            rx="9" ry="8"
            fill="white"
            className={isBlinking ? 'eye-blink' : ''}
            style={{ transformOrigin: '82px 31px' }}
          />

          {/* Pupils */}
          <ellipse cx="40" cy="32" rx="4.5" ry="5" fill="#1a1a1a"
            style={{ transformOrigin: '38px 31px' }}
            className={isBlinking ? 'eye-blink' : ''}
          />
          <ellipse cx="80" cy="32" rx="4.5" ry="5" fill="#1a1a1a"
            style={{ transformOrigin: '82px 31px' }}
            className={isBlinking ? 'eye-blink' : ''}
          />

          {/* Eye shine */}
          <circle cx="41" cy="29" r="2" fill="white" opacity="0.8"/>
          <circle cx="81" cy="29" r="2" fill="white" opacity="0.8"/>

          {/* Nostril bumps */}
          <circle cx="54" cy="58" r="3" fill="#15803d"/>
          <circle cx="66" cy="58" r="3" fill="#15803d"/>

          {/* Smile — changes with state */}
          {(animState === 'happy' || animState === 'excited' || animState === 'wave') ? (
            // Big grin
            <path d="M42 66 Q60 80 78 66" stroke="#15803d" strokeWidth="2.5" fill="#15803d" opacity="0.6"/>
          ) : animState === 'think' || animState === 'shrug' ? (
            // Neutral/flat
            <path d="M46 68 Q60 68 74 68" stroke="#15803d" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
          ) : (
            // Normal smile
            <path d="M44 67 Q60 76 76 67" stroke="#15803d" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
          )}

          {/* Think bubble dots */}
          {animState === 'think' && (
            <g opacity="0.8">
              <circle cx="92" cy="25" r="3" fill="#a855f7"/>
              <circle cx="100" cy="17" r="4" fill="#a855f7"/>
              <circle cx="110" cy="9" r="5" fill="#a855f7"/>
            </g>
          )}

          {/* Wave sparkles */}
          {animState === 'wave' && (
            <g opacity="0.9">
              <text x="100" y="75" fontSize="12" fill="#fbbf24">✨</text>
              <text x="95" y="55" fontSize="9" fill="#fbbf24">★</text>
            </g>
          )}

          {/* Excited stars */}
          {animState === 'excited' && (
            <g>
              <text x="5" y="60" fontSize="12" fill="#f472b6">★</text>
              <text x="100" y="50" fontSize="14" fill="#f472b6">✦</text>
              <text x="8" y="30" fontSize="9" fill="#fb923c">✦</text>
            </g>
          )}
        </svg>
      </div>

      {/* Status badge */}
      <div className={`border-2 ${statusColor} border-opacity-60 rounded-none px-2 py-1 text-center mb-3`}
        style={{ borderColor: 'currentColor' }}>
        <span className="text-xs font-bold text-black uppercase">{statusLabel}</span>
      </div>

      {/* Action display */}
      {currentAction && (
        <div className="border border-green-700 bg-black bg-opacity-50 p-2 mb-3 min-h-[36px]">
          <p className="text-[10px] text-green-400 font-mono italic text-center leading-relaxed">
            *{currentAction}*
          </p>
        </div>
      )}

      {/* Stats */}
      <div className="space-y-2 text-xs text-gray-300">
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
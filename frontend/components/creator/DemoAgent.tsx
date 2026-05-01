'use client'

import { useEffect, useState, useRef } from 'react'
import styles from './DemoAgent.module.css'
import { PRIMARY_TOKEN_SYMBOL } from '@/lib/token-config'

interface DemoAgentProps {
  currentAction?: string
  characterName?: string
  baseCapital?: string | number
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

export default function DemoAgent({ currentAction, characterName, baseCapital }: DemoAgentProps) {
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
    idle: styles.frogIdle,
    wave: styles.frogWave,
    happy: styles.frogHappy,
    think: styles.frogThink,
    greet: styles.frogGreet,
    rub_hands: styles.frogRub,
    shrug: styles.frogShrug,
    excited: styles.frogExcited,
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
    idle: 'text-blue-400 bg-blue-500',
    wave: 'text-blue-300 bg-blue-700',
    happy: 'text-purple-300 bg-purple-500',
    think: 'text-purple-400 bg-purple-500',
    greet: 'text-blue-400 bg-blue-500',
    rub_hands: 'text-blue-300 bg-blue-700',
    shrug: 'text-gray-400 bg-gray-500',
    excited: 'text-purple-300 bg-purple-500',
  }[animState]

  const displayName =
    typeof characterName === 'string' && characterName.trim()
      ? characterName.trim()
      : 'MY_NPC'

  const displayCapital =
    typeof baseCapital === 'number'
      ? String(baseCapital)
      : typeof baseCapital === 'string' && baseCapital.trim()
        ? baseCapital.trim()
        : '0'

  return (
    <div className="retro-card-blue p-4">
      {/* Header */}
      <div className="text-center mb-3">
        <h3 className="text-sm font-bold uppercase text-white mb-1">{displayName}</h3>
        <div className="text-[10px] text-blue-400 font-mono">AUTONOMOUS AGENT</div>
      </div>

      {/* SVG Character */}
      <div className="flex justify-center mb-3">
        <svg
          className={bodyClass}
          viewBox="0 0 120 165"
          width="140"
          height="165"
          xmlns="http://www.w3.org/2000/svg"
          style={{ overflow: 'visible', filter: 'drop-shadow(0 4px 8px rgba(216,49,91,0.3))' }}
        >
          {/* Shadow */}
          <ellipse cx="60" cy="160" rx="28" ry="5" fill="#1E1B18" opacity="0.25" />

          {/* ── LEGS ── */}
          <g>
            {/* Left leg */}
            <line x1="42" y1="120" x2="22" y2="148" stroke="#D8315B" strokeWidth="9" strokeLinecap="round"/>
            <ellipse cx="17" cy="150" rx="10" ry="5" fill="#D8315B"/>
            {/* Right leg */}
            <line x1="78" y1="120" x2="98" y2="148" stroke="#D8315B" strokeWidth="9" strokeLinecap="round"/>
            <ellipse cx="103" cy="150" rx="10" ry="5" fill="#D8315B"/>
          </g>

          {/* ── BODY ── */}
          <ellipse cx="60" cy="100" rx="34" ry="28" fill="#D8315B"/>
          {/* Belly */}
          <ellipse cx="60" cy="103" rx="23" ry="18" fill="#FFFFFF" opacity="0.12"/>

          {/* ── ARMS ── */}
          {/* Left arm */}
          <g className={
            animState === 'shrug' ? styles.armLeftShrug :
            animState === 'rub_hands' ? styles.armRubLeft :
            animState === 'think' ? styles.armThinkLeft : ''
          }>
            <line x1="28" y1="86" x2="8" y2="106" stroke="#D8315B" strokeWidth="8" strokeLinecap="round"/>
            <circle cx="6" cy="108" r="5" fill="#1E1B18"/>
          </g>
          {/* Right arm */}
          <g className={
            animState === 'wave' ? styles.armRightWave :
            animState === 'shrug' ? styles.armRightShrug :
            animState === 'rub_hands' ? styles.armRubRight : ''
          }>
            <line x1="92" y1="86" x2="112" y2="106" stroke="#D8315B" strokeWidth="8" strokeLinecap="round"/>
            <circle cx="114" cy="108" r="5" fill="#1E1B18"/>
          </g>

          {/* ── HEAD ── */}
          <ellipse cx="60" cy="55" rx="30" ry="27" fill="#D8315B"/>

          {/* Eye bumps */}
          <ellipse cx="38" cy="34" rx="13" ry="10" fill="#D8315B"/>
          <ellipse cx="82" cy="34" rx="13" ry="10" fill="#D8315B"/>

          {/* Eye whites */}
          <ellipse
            cx="38" cy="31"
            rx="9" ry="8"
            fill="white"
            className={isBlinking ? styles.eyeBlink : ''}
            style={{ transformOrigin: '38px 31px' }}
          />
          <ellipse
            cx="82" cy="31"
            rx="9" ry="8"
            fill="white"
            className={isBlinking ? styles.eyeBlink : ''}
            style={{ transformOrigin: '82px 31px' }}
          />

          {/* Pupils */}
          <ellipse cx="40" cy="32" rx="4.5" ry="5" fill="#1E1B18"
            style={{ transformOrigin: '38px 31px' }}
            className={isBlinking ? styles.eyeBlink : ''}
          />
          <ellipse cx="80" cy="32" rx="4.5" ry="5" fill="#1E1B18"
            style={{ transformOrigin: '82px 31px' }}
            className={isBlinking ? styles.eyeBlink : ''}
          />

          {/* Eye shine */}
          <circle cx="41" cy="29" r="2" fill="white" opacity="0.8"/>
          <circle cx="81" cy="29" r="2" fill="white" opacity="0.8"/>

          {/* Nostril bumps */}
          <circle cx="54" cy="58" r="3" fill="#1E1B18"/>
          <circle cx="66" cy="58" r="3" fill="#1E1B18"/>

          {/* Smile — changes with state */}
          {(animState === 'happy' || animState === 'excited' || animState === 'wave') ? (
            // Big grin
            <path d="M42 66 Q60 80 78 66" stroke="#1E1B18" strokeWidth="2.5" fill="#1E1B18" opacity="0.6"/>
          ) : animState === 'think' || animState === 'shrug' ? (
            // Neutral/flat
            <path d="M46 68 Q60 68 74 68" stroke="#1E1B18" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
          ) : (
            // Normal smile
            <path d="M44 67 Q60 76 76 67" stroke="#1E1B18" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
          )}

          {/* Think bubble dots */}
          {animState === 'think' && (
            <g opacity="0.8">
              <circle cx="92" cy="25" r="3" fill="#D8315B"/>
              <circle cx="100" cy="17" r="4" fill="#FFFFFF"/>
              <circle cx="110" cy="9" r="5" fill="#D8315B"/>
            </g>
          )}

          {/* Wave sparkles */}
          {animState === 'wave' && (
            <g opacity="0.9">
              <text x="100" y="75" fontSize="12" fill="#FFFFFF">✨</text>
              <text x="95" y="55" fontSize="9" fill="#FFFFFF">★</text>
            </g>
          )}

          {/* Excited stars */}
          {animState === 'excited' && (
            <g>
              <text x="5" y="60" fontSize="12" fill="#D8315B">★</text>
              <text x="100" y="50" fontSize="14" fill="#FFFFFF">✦</text>
              <text x="8" y="30" fontSize="9" fill="#D8315B">✦</text>
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
        <div className="border border-blue-700 bg-black bg-opacity-50 p-2 mb-3 min-h-[36px]">
          <p className="text-[10px] text-blue-400 font-mono italic text-center leading-relaxed">
            *{currentAction}*
          </p>
        </div>
      )}

      {/* Stats */}
      <div className="space-y-2 text-xs text-gray-300">
        <div className="flex justify-between">
          <span>CAPITAL:</span>
          <span className="text-blue-400 font-bold">{displayCapital} {PRIMARY_TOKEN_SYMBOL}</span>
        </div>
        <div className="flex justify-between">
          <span>HEALTH:</span>
          <span className="text-blue-300 font-bold">100%</span>
        </div>
        <div className="flex justify-between">
          <span>REPUTATION:</span>
          <span className="text-purple-300 font-bold">50</span>
        </div>
      </div>
    </div>
  )
}
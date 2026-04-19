// src/components/WorldEventFeed.tsx
// Shows live NPC-to-NPC interactions in a scrolling feed on the HUD.

import { useCallback, useEffect, useState, useRef } from 'react'
import { worldLoop, type WorldEvent } from '@/lib/npcWorldLoop'
import { subscribePlayerState } from '@/lib/playerState'
import { WORLD_EVENT_COLOR_BY_TYPE } from '@/lib/sdk'
import { formatNpcDisplayName } from '@/lib/protocolBabel'
import { Zap } from 'lucide-react'

const MIDNIGHT_GAME_ID = 'THE_MIDNIGHT_MANIFEST'
const FEED_STORAGE_KEY = `neocity.worldEvents.${MIDNIGHT_GAME_ID}.v1`
const WORLD_EVENTS_BASE_URL =
  (import.meta.env?.VITE_WORLD_EVENTS_BASE_URL as string | undefined)?.replace(/\/$/, '') ||
  'http://localhost:3002'
const WORLD_EVENTS_ENDPOINT = `${WORLD_EVENTS_BASE_URL}/api/world-events`
const MAX_FEED_EVENTS = 50

function hashColor(value: string) {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0
  }

  return `hsl(${hash % 360} 85% 65%)`
}

function getEventColor(actionType: string) {
  return WORLD_EVENT_COLOR_BY_TYPE[actionType] ?? hashColor(actionType)
}

function formatFallbackSummary(event: WorldEvent) {
  const payload = event.payload as Record<string, unknown>

  if (typeof payload.summary === 'string' && payload.summary.trim()) {
    return payload.summary.trim()
  }

  if (typeof payload.response === 'string' && payload.response.trim()) {
    return payload.response.trim()
  }

  if (typeof payload.message === 'string' && payload.message.trim()) {
    return payload.message.trim()
  }

  return `${event.sourceName} signaled ${event.actionType.replace(/_/g, ' ').toLowerCase()}`
}

function truncateProof(proof: string) {
  if (proof.length <= 14) return proof
  return `${proof.slice(0, 10)}…${proof.slice(-6)}`
}

function formatPaymentProof(payload: Record<string, unknown>) {
  const signature = typeof payload.signature === 'string' ? payload.signature.trim() : ''
  if (signature) return `sig ${truncateProof(signature)}`

  const userOpHash = typeof payload.userOpHash === 'string' ? payload.userOpHash.trim() : ''
  if (userOpHash) return `uop ${truncateProof(userOpHash)}`

  const txHash = typeof payload.txHash === 'string' ? payload.txHash.trim() : ''
  if (txHash) return `tx ${truncateProof(txHash)}`

  return null
}

function shouldDisplayEvent(_event: WorldEvent) {
  return true
}

function getEventSignature(event: WorldEvent) {
  return [
    event.sourceId,
    event.sourceName,
    event.actionType,
    event.timestamp,
    JSON.stringify(event.payload),
  ].join('|')
}

function mergeEvents(existing: WorldEvent[], incoming: WorldEvent[]) {
  const combined = [...incoming, ...existing]
  const seen = new Set<string>()
  const merged: WorldEvent[] = []

  for (const event of combined) {
    const signature = getEventSignature(event)
    if (seen.has(signature)) continue
    seen.add(signature)
    merged.push(event)
  }

  return merged
    .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
    .slice(0, MAX_FEED_EVENTS)
}

function loadPersistedEvents() {
  if (typeof window === 'undefined') return [] as WorldEvent[]

  try {
    const raw = window.localStorage.getItem(FEED_STORAGE_KEY)
    if (!raw) return []

    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []

    return parsed.filter((event): event is WorldEvent => {
      return Boolean(
        event &&
          typeof event === 'object' &&
          typeof event.sourceId === 'string' &&
          typeof event.sourceName === 'string' &&
          typeof event.actionType === 'string' &&
          typeof event.timestamp === 'string' &&
          event.payload &&
          typeof event.payload === 'object'
      )
    })
  } catch {
    return []
  }
}

function persistEvents(events: WorldEvent[]) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(FEED_STORAGE_KEY, JSON.stringify(events))
  } catch {
    // Ignore storage failures; the feed still has the server event log.
  }
}

async function persistEvent(event: WorldEvent) {
  if (typeof window === 'undefined') return

  try {
    await fetch(WORLD_EVENTS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gameId: MIDNIGHT_GAME_ID,
        ...event,
      }),
    })
  } catch {
    // Ignore storage failures; feed still works in memory.
  }
}

export function WorldEventFeed() {
  const [events, setEvents] = useState<WorldEvent[]>(() => loadPersistedEvents())
  const feedRef = useRef<HTMLDivElement>(null)
  const seenEventsRef = useRef<Set<string>>(new Set())

  const pushEvent = useCallback((event: WorldEvent) => {
    if (!shouldDisplayEvent(event)) return

    const signature = getEventSignature(event)
    if (seenEventsRef.current.has(signature)) return
    seenEventsRef.current.add(signature)

    setEvents((prev) => {
      const next = mergeEvents(prev, [event])
      persistEvents(next)
      return next
    })
    void persistEvent(event)
  }, [])

  useEffect(() => {
    let cancelled = false

    const loadEvents = async () => {
      try {
        const response = await fetch(
          `${WORLD_EVENTS_ENDPOINT}?gameId=${encodeURIComponent(MIDNIGHT_GAME_ID)}&limit=${MAX_FEED_EVENTS}`
        )

        if (!response.ok) return

        const payload = (await response.json()) as { events?: WorldEvent[] }
        const loaded = Array.isArray(payload.events) ? payload.events : []
        if (cancelled) return

        setEvents((current) => {
          const next = mergeEvents(current, loaded)
          persistEvents(next)
          return next
        })
        for (const event of loaded) {
          seenEventsRef.current.add(getEventSignature(event))
        }
      } catch {
        // Ignore hydration failures; live events still work.
      }
    }

    void loadEvents()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const unsub = worldLoop.subscribe(event => {
      pushEvent(event)
    })

    const handleNpcSystemEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ eventName?: string; npcName?: string }>).detail
      if (!detail?.eventName) return
      const actionType = detail.eventName

      const sourceName = detail.npcName ? formatNpcDisplayName(detail.npcName) : 'SYSTEM'

      pushEvent({
        sourceId: `system:${detail.npcName ?? actionType}`,
        sourceName,
        actionType,
        payload: {
          npcName: detail.npcName,
          eventName: actionType,
        },
        timestamp: new Date().toISOString(),
      })
    }
    window.addEventListener('NPC_SYSTEM_EVENT', handleNpcSystemEvent)
    const unsubState = subscribePlayerState((snapshot) => {
      if (snapshot.lastEventType) {
        const actionType =
          typeof snapshot.lastEventType === 'string' && snapshot.lastEventType.trim()
            ? snapshot.lastEventType
            : 'PLAYER_EVENT'

        const latestPaymentProof = snapshot.recentPaymentProofs[0]
        const payload: Record<string, unknown> =
          actionType === 'PAYMENT_SENT' && latestPaymentProof
            ? {
                to: latestPaymentProof.recipientName ?? 'unknown',
                toWallet: latestPaymentProof.recipientWallet,
                senderWallet: latestPaymentProof.senderWallet,
                amount: latestPaymentProof.amount,
                currency: latestPaymentProof.currency,
                item: latestPaymentProof.item,
                mode: latestPaymentProof.mode,
                txHash: latestPaymentProof.txHash,
                signature: latestPaymentProof.signature,
                userOpHash: latestPaymentProof.userOpHash,
              }
            : {
                inventory: snapshot.inventory,
                escrowFunded: snapshot.escrowFunded,
                lastEventType: snapshot.lastEventType,
                lastEventAt: snapshot.lastEventAt,
              }

        pushEvent({
          sourceId: 'local-player',
          sourceName: 'PLAYER_STATE',
          actionType,
          payload,
          timestamp: snapshot.lastEventAt ?? new Date().toISOString(),
        })
      }
    })
    return () => {
      unsub()
      window.removeEventListener('NPC_SYSTEM_EVENT', handleNpcSystemEvent)
      unsubState()
    }
  }, [])

  useEffect(() => {
    feedRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [events])

  if (events.length === 0) return null

  return (
    <div
      ref={feedRef}
      className="absolute bottom-16 left-4 z-20 w-72 max-h-48 overflow-y-auto"
      style={{
        background: 'rgba(5,5,15,0.9)',
        border: '1px solid rgba(103,232,249,0.24)',
        fontFamily: 'monospace',
      }}
    >
      <div
        className="sticky top-0 flex items-center gap-1 px-2 py-1 text-xs"
        style={{
          background: 'rgba(5,5,15,0.95)',
          borderBottom: '1px solid rgba(103,232,249,0.24)',
          color: '#67e8f9',
          letterSpacing: 2,
        }}
      >
        <Zap size={9} />
        TRANSACTION FEED
      </div>

      {events.map((event, i) => {
        const color = getEventColor(event.actionType)
        const payload = event.payload as Record<string, unknown>
        const paymentProof = event.actionType === 'PAYMENT_SENT' ? formatPaymentProof(payload) : null
        const summary =
          event.actionType === 'PAYMENT_SENT'
            ? `${`→ ${typeof payload.to === 'string' ? payload.to : 'unknown'}: ${String(payload.amount ?? '?')} ${typeof payload.currency === 'string' ? payload.currency : ''} for ${typeof payload.item === 'string' ? payload.item : 'unknown item'}`.trim()}${paymentProof ? ` [${paymentProof}]` : ''}`
            : event.actionType === 'ITEM_TRANSFERRED'
            ? `→ ${typeof payload.to === 'string' ? payload.to : 'unknown'}: transferred ${typeof payload.item === 'string' ? payload.item : 'unknown item'}`
            : event.actionType === 'MANIFEST_ACCEPTED'
            ? 'Vinnie handed over the quartermaster cover'
            : event.actionType === 'INVENTORY_COMPROMISED'
            ? 'Warehouse routing has been sabotaged'
            : event.actionType === 'BRIEFCASE_LOCATED'
            ? 'Svetlana confirmed as briefcase holder'
            : event.actionType === 'BROKER_SETTLEMENT_CONFIRMED'
            ? 'Silas cleared the broker settlement'
            : event.actionType === 'BRIEFCASE_TRANSFERRED'
            ? 'Silas released the package after settlement'
            : event.actionType === 'SECURITY_ALERTED'
            ? 'Curator security detail mobilized'
            : event.actionType === 'ESCAPE_ROUTE_OPENED'
            ? 'Maintenance tunnel now available'
            : event.actionType === 'ARTIFACT_INTERCEPTED'
            ? 'Quantum drive access codes secured'
            : formatFallbackSummary(event)

        return (
          <div
            key={i}
            className="px-2 py-1.5 text-xs border-b"
            style={{ borderColor: 'rgba(255,255,255,0.05)' }}
          >
            <div className="flex items-center gap-1 mb-0.5">
              <span
                className="px-1 py-0 rounded-sm text-xs font-bold"
                style={{
                  background: `${color}22`,
                  color,
                  fontSize: 9,
                  letterSpacing: 1,
                }}
              >
                {event.actionType}
              </span>
              <span style={{ color: color, fontWeight: 'bold' }}>{event.sourceName}</span>
            </div>
            <div style={{ color: '#778899', fontSize: 10 }}>{summary}</div>
          </div>
        )
      })}
    </div>
  )
}
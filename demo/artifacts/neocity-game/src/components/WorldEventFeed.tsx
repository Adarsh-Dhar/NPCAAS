// src/components/WorldEventFeed.tsx
// Shows live NPC-to-NPC interactions in a scrolling feed on the HUD.

import { useEffect, useState, useRef } from 'react'
import { worldLoop, type WorldEvent } from '@/lib/npcWorldLoop'
import { subscribePlayerState } from '@/lib/playerState'
import { Zap } from 'lucide-react'

const ACTION_COLOR: Record<string, string> = {
  PAYMENT_SENT:     '#ffcc00',
  ITEM_TRANSFERRED: '#00ff88',
  TRADE_ACCEPTED:   '#00ff88',
  TRADE_PROPOSED:   '#ff9900',
  MANIFEST_ACCEPTED: '#7df9ff',
  INVENTORY_COMPROMISED: '#ffb703',
  BRIEFCASE_LOCATED: '#ffd166',
  BRIEFCASE_TRANSFERRED: '#7dff9b',
  SECURITY_ALERTED: '#ff5d73',
  ESCAPE_ROUTE_OPENED: '#80ed99',
  ARTIFACT_INTERCEPTED: '#00f5d4',
}

const FEED_EVENT_WHITELIST = new Set([
  'PAYMENT_SENT',
  'ITEM_TRANSFERRED',
  'TRADE_ACCEPTED',
  'TRADE_PROPOSED',
  'MANIFEST_ACCEPTED',
  'INVENTORY_COMPROMISED',
  'BRIEFCASE_LOCATED',
  'BRIEFCASE_TRANSFERRED',
  'SECURITY_ALERTED',
  'ESCAPE_ROUTE_OPENED',
  'ARTIFACT_INTERCEPTED',
])

function shouldDisplayEvent(event: WorldEvent) {
  return FEED_EVENT_WHITELIST.has(event.actionType)
}

export function WorldEventFeed() {
  const [events, setEvents] = useState<WorldEvent[]>([])
  const feedRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const unsub = worldLoop.subscribe(event => {
      if (!shouldDisplayEvent(event)) return
      setEvents(prev => [event, ...prev].slice(0, 30))
    })
    const unsubState = subscribePlayerState((snapshot) => {
      if (snapshot.lastEventType) {
        const actionType =
          typeof snapshot.lastEventType === 'string' && snapshot.lastEventType.trim()
            ? snapshot.lastEventType
            : 'PLAYER_EVENT'

        if (!FEED_EVENT_WHITELIST.has(actionType)) return

        setEvents((prev) => [
          {
            sourceId: 'local-player',
            sourceName: 'PLAYER_STATE',
            actionType,
            payload: {
              inventory: snapshot.inventory,
              escrowFunded: snapshot.escrowFunded,
              lastEventType: snapshot.lastEventType,
              lastEventAt: snapshot.lastEventAt,
            } as Record<string, unknown>,
            timestamp: snapshot.lastEventAt ?? new Date().toISOString(),
          },
          ...prev,
        ].slice(0, 30))
      }
    })
    return () => {
      unsub()
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
        border: '1px solid rgba(0,255,204,0.2)',
        fontFamily: 'monospace',
      }}
    >
      <div
        className="sticky top-0 flex items-center gap-1 px-2 py-1 text-xs"
        style={{
          background: 'rgba(5,5,15,0.95)',
          borderBottom: '1px solid rgba(0,255,204,0.2)',
          color: '#00ffcc',
          letterSpacing: 2,
        }}
      >
        <Zap size={9} />
        TRANSACTION FEED
      </div>

      {events.map((event, i) => {
        const color = ACTION_COLOR[event.actionType] ?? '#aaccdd'
        const payload = event.payload as any
        const summary =
          event.actionType === 'PAYMENT_SENT'
            ? `→ ${payload.to}: ${payload.amount} ${payload.currency} for ${payload.item}`
            : event.actionType === 'ITEM_TRANSFERRED'
            ? `→ ${payload.to}: transferred ${payload.item}`
            : event.actionType === 'MANIFEST_ACCEPTED'
            ? 'Vinnie handed over the quartermaster cover'
            : event.actionType === 'INVENTORY_COMPROMISED'
            ? 'Warehouse routing has been sabotaged'
            : event.actionType === 'BRIEFCASE_LOCATED'
            ? 'Svetlana confirmed as briefcase holder'
            : event.actionType === 'BRIEFCASE_TRANSFERRED'
            ? 'Remy lost control of the package'
            : event.actionType === 'SECURITY_ALERTED'
            ? 'Curator security detail mobilized'
            : event.actionType === 'ESCAPE_ROUTE_OPENED'
            ? 'Maintenance tunnel now available'
            : event.actionType === 'ARTIFACT_INTERCEPTED'
            ? 'Quantum drive access codes secured'
            : JSON.stringify(payload).slice(0, 50)

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
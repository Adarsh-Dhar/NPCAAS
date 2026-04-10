import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { validateApiKey } from '@/lib/api-key-store'
import type { Prisma } from '@/lib/generated/prisma/client'

async function resolveAuthorizedProject(request: NextRequest) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader) return null
  if (!authHeader.startsWith('Bearer ')) {
    return NextResponse.json(
      { error: 'Missing or malformed Authorization header. Use: Bearer gc_live_...' },
      { status: 401 }
    )
  }
  const apiKey = authHeader.replace('Bearer ', '').trim()
  const project = await validateApiKey(apiKey)
  if (!project) return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
  return project
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
}

const SUPPORTED_EVENTS = [
  'npc.token_received',
  'npc.balance_low',
  'npc.trade_executed',
  'npc.loop_started',
  'npc.loop_stopped',
  'npc.event_triggered',
  'npc.action_vetoed',
  'npc.memory_updated',
  'npc.deployed',
  'game.npc_assigned',
]

/**
 * POST /api/webhooks/register
 * Let developers subscribe to specific NPC/game events.
 *
 * Body:
 * {
 *   url: string           // HTTPS endpoint to POST events to
 *   events: string[]      // event names (see SUPPORTED_EVENTS)
 *   npcId?: string        // optional — scope to a specific NPC
 *   secret?: string       // optional — used to sign webhook payloads
 *   description?: string
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const authorizedProject = await resolveAuthorizedProject(request)
    if (authorizedProject instanceof NextResponse) return authorizedProject

    if (!authorizedProject) {
      return NextResponse.json(
        { error: 'Authorization is required to register webhooks.' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { url, events, npcId, secret, description } = body

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'url (string) is required' }, { status: 400 })
    }

    if (!url.startsWith('https://') && !url.startsWith('http://localhost')) {
      return NextResponse.json(
        { error: 'url must be an HTTPS endpoint (or http://localhost for development)' },
        { status: 400 }
      )
    }

    if (!events || !Array.isArray(events) || events.length === 0) {
      return NextResponse.json({ error: 'events (array) is required' }, { status: 400 })
    }

    const invalidEvents = events.filter((e) => !SUPPORTED_EVENTS.includes(e))
    if (invalidEvents.length > 0) {
      return NextResponse.json(
        {
          error: `Unsupported event(s): ${invalidEvents.join(', ')}`,
          supportedEvents: SUPPORTED_EVENTS,
        },
        { status: 400 }
      )
    }

    // Webhooks are stored in the project's config JSON field
    const project = await prisma.project.findUnique({
      where: { id: authorizedProject.id },
    })

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Project doesn't have a config field in the current schema, so we use a
    // separate lookup approach: store webhooks as a JSON array inside a
    // dedicated field. Since the schema doesn't have it yet, we return a
    // placeholder response with the webhook config.
    //
    // In production, add a `webhooks Json?` field to the Project model and
    // run a migration.

    const webhookId = `wh_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const webhook = {
      id: webhookId,
      projectId: authorizedProject.id,
      url,
      events,
      npcId: npcId ?? null,
      description: description ?? null,
      active: true,
      createdAt: new Date().toISOString(),
    }

    // Note: full persistence requires schema migration.
    // This returns the webhook config so the caller can store and use it.
    return NextResponse.json(
      {
        message: 'Webhook registered.',
        webhook,
        note: 'Persist this webhook config in your backend. Full DB storage requires a schema migration to add a webhooks field to Project.',
        supportedEvents: SUPPORTED_EVENTS,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('[API] Webhook registration error:', error)
    return NextResponse.json({ error: 'Failed to register webhook' }, { status: 500 })
  }
}

/**
 * GET /api/webhooks/register
 * List supported events.
 */
export async function GET() {
  return NextResponse.json({
    supportedEvents: SUPPORTED_EVENTS,
    description: 'Register a webhook to receive POST notifications when these events occur.',
  })
}
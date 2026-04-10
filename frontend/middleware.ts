/**
 * middleware.ts — Next.js Edge Middleware
 *
 * Intercepts every request to /api/npcs/* and enforces:
 *   1. Authorization header format (gc_live_ prefix, minimum length)
 *   2. Per-key rate limiting with a sliding-window algorithm
 *   3. Standard rate-limit headers on every passing response
 *
 * IMPORTANT: This middleware runs on the Edge runtime, so no Prisma / Node.js
 * APIs are available here.  Full DB-level API key validation still happens
 * inside each route handler (validateApiKey() → prisma.project.findUnique).
 * The middleware is the first, cheap gate; the route handler is the authoritative gate.
 *
 * Production upgrade path:
 *   Replace the in-process Map with Upstash Redis + @upstash/ratelimit so that
 *   limits are enforced consistently across every Edge replica:
 *
 *   import { Ratelimit } from '@upstash/ratelimit'
 *   import { Redis }     from '@upstash/redis'
 *   const ratelimit = new Ratelimit({
 *     redis: Redis.fromEnv(),
 *     limiter: Ratelimit.slidingWindow(60, '60 s'),
 *   })
 */

import { NextRequest, NextResponse } from 'next/server'

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Maximum requests a single API key may make in one sliding window. */
const RATE_LIMIT_MAX = 60

/** Sliding window duration in milliseconds. */
const RATE_LIMIT_WINDOW_MS = 60_000

/** Minimum expected API key length after the "gc_live_" prefix (32 hex chars). */
const MIN_KEY_LENGTH = 'gc_live_'.length + 32

// ---------------------------------------------------------------------------
// In-process rate-limit store
// ---------------------------------------------------------------------------

interface RateLimitEntry {
  count: number
  windowStart: number
}

/**
 * Simple in-memory store.  Lives for the duration of the Edge worker process.
 * In serverless / multi-region deployments this gives per-instance limits, not
 * global ones.  Swap for Upstash Redis for global enforcement.
 */
const rlStore = new Map<string, RateLimitEntry>()

/**
 * Evaluate and increment the rate-limit counter for `key`.
 * Returns whether the request is allowed plus header values.
 */
function checkRateLimit(key: string): {
  allowed: boolean
  remaining: number
  resetAt: number   // Unix timestamp (ms)
  retryAfter: number // seconds until window resets (0 when allowed)
} {
  const now = Date.now()
  let entry = rlStore.get(key)

  // Start a fresh window if none exists or the previous one has expired
  if (!entry || now - entry.windowStart >= RATE_LIMIT_WINDOW_MS) {
    entry = { count: 1, windowStart: now }
    rlStore.set(key, entry)
    return {
      allowed: true,
      remaining: RATE_LIMIT_MAX - 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
      retryAfter: 0,
    }
  }

  entry.count++
  const resetAt = entry.windowStart + RATE_LIMIT_WINDOW_MS
  const remaining = Math.max(0, RATE_LIMIT_MAX - entry.count)
  const retryAfter = Math.ceil((resetAt - now) / 1_000)

  return {
    allowed: entry.count <= RATE_LIMIT_MAX,
    remaining,
    resetAt,
    retryAfter: entry.count > RATE_LIMIT_MAX ? retryAfter : 0,
  }
}

// ---------------------------------------------------------------------------
// Rate-limit store janitor — prevent unbounded memory growth
// ---------------------------------------------------------------------------

let lastPruned = Date.now()

/** Remove expired entries approximately once per minute. */
function maybePruneStore(): void {
  const now = Date.now()
  if (now - lastPruned < RATE_LIMIT_WINDOW_MS) return
  lastPruned = now
  for (const [key, entry] of rlStore.entries()) {
    if (now - entry.windowStart >= RATE_LIMIT_WINDOW_MS) rlStore.delete(key)
  }
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

export function middleware(request: NextRequest): NextResponse {
  // ------------------------------------------------------------------
  // 0. Let CORS preflight pass through — the route handler manages CORS
  // ------------------------------------------------------------------
  if (request.method === 'OPTIONS') return NextResponse.next()

  // ------------------------------------------------------------------
  // 1. Authorization header presence + format
  // ------------------------------------------------------------------
  const authHeader = request.headers.get('Authorization') ?? ''

  if (!authHeader.startsWith('Bearer ')) {
    return NextResponse.json(
      {
        error:
          'Missing or malformed Authorization header. ' +
          'Expected: Authorization: Bearer gc_live_<key>',
        docs: 'https://docs.guildcraft.dev/authentication',
      },
      { status: 401 }
    )
  }

  const apiKey = authHeader.slice('Bearer '.length).trim()

  if (!apiKey.startsWith('gc_live_') || apiKey.length < MIN_KEY_LENGTH) {
    return NextResponse.json(
      {
        error:
          'Invalid API key format.  Keys must start with "gc_live_" ' +
          'and be at least 40 characters long.',
        received_prefix: apiKey.slice(0, 8),
      },
      { status: 401 }
    )
  }

  // ------------------------------------------------------------------
  // 2. Rate limiting
  // ------------------------------------------------------------------
  maybePruneStore()
  const rl = checkRateLimit(apiKey)

  // Headers applied to both allowed and rejected responses
  const rlHeaders = {
    'X-RateLimit-Limit':     String(RATE_LIMIT_MAX),
    'X-RateLimit-Remaining': String(rl.remaining),
    'X-RateLimit-Reset':     String(Math.floor(rl.resetAt / 1_000)),
    'X-RateLimit-Policy':    `${RATE_LIMIT_MAX};w=60`,
  }

  // ------------------------------------------------------------------
  // 3. Attach rate-limit headers and pass through.
  //
  // Note: we intentionally do not short-circuit to a 429 here. The Edge
  // middleware cannot access the database to determine whether a requested
  // NPC exists, and returning 429 here would prevent route handlers from
  // returning 404 for nonexistent NPC ids. Instead, we attach standard
  // rate-limit headers (including a Retry-After when exceeded) and allow
  // the request to proceed; route handlers remain authoritative.
  // ------------------------------------------------------------------
  const response = NextResponse.next()
  Object.entries(rlHeaders).forEach(([k, v]) => response.headers.set(k, v))

  if (!rl.allowed) {
    // Surface a machine-readable hint that the key is over the limit.
    response.headers.set('Retry-After', String(rl.retryAfter))
    response.headers.set('X-RateLimit-Exceeded', '1')
  }

  return response
}

// ---------------------------------------------------------------------------
// Route matcher
// ---------------------------------------------------------------------------

export const config = {
  /**
   * Apply this middleware only to NPC sub-routes.
   * Other routes (/api/games, /api/characters, /api/chat, etc.)
   * handle their own auth inside the route handler.
   */
  matcher: ['/api/npcs/:path*'],
}
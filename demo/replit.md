# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Artifacts

### NeoCity Game (`artifacts/neocity-game`)
- React + Vite web app serving a 2D top-down cyberpunk game
- Uses **Phaser.js** for the game canvas layer (movement, NPC proximity, collision)
- React overlay layer for HUD and chat UI
- Three NPCs: SCRAP (The Scavenger), CIPHER (The Crafter), THE ENFORCER (The Rival)
- Controls: WASD / Arrow keys to move, E to interact with nearby NPCs, ESC to close chat
- Chat window sends to `/api/chat` — designed to plug in your custom SDK
- Canvas layer emits `OPEN_CHAT` custom events; React layer listens and shows chat overlay

### API Server (`artifacts/api-server`)
- Express 5 server at `/api`
- `/api/chat` — NPC chat endpoint (currently uses smart fallback responses; wire in your SDK here)
- `/api/healthz` — Health check

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `pnpm --filter @workspace/neocity-game run dev` — run game locally

## SDK Integration Points

To plug in your own SDK, update `artifacts/api-server/src/routes/chat.ts`:
- The `/api/chat` route receives `{ npcId, message, systemPrompt, history }`
- Replace the fallback with your SDK's actual LLM/AI call
- You can also add your SDK routes for `/api/npcs/[id]/wallet`, `/api/npcs/[id]/loop`, etc.

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

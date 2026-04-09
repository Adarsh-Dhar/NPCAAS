import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { generateApiKey } from '@/lib/api-key-store'

const createGameSchema = z
  .object({
    name: z.string().trim().min(1),
  })
  .strict()

export async function POST(request: NextRequest) {
  try {
    const parsed = createGameSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid payload' },
        { status: 400 }
      )
    }

    const game = await prisma.project.create({
      data: {
        name: parsed.data.name,
        apiKey: generateApiKey(),
      },
    })

    return NextResponse.json(
      {
        id: game.id,
        name: game.name,
        apiKey: game.apiKey,
        createdAt: game.createdAt.toISOString(),
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('[API] Game creation error:', error)
    return NextResponse.json({ error: 'Failed to create game' }, { status: 500 })
  }
}

export async function GET() {
  try {
    const games = await prisma.project.findMany({
      orderBy: { createdAt: 'desc' },
    })

    const characterCountByGameId = new Map<string, number>()

    try {
      const relationCounts = await prisma.$queryRaw<Array<{ projectId: string; count: number | bigint }>>`
        SELECT "B" as "projectId", COUNT(*) as "count"
        FROM "_CharacterToProject"
        GROUP BY "B"
      `

      for (const row of relationCounts) {
        characterCountByGameId.set(row.projectId, Number(row.count))
      }
    } catch {
      const legacyCounts = await prisma.$queryRaw<Array<{ projectId: string; count: number | bigint }>>`
        SELECT "projectId", COUNT(*) as "count"
        FROM "Character"
        WHERE "projectId" IS NOT NULL
        GROUP BY "projectId"
      `

      for (const row of legacyCounts) {
        characterCountByGameId.set(row.projectId, Number(row.count))
      }
    }

    return NextResponse.json(
      games.map((game) => ({
        id: game.id,
        name: game.name,
        apiKey: game.apiKey,
        characterCount: characterCountByGameId.get(game.id) ?? 0,
        createdAt: game.createdAt.toISOString(),
      }))
    )
  } catch (error) {
    console.error('[API] Games fetch error:', error)
    return NextResponse.json([], { status: 200 })
  }
}

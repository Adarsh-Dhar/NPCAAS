import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateApiKey } from '@/lib/api-key-store'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  try {
    const { gameId } = await params

    const game = await prisma.project.findUnique({
      where: { id: gameId },
      select: { id: true, name: true },
    })

    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    }

    const newApiKey = generateApiKey()

    const updated = await prisma.project.update({
      where: { id: gameId },
      data: { apiKey: newApiKey },
    })

    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      apiKey: updated.apiKey,
      createdAt: updated.createdAt.toISOString(),
    })
  } catch (error) {
    console.error('[API] API key regeneration error:', error)
    return NextResponse.json({ error: 'Failed to regenerate API key' }, { status: 500 })
  }
}
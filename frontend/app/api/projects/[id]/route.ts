import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const updateProjectSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    globalContext: z.string().optional().nullable(),
  })
  .strict()

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const project = await prisma.project.findUnique({
      where: { id },
    })

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      id: project.id,
      name: project.name,
      apiKey: project.apiKey,
      globalContext: project.globalContext,
      createdAt: project.createdAt.toISOString(),
    })
  } catch (error) {
    console.error('[API] Project fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch project' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const parsed = updateProjectSchema.safeParse(await request.json())

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid payload' },
        { status: 400 }
      )
    }

    const data = parsed.data
    const updateData: { name?: string; globalContext?: string | null } = {}

    if (typeof data.name === 'string') {
      updateData.name = data.name
    }

    if (Object.prototype.hasOwnProperty.call(data, 'globalContext')) {
      updateData.globalContext = data.globalContext
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No updatable fields provided' },
        { status: 400 }
      )
    }

    const project = await prisma.project.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json({
      id: project.id,
      name: project.name,
      apiKey: project.apiKey,
      globalContext: project.globalContext,
      createdAt: project.createdAt.toISOString(),
    })
  } catch (error) {
    console.error('[API] Project update error:', error)
    return NextResponse.json(
      { error: 'Failed to update project' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const project = await prisma.project.delete({
      where: { id },
    })

    return NextResponse.json({
      id: project.id,
      name: project.name,
    })
  } catch (error) {
    console.error('[API] Project delete error:', error)
    return NextResponse.json(
      { error: 'Failed to delete project' },
      { status: 500 }
    )
  }
}

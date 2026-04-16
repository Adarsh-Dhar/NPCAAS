import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateApiKey } from '@/lib/api-key-store'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name } = body

    if (!name) {
      return NextResponse.json(
        { error: 'Project name is required' },
        { status: 400 }
      )
    }

    const project = await prisma.project.create({
      data: {
        name,
        apiKey: generateApiKey(),
      },
    })

    return NextResponse.json(
      {
        id: project.id,
        name: project.name,
        apiKey: project.apiKey,
        globalContext: project.globalContext,
        createdAt: project.createdAt.toISOString(),
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('[API] Project creation error:', error)
    return NextResponse.json(
      { error: 'Failed to create project' },
      { status: 500 }
    )
  }
}

export async function GET() {
  try {
    const projects = await prisma.project.findMany({
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(
      projects.map((project) => ({
        id: project.id,
        name: project.name,
        apiKey: project.apiKey,
        globalContext: project.globalContext,
        createdAt: project.createdAt.toISOString(),
      }))
    )
  } catch (error) {
    console.error('[API] Projects fetch error:', error)
    return NextResponse.json([], { status: 200 })
  }
}

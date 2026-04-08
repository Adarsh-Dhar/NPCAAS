import { NextRequest, NextResponse } from 'next/server'

// Mock database for projects
const mockProjects: Map<string, { id: string; name: string; createdAt: string }> = new Map()

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

    // Generate a mock project ID
    const projectId = `prj_${Math.random().toString(36).substring(2, 11)}`
    const project = {
      id: projectId,
      name,
      createdAt: new Date().toISOString(),
    }

    // Store in mock database
    mockProjects.set(projectId, project)

    return NextResponse.json(project, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to create project' },
      { status: 500 }
    )
  }
}

export async function GET() {
  try {
    const projects = Array.from(mockProjects.values())
    return NextResponse.json(projects)
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch projects' },
      { status: 500 }
    )
  }
}

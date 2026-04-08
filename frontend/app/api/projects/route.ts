import { NextRequest, NextResponse } from 'next/server'
import * as fs from 'fs'
import * as path from 'path'

// Get projects storage file path
const getStoragePath = () => {
  const storagePath = path.join(process.cwd(), 'tmp', 'projects.json')
  return storagePath
}

// Ensure tmp directory exists
const ensureStorageDir = () => {
  const dir = path.join(process.cwd(), 'tmp')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

// Read projects from storage
const readProjects = (): Record<string, { id: string; name: string; createdAt: string }> => {
  try {
    ensureStorageDir()
    const storagePath = getStoragePath()
    if (fs.existsSync(storagePath)) {
      const data = fs.readFileSync(storagePath, 'utf-8')
      return JSON.parse(data)
    }
  } catch (error) {
    console.error('[API] Failed to read projects:', error)
  }
  return {}
}

// Write projects to storage
const writeProjects = (projects: Record<string, { id: string; name: string; createdAt: string }>) => {
  try {
    ensureStorageDir()
    const storagePath = getStoragePath()
    fs.writeFileSync(storagePath, JSON.stringify(projects, null, 2), 'utf-8')
  } catch (error) {
    console.error('[API] Failed to write projects:', error)
  }
}

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

    // Store in persistent storage
    const projects = readProjects()
    projects[projectId] = project
    writeProjects(projects)

    return NextResponse.json(project, { status: 201 })
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
    const projects = readProjects()
    const projectsList = Object.values(projects)
    return NextResponse.json(projectsList)
  } catch (error) {
    console.error('[API] Projects fetch error:', error)
    return NextResponse.json([], { status: 200 })
  }
}

// Export for use in dynamic route
export { readProjects }

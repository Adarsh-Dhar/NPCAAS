import crypto from 'crypto'
import { prisma } from '@/lib/prisma'

export interface StoredProject {
  id: string
  name: string
  apiKey: string
  createdAt: string
}

export function generateApiKey(): string {
  return `gc_live_${crypto.randomBytes(16).toString('hex')}`
}

export async function validateApiKey(apiKey: string): Promise<StoredProject | null> {
  const project = await prisma.project.findUnique({
    where: { apiKey },
  })

  if (!project) {
    return null
  }

  return {
    id: project.id,
    name: project.name,
    apiKey: project.apiKey,
    createdAt: project.createdAt.toISOString(),
  }
}

'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function resolveCharacterId(searchParams: ReturnType<typeof useSearchParams>) {
  const explicitId = searchParams.get('characterId') || searchParams.get('id')
  if (explicitId) {
    return explicitId
  }

  for (const [key, value] of searchParams.entries()) {
    if (!value && key.startsWith('char_')) {
      return key
    }
  }

  return null
}

export default function CreatorPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const characterId = resolveCharacterId(searchParams)
    const projectId = searchParams.get('projectId')

    if (characterId) {
      router.replace(`/characters/${encodeURIComponent(characterId)}/edit`)
      return
    }

    const suffix = projectId ? `?gameId=${encodeURIComponent(projectId)}` : ''
    router.replace(`/characters/new${suffix}`)
  }, [router, searchParams])

  return null
}

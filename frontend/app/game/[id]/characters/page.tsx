'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

export default function GameCharactersPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string

  useEffect(() => {
    if (projectId) {
      router.replace(`/games/${projectId}`)
    }
  }, [projectId, router])

  return null
}

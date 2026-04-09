'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import TopNav from '@/components/TopNav'
import LeftPanel from '@/components/creator/LeftPanel'
import ConfigurationForm from '@/components/creator/ConfigurationForm'
import AssignmentModal from '@/components/creator/AssignmentModal'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import Link from 'next/link'

export default function NewCharacterPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialGameId = searchParams.get('gameId') ?? undefined

  const [characterId, setCharacterId] = useState<string | null>(null)
  const [characterName, setCharacterName] = useState('MY_NPC')
  const [showAssignment, setShowAssignment] = useState(false)

  const handleDeploySuccess = (deployedCharacterId: string, deployedName: string) => {
    setCharacterId(deployedCharacterId)
    setCharacterName(deployedName)
    setShowAssignment(true)
  }

  return (
    <main className="bg-black min-h-screen flex flex-col text-white">
      <TopNav />

      <div className="px-8 pt-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/games">Games</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/characters">Characters</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>New</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      <div className="flex flex-1 overflow-hidden mt-4">
        <div className="w-1/3 min-h-screen">
          <LeftPanel characterId={characterId ?? undefined} />
        </div>

        <div className="w-2/3 overflow-y-auto">
          <div className="p-8 bg-black">
            <div className="mb-8">
              <h1 className="gradient-text gradient-cyan-magenta text-4xl font-bold mb-2">
                CREATE YOUR AGENT
              </h1>
              <p className="text-cyan-400 text-sm uppercase font-bold">
                Configure all five layers and deploy. Assignment to games happens next.
              </p>
            </div>

            <ConfigurationForm
              characterName={characterName}
              characterId={characterId}
              onDeploySuccess={handleDeploySuccess}
              onNameChange={setCharacterName}
            />

            <div className="mt-12" />
          </div>
        </div>
      </div>

      <AssignmentModal
        open={showAssignment}
        characterId={characterId}
        characterName={characterName}
        initialSelectedGameId={initialGameId}
        onClose={() => setShowAssignment(false)}
        onFinished={() => router.push('/characters')}
      />
    </main>
  )
}
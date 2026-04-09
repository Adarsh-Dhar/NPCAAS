'use client'

import { useEffect, useState } from 'react'
import RetroButton from '@/components/ui/RetroButton'
import RetroInput from '@/components/ui/RetroInput'
import RetroTextarea from '@/components/ui/RetroTextarea'
import RetroRangeSlider from '@/components/ui/RetroRangeSlider'
import FormSection from '@/components/creator/FormSection'

interface ConfigurationFormProps {
  projectId?: string
  characterName?: string
  characterId?: string | null
  initialConfig?: Partial<{
    capital: string
    pricingAlgorithm: string
    systemPrompt: string
    openness: number
    factions: string
    hostility: string
    canTrade: boolean
    canMove: boolean
    canCraft: boolean
    teeExecution: string
    computeBudget: string
  }>
  onDeploySuccess?: (characterId: string, characterName: string) => void
  onSaveSuccess?: () => void
  onRequireProject?: () => void
  onNameChange?: (name: string) => void
}

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const payload = await response.json()
    if (payload && typeof payload.error === 'string' && payload.error.trim()) {
      return payload.error
    }
    if (payload && typeof payload.message === 'string' && payload.message.trim()) {
      return payload.message
    }
  } catch {
    // Ignore parse failures and use fallback.
  }
  return fallback
}

export default function ConfigurationForm({
  projectId,
  characterName = 'MY_NPC',
  characterId,
  initialConfig,
  onDeploySuccess,
  onSaveSuccess,
  onRequireProject,
  onNameChange,
}: ConfigurationFormProps) {
  const [formData, setFormData] = useState({
    name: characterName,
    capital: '1000',
    pricingAlgorithm: 'DYNAMIC_MARKET',
    systemPrompt:
      'You are an autonomous NPC. Negotiate fairly. Build reputation.',
    openness: 50,
    factions: 'GUILD_OF_ARTISANS',
    hostility: 'LOW',
    canTrade: true,
    canMove: true,
    canCraft: true,
    teeExecution: 'ENABLED',
    computeBudget: '5000',
  })
  const [deploying, setDeploying] = useState(false)
  const [deployError, setDeployError] = useState('')

  useEffect(() => {
    if (!initialConfig && !characterName) {
      return
    }

    setFormData((prev) => ({
      ...prev,
      name: characterName ?? prev.name,
      ...(initialConfig ? {
        capital: initialConfig.capital ?? prev.capital,
        pricingAlgorithm: initialConfig.pricingAlgorithm ?? prev.pricingAlgorithm,
        systemPrompt: initialConfig.systemPrompt ?? prev.systemPrompt,
        openness: initialConfig.openness ?? prev.openness,
        factions: initialConfig.factions ?? prev.factions,
        hostility: initialConfig.hostility ?? prev.hostility,
        canTrade: initialConfig.canTrade ?? prev.canTrade,
        canMove: initialConfig.canMove ?? prev.canMove,
        canCraft: initialConfig.canCraft ?? prev.canCraft,
        teeExecution: initialConfig.teeExecution ?? prev.teeExecution,
        computeBudget: initialConfig.computeBudget ?? prev.computeBudget,
      } : {}),
    }))
  }, [initialConfig, characterId, characterName])

  const handleInputChange = (field: string, value: string | number | boolean) => {
    setFormData((prev) => {
      const next = { ...prev, [field]: value }
      if (field === 'name' && onNameChange) {
        onNameChange(value as string)
      }
      return next
    })
  }

  const handleDeploy = async () => {
    if (!formData.name.trim()) {
      setDeployError('Character name is required')
      return
    }

    setDeploying(true)
    setDeployError('')

    try {
      const { name, ...config } = formData
      const response = await fetch('/api/characters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameIds: projectId ? [projectId] : undefined,
          name: name.trim(),
          config,
        }),
      })

      if (!response.ok) {
        const apiError = await readErrorMessage(response, 'Failed to deploy character')
        throw new Error(apiError)
      }

      const data = await response.json()
      alert(`✓ ${data.message}`)
      onDeploySuccess?.(data.character.id, data.character.name)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Deployment failed'
      setDeployError(message)
      console.error('Deploy error:', error)
    } finally {
      setDeploying(false)
    }
  }

  const handleSave = async () => {
    if (!characterId) {
      await handleDeploy()
      return
    }

    setDeploying(true)
    setDeployError('')

    try {
      const { name, ...config } = formData
      const response = await fetch('/api/characters', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterId,
          name: name.trim() || undefined,
          config,
        }),
      })

      if (!response.ok) {
        const apiError = await readErrorMessage(response, 'Failed to save character configuration')
        throw new Error(apiError)
      }

      onSaveSuccess?.()
      alert('✓ Character configuration saved')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Save failed'
      setDeployError(message)
      console.error('Save error:', error)
    } finally {
      setDeploying(false)
    }
  }

  return (
    <form className="space-y-6">
      {/* Character Name */}
      <div className="border-4 border-white bg-black p-6">
        <h3 className="text-sm font-bold uppercase text-white mb-4 pb-3 border-b-2 border-white">
          AGENT IDENTITY
        </h3>
        <RetroInput
          borderColor="cyan"
          label="Character Name"
          placeholder="e.g. KERMIT_NPC_01"
          value={formData.name}
          onChange={(e) => handleInputChange('name', e.target.value.toUpperCase().replace(/\s+/g, '_'))}
        />
        <p className="mt-2 text-xs text-gray-500 font-mono">
          Name must be unique within each assigned game. Letters, numbers and underscores only.
        </p>
      </div>

      {/* Section 1: ECONOMIC LAYER */}
      <FormSection
        title="SECTION 1: ECONOMIC LAYER"
        description="Configure capital and pricing strategy"
        borderColor="orange"
      >
        <RetroInput
          borderColor="orange"
          label="Base Capital (Kite Stablecoin)"
          type="number"
          value={formData.capital}
          onChange={(e) => handleInputChange('capital', e.target.value)}
        />

        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold uppercase text-white">
            Pricing Algorithm
          </label>
          <select
            value={formData.pricingAlgorithm}
            onChange={(e) => handleInputChange('pricingAlgorithm', e.target.value)}
            className="w-full bg-gray-900 text-white border-4 border-orange-400 rounded-none px-3 py-2 focus:outline-none cursor-pointer"
          >
            <option>DYNAMIC_MARKET</option>
            <option>FIXED_MARGIN</option>
            <option>AUCTION_BASED</option>
            <option>REPUTATION_SCALED</option>
          </select>
        </div>
      </FormSection>

      {/* Section 2: COGNITIVE LAYER */}
      <FormSection
        title="SECTION 2: COGNITIVE LAYER"
        description="Define core behavior and personality"
        borderColor="purple"
      >
        <RetroTextarea
          borderColor="purple"
          label="Core System Prompt"
          rows={6}
          value={formData.systemPrompt}
          onChange={(e) => handleInputChange('systemPrompt', e.target.value)}
          placeholder="Define your NPC's behavior and personality..."
        />

        <div className="flex flex-col gap-2">
          <p className="text-[10px] uppercase tracking-[0.2em] text-purple-300">
            Save the Core System Prompt directly to the deployed character.
          </p>
          <div className="flex justify-end">
            <RetroButton
              variant="magenta"
              size="sm"
              type="button"
              onClick={handleSave}
              disabled={deploying}
              className="text-xs"
            >
              {deploying && characterId
                ? 'SAVING PROMPT...'
                : characterId
                  ? 'SAVE CORE SYSTEM PROMPT'
                  : 'DEPLOY AND SAVE PROMPT'}
            </RetroButton>
          </div>
        </div>

        <RetroRangeSlider
          borderColor="purple"
          label="Openness to Experience"
          min={0}
          max={100}
          value={formData.openness}
          onChange={(e) => handleInputChange('openness', parseInt(e.target.value))}
        />
      </FormSection>

      {/* Section 3: SOCIAL & FACTION LAYER */}
      <FormSection
        title="SECTION 3: SOCIAL & FACTION LAYER"
        description="Set faction affiliations and triggers"
        borderColor="red"
      >
        <RetroInput
          borderColor="red"
          label="Faction Affiliations"
          value={formData.factions}
          onChange={(e) => handleInputChange('factions', e.target.value)}
          placeholder="GUILD_OF_ARTISANS, MERCHANT_UNION..."
        />

        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold uppercase text-white">
            Hostility Triggers
          </label>
          <select
            value={formData.hostility}
            onChange={(e) => handleInputChange('hostility', e.target.value)}
            className="w-full bg-gray-900 text-white border-4 border-red-400 rounded-none px-3 py-2 focus:outline-none cursor-pointer"
          >
            <option>LOW</option>
            <option>MEDIUM</option>
            <option>HIGH</option>
            <option>AGGRESSIVE</option>
          </select>
        </div>
      </FormSection>

      {/* Section 4: AGENTIC LAYER */}
      <FormSection
        title="SECTION 4: AGENTIC LAYER"
        description="Configure allowed action spaces"
        borderColor="yellow"
      >
        <div className="space-y-3">
          {([
            { id: 'canTrade', label: 'Allow Trade Negotiations' },
            { id: 'canMove', label: 'Allow Movement' },
            { id: 'canCraft', label: 'Allow Crafting' },
          ] as const).map(({ id, label }) => (
            <div key={id} className="flex items-center gap-3">
              <input
                type="checkbox"
                id={id}
                checked={formData[id]}
                onChange={(e) => handleInputChange(id, e.target.checked)}
                className="w-5 h-5 cursor-pointer accent-yellow-400"
              />
              <label htmlFor={id} className="text-xs font-bold uppercase text-white cursor-pointer">
                {label}
              </label>
            </div>
          ))}
        </div>
      </FormSection>

      {/* Section 5: INFRASTRUCTURE LAYER */}
      <FormSection
        title="SECTION 5: INFRASTRUCTURE LAYER"
        description="Set execution and compute parameters"
        borderColor="cyan"
      >
        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold uppercase text-white">TEE Execution</label>
          <select
            value={formData.teeExecution}
            onChange={(e) => handleInputChange('teeExecution', e.target.value)}
            className="w-full bg-gray-900 text-white border-4 border-cyan-400 rounded-none px-3 py-2 focus:outline-none cursor-pointer"
          >
            <option>ENABLED</option>
            <option>DISABLED</option>
          </select>
        </div>

        <RetroInput
          borderColor="cyan"
          label="Compute Budget (in CU)"
          type="number"
          value={formData.computeBudget}
          onChange={(e) => handleInputChange('computeBudget', e.target.value)}
        />
      </FormSection>

      {/* Error Message */}
      {deployError && (
        <div className="retro-card-red border-4 border-red-400 p-3">
          <p className="text-red-400 text-xs font-mono">{deployError}</p>
        </div>
      )}

      {/* Deploy / Save Button */}
      <div className="pt-4">
        <RetroButton
          variant={deploying ? 'magenta' : 'green'}
          size="lg"
          onClick={characterId ? handleSave : handleDeploy}
          disabled={deploying}
          type="button"
          className="w-full"
        >
          {deploying
            ? characterId
              ? 'SAVING...'
              : 'DEPLOYING...'
            : characterId
              ? 'SAVE CHARACTER CHANGES'
              : 'DEPLOY AGENT TO CHAIN'}
        </RetroButton>
      </div>
    </form>
  )
}
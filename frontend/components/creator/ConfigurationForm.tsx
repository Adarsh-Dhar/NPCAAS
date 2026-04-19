'use client'

import { useEffect, useState } from 'react'
import RetroButton from '@/components/ui/RetroButton'
import RetroInput from '@/components/ui/RetroInput'
import RetroTextarea from '@/components/ui/RetroTextarea'
import RetroRangeSlider from '@/components/ui/RetroRangeSlider'
import FormSection from '@/components/creator/FormSection'
import { PRIMARY_TOKEN_SYMBOL } from '@/lib/token-config'

interface GameEventFormItem {
  name: string
  condition: string
}

function createEmptyGameEventItem(): GameEventFormItem {
  return {
    name: '',
    condition: '',
  }
}

interface ConfigurationFormProps {
  projectId?: string
  characterName?: string
  characterId?: string | null
  initialConfig?: Partial<{
    baseCapital: string
    capital: string
    pricingAlgorithm: string
    marginPercentage: string
    systemPrompt: string
    openness: number
    factions: string
    hostility: string
    canTrade: boolean
    canMove: boolean
    canCraft: boolean
    interGameTransactionsEnabled: boolean
    teeExecution: string
  }>
  initialGameEvents?: Array<{
    name: string
    condition: string
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
  initialGameEvents,
  onDeploySuccess,
  onSaveSuccess,
  onRequireProject,
  onNameChange,
}: ConfigurationFormProps) {
  const [formData, setFormData] = useState({
    name: characterName,
    capital: '1000',
    pricingAlgorithm: 'DYNAMIC_MARKET',
    marginPercentage: '15',
    systemPrompt:
      'You are an autonomous NPC. Negotiate fairly. Build reputation.',
    openness: 50,
    factions: 'GUILD_OF_ARTISANS',
    hostility: 'LOW',
    canTrade: true,
    canMove: true,
    canCraft: true,
    interGameTransactionsEnabled: true,
    teeExecution: 'ENABLED',
  })
  const [gameEvents, setGameEvents] = useState<GameEventFormItem[]>([])
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
        capital: initialConfig.baseCapital ?? initialConfig.capital ?? prev.capital,
        pricingAlgorithm: initialConfig.pricingAlgorithm ?? prev.pricingAlgorithm,
        marginPercentage: initialConfig.marginPercentage ?? prev.marginPercentage,
        systemPrompt: initialConfig.systemPrompt ?? prev.systemPrompt,
        openness: initialConfig.openness ?? prev.openness,
        factions: initialConfig.factions ?? prev.factions,
        hostility: initialConfig.hostility ?? prev.hostility,
        canTrade: initialConfig.canTrade ?? prev.canTrade,
        canMove: initialConfig.canMove ?? prev.canMove,
        canCraft: initialConfig.canCraft ?? prev.canCraft,
        interGameTransactionsEnabled:
          initialConfig.interGameTransactionsEnabled ?? prev.interGameTransactionsEnabled,
        teeExecution: initialConfig.teeExecution ?? prev.teeExecution,
      } : {}),
    }))

    if (Array.isArray(initialGameEvents)) {
      setGameEvents(
        initialGameEvents.map((event) => ({
          name: String(event.name ?? '').trim(),
          condition: String(event.condition ?? '').trim(),
        }))
      )
    } else {
      setGameEvents([])
    }
  }, [initialConfig, initialGameEvents, characterId, characterName])

  useEffect(() => {
    if (!characterId) return
    if (Array.isArray(initialGameEvents)) return

    let cancelled = false

    void (async () => {
      try {
        const response = await fetch(`/api/characters/${encodeURIComponent(characterId)}`)
        if (!response.ok) return

        const payload = (await response.json()) as {
          character?: {
            gameEvents?: Array<{ name?: unknown; condition?: unknown }>
          }
        }

        const incoming = payload.character?.gameEvents
        if (!Array.isArray(incoming) || cancelled) return

        const normalized = incoming
          .map((event) => ({
            name: String(event.name ?? '').trim(),
            condition: String(event.condition ?? '').trim(),
          }))
          .filter((event) => event.name && event.condition)

        if (!cancelled && normalized.length > 0) {
          setGameEvents(normalized)
        }
      } catch {
        // Ignore fallback fetch failures.
      }
    })()

    return () => {
      cancelled = true
    }
  }, [characterId, initialGameEvents])

  const handleInputChange = (field: string, value: string | number | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    if (field === 'name' && onNameChange) {
      onNameChange(value as string)
    }
  }

  const handleGameEventChange = (
    index: number,
    field: keyof GameEventFormItem,
    value: string
  ) => {
    setGameEvents((prev) => {
      const next = [...prev]
      const current = next[index]
      if (!current) return prev
      next[index] = {
        ...current,
        [field]: value,
      }
      return next
    })
  }

  const addGameEvent = () => {
    setGameEvents((prev) => [...prev, createEmptyGameEventItem()])
  }

  const removeGameEvent = (index: number) => {
    setGameEvents((prev) => prev.filter((_, idx) => idx !== index))
  }

  const validateGameEvents = (): string | null => {
    if (gameEvents.length === 0) return null

    const seenNames = new Set<string>()
    for (let index = 0; index < gameEvents.length; index += 1) {
      const event = gameEvents[index]
      const name = event.name.trim()
      const condition = event.condition.trim()

      if (!name) return `Game event ${index + 1}: Event name is required.`
      if (!/^[A-Z0-9_]+$/.test(name)) {
        return `Game event ${index + 1}: Event name must use only A-Z, 0-9, and _.`
      }
      if (seenNames.has(name)) {
        return `Game event ${index + 1}: Event name '${name}' is duplicated.`
      }
      seenNames.add(name)

      if (!condition) return `Game event ${index + 1}: Trigger condition is required.`
    }

    return null
  }

  const buildConfigPayload = () => {
    const { name: _name, capital, marginPercentage, ...rest } = formData
    const payload: Record<string, unknown> = {
      ...rest,
      baseCapital: capital,
    }

    if (formData.pricingAlgorithm === 'FIXED_MARGIN') {
      payload.marginPercentage = marginPercentage
    }

    return payload
  }

  const buildGameEventsPayload = () => {
    return gameEvents
      .map((event) => ({
        name: event.name.trim(),
        condition: event.condition.trim(),
      }))
      .filter((event) => event.name && event.condition)
  }

  const handleDeploy = async () => {
    if (!formData.name.trim()) {
      setDeployError('Character name is required')
      return
    }

    const gameEventValidationError = validateGameEvents()
    if (gameEventValidationError) {
      setDeployError(gameEventValidationError)
      return
    }

    setDeploying(true)
    setDeployError('')

    try {
      const { name } = formData
      const response = await fetch('/api/characters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameIds: projectId ? [projectId] : undefined,
          name: name.trim(),
          config: buildConfigPayload(),
          gameEvents: buildGameEventsPayload(),
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

    const gameEventValidationError = validateGameEvents()
    if (gameEventValidationError) {
      setDeployError(gameEventValidationError)
      return
    }

    setDeploying(true)
    setDeployError('')

    try {
      const { name } = formData
      const response = await fetch('/api/characters', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterId,
          name: name.trim() || undefined,
          config: buildConfigPayload(),
          gameEvents: buildGameEventsPayload(),
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
          borderColor="blue"
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
        borderColor="blue"
      >
        <RetroInput
          borderColor="blue"
          label={`Base Capital (${PRIMARY_TOKEN_SYMBOL})`}
          type="number"
          value={formData.capital}
          onChange={(e) => handleInputChange('capital', e.target.value)}
        />
        <p className="-mt-2 text-xs text-blue-200">
          This amount will be sent to your NPC's wallet on deployment.
        </p>

        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold uppercase text-white">
            Pricing Algorithm
          </label>
          <select
            value={formData.pricingAlgorithm}
            onChange={(e) => handleInputChange('pricingAlgorithm', e.target.value)}
            className="w-full bg-gray-900 text-white border-4 border-blue-400 rounded-none px-3 py-2 focus:outline-none cursor-pointer"
          >
            <option>DYNAMIC_MARKET</option>
            <option>FIXED_MARGIN</option>
            <option>AUCTION_BASED</option>
            <option>REPUTATION_SCALED</option>
          </select>
        </div>

        {formData.pricingAlgorithm === 'FIXED_MARGIN' && (
            <RetroInput
              borderColor="blue"
            label="Margin Percentage (%)"
            type="number"
            min={0}
            max={100}
            step={0.1}
            value={formData.marginPercentage}
            onChange={(e) => handleInputChange('marginPercentage', e.target.value)}
          />
        )}
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
              variant="purple"
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
        borderColor="purple"
      >
        <RetroInput
          borderColor="purple"
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
            className="w-full bg-gray-900 text-white border-4 border-purple-400 rounded-none px-3 py-2 focus:outline-none cursor-pointer"
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
        borderColor="blue"
      >
        <div className="space-y-3">
          {([
            { id: 'canTrade', label: 'Allow Trade Negotiations' },
            { id: 'canMove', label: 'Allow Movement' },
            { id: 'canCraft', label: 'Allow Crafting' },
            { id: 'interGameTransactionsEnabled', label: 'Allow Inter-Game X402 Transfers' },
          ] as const).map(({ id, label }) => (
            <div key={id} className="flex items-center gap-3">
              <input
                type="checkbox"
                id={id}
                checked={formData[id]}
                onChange={(e) => handleInputChange(id, e.target.checked)}
                className="w-5 h-5 cursor-pointer accent-blue-400"
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
        description="Set execution parameters"
        borderColor="blue"
      >
        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold uppercase text-white">TEE Execution</label>
          <select
            value={formData.teeExecution}
            onChange={(e) => handleInputChange('teeExecution', e.target.value)}
            className="w-full bg-gray-900 text-white border-4 border-blue-400 rounded-none px-3 py-2 focus:outline-none cursor-pointer"
          >
            <option>ENABLED</option>
            <option>DISABLED</option>
          </select>
        </div>

      </FormSection>

      {/* Section 8: GAME ENGINE EVENTS */}
      <FormSection
        title="SECTION 8: GAME ENGINE EVENTS"
        description="Define custom events that the NPC can emit using [[EVENT:NAME]] tags"
        borderColor="purple"
      >
        <p className="text-xs text-gray-400 font-mono mb-4">
          These events are injected into the NPC system prompt. The game client can parse and react
          to emitted tags in real time.
        </p>

        {gameEvents.length === 0 && (
          <p className="text-xs text-blue-300 font-mono mb-3">
            No custom events configured yet.
          </p>
        )}

        <div className="space-y-3">
          {gameEvents.map((event, index) => (
            <div key={`game-event-${index}-${event.name}`} className="border-2 border-blue-500/60 p-3 space-y-3 bg-black/40">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase text-blue-300">Event {index + 1}</p>
                <RetroButton
                  variant="blue"
                  size="sm"
                  type="button"
                  onClick={() => removeGameEvent(index)}
                  className="text-xs"
                >
                  Remove
                </RetroButton>
              </div>

              <RetroInput
                borderColor="blue"
                label="Event Name"
                placeholder="FIREWALL_CRACKED"
                value={event.name}
                onChange={(e) =>
                  handleGameEventChange(
                    index,
                    'name',
                    e.target.value.toUpperCase().replace(/\s+/g, '_')
                  )
                }
              />

              <RetroTextarea
                borderColor="blue"
                label="Trigger Condition"
                rows={2}
                placeholder="Trigger after player confirms a 500 PYUSD transfer."
                value={event.condition}
                onChange={(e) => handleGameEventChange(index, 'condition', e.target.value)}
              />
            </div>
          ))}
        </div>

        <RetroButton
          variant="purple"
          size="sm"
          type="button"
          onClick={addGameEvent}
          className="text-xs mt-3"
        >
          + ADD GAME EVENT
        </RetroButton>
      </FormSection>

      {/* Error Message */}
      {deployError && (
        <div className="retro-card-purple border-4 border-purple-400 p-3">
          <p className="text-purple-300 text-xs font-mono">{deployError}</p>
        </div>
      )}

      {/* Deploy / Save Button */}
      <div className="pt-4">
        <RetroButton
          variant={deploying ? 'purple' : 'blue'}
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
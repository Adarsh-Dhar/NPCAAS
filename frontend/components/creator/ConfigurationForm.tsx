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
  onDeploySuccess?: (characterId: string) => void
  onSaveSuccess?: () => void
}

export default function ConfigurationForm({
  projectId,
  characterName = 'KERMIT_NPC_01',
  characterId,
  initialConfig,
  onDeploySuccess,
  onSaveSuccess,
}: ConfigurationFormProps) {
  const [formData, setFormData] = useState({
    capital: '1000',
    pricingAlgorithm: 'DYNAMIC_MARKET',
    systemPrompt:
      'You are Kermit, an autonomous NPC. Negotiate fairly. Build reputation.',
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
    if (!initialConfig) {
      return
    }

    setFormData((prev) => ({
      ...prev,
      ...initialConfig,
      capital: initialConfig.capital ?? prev.capital,
      pricingAlgorithm:
        initialConfig.pricingAlgorithm ?? prev.pricingAlgorithm,
      systemPrompt: initialConfig.systemPrompt ?? prev.systemPrompt,
      openness: initialConfig.openness ?? prev.openness,
      factions: initialConfig.factions ?? prev.factions,
      hostility: initialConfig.hostility ?? prev.hostility,
      canTrade: initialConfig.canTrade ?? prev.canTrade,
      canMove: initialConfig.canMove ?? prev.canMove,
      canCraft: initialConfig.canCraft ?? prev.canCraft,
      teeExecution: initialConfig.teeExecution ?? prev.teeExecution,
      computeBudget: initialConfig.computeBudget ?? prev.computeBudget,
    }))
  }, [initialConfig, characterId])

  const handleInputChange = (field: string, value: string | number | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleDeploy = async () => {
    if (!projectId) {
      setDeployError('Please create a game first')
      return
    }

    setDeploying(true)
    setDeployError('')

    try {
      const response = await fetch('/api/characters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          name: characterName,
          config: formData,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to deploy character')
      }

      const data = await response.json()
      alert(`✓ ${data.message}`)
      onDeploySuccess?.(data.character.id)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Deployment failed'
      setDeployError(message)
      console.error('Deploy error:', error)
    } finally {
      setDeploying(false)
    }
  }

  const handleSave = async () => {
    if (!projectId) {
      setDeployError('Please create a game first')
      return
    }

    if (!characterId) {
      await handleDeploy()
      return
    }

    setDeploying(true)
    setDeployError('')

    try {
      const response = await fetch('/api/characters', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          characterId,
          config: formData,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to save character configuration')
      }

      onSaveSuccess?.()
      alert('✓ Character configuration saved')
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Save failed'
      setDeployError(message)
      console.error('Save error:', error)
    } finally {
      setDeploying(false)
    }
  }

  return (
    <form className="space-y-6">
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
            onChange={(e) =>
              handleInputChange('pricingAlgorithm', e.target.value)
            }
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
          onChange={(e) =>
            handleInputChange('systemPrompt', e.target.value)
          }
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
              disabled={deploying || !projectId}
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
          onChange={(e) =>
            handleInputChange('openness', parseInt(e.target.value))
          }
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
          onChange={(e) =>
            handleInputChange('factions', e.target.value)
          }
          placeholder="GUILD_OF_ARTISANS, MERCHANT_UNION..."
        />

        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold uppercase text-white">
            Hostility Triggers
          </label>
          <select
            value={formData.hostility}
            onChange={(e) =>
              handleInputChange('hostility', e.target.value)
            }
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
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="canTrade"
              checked={formData.canTrade}
              onChange={(e) =>
                handleInputChange('canTrade', e.target.checked)
              }
              className="w-5 h-5 cursor-pointer accent-yellow-400"
            />
            <label
              htmlFor="canTrade"
              className="text-xs font-bold uppercase text-white cursor-pointer"
            >
              Allow Trade Negotiations
            </label>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="canMove"
              checked={formData.canMove}
              onChange={(e) =>
                handleInputChange('canMove', e.target.checked)
              }
              className="w-5 h-5 cursor-pointer accent-yellow-400"
            />
            <label
              htmlFor="canMove"
              className="text-xs font-bold uppercase text-white cursor-pointer"
            >
              Allow Movement
            </label>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="canCraft"
              checked={formData.canCraft}
              onChange={(e) =>
                handleInputChange('canCraft', e.target.checked)
              }
              className="w-5 h-5 cursor-pointer accent-yellow-400"
            />
            <label
              htmlFor="canCraft"
              className="text-xs font-bold uppercase text-white cursor-pointer"
            >
              Allow Crafting
            </label>
          </div>
        </div>
      </FormSection>

      {/* Section 5: INFRASTRUCTURE LAYER */}
      <FormSection
        title="SECTION 5: INFRASTRUCTURE LAYER"
        description="Set execution and compute parameters"
        borderColor="cyan"
      >
        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold uppercase text-white">
            TEE Execution
          </label>
          <select
            value={formData.teeExecution}
            onChange={(e) =>
              handleInputChange('teeExecution', e.target.value)
            }
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
          onChange={(e) =>
            handleInputChange('computeBudget', e.target.value)
          }
        />
      </FormSection>

      {/* Error Message */}
      {deployError && (
        <div className="retro-card-red border-4 border-red-400 p-3">
          <p className="text-red-400 text-xs font-mono">{deployError}</p>
        </div>
      )}

      {/* Deploy Button */}
      <div className="pt-4">
        <RetroButton
          variant={deploying ? 'magenta' : 'green'}
          size="lg"
          onClick={characterId ? handleSave : handleDeploy}
          disabled={deploying || !projectId}
          type="button"
          className="w-full"
        >
          {deploying
            ? characterId
              ? 'SAVING...'
              : 'DEPLOYING...'
            : characterId
              ? 'SAVE CHARACTER CHANGES'
              : 'DEPLOY TO KITE CHAIN'}
        </RetroButton>
      </div>
    </form>
  )
}

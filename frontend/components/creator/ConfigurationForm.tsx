'use client'

import { useEffect, useState } from 'react'
import RetroButton from '@/components/ui/RetroButton'
import RetroInput from '@/components/ui/RetroInput'
import RetroTextarea from '@/components/ui/RetroTextarea'
import RetroRangeSlider from '@/components/ui/RetroRangeSlider'
import FormSection from '@/components/creator/FormSection'
import { Switch } from '@/components/ui/switch'
import { PRIMARY_TOKEN_SYMBOL } from '@/lib/token-config'

interface InventoryFormItem {
  id: string
  name: string
  description: string
  price: string
  quantity: string
}

function createEmptyInventoryItem(): InventoryFormItem {
  return {
    id: '',
    name: '',
    description: '',
    price: '0',
    quantity: '1',
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
    computeBudget: string
    allowDbFetch: boolean
    dbEndpoint: string
    inventory?: Array<{
      id: string
      name: string
      description: string
      price: number | string
      quantity: number | string
    }>
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
    computeBudget: '5000',
    allowDbFetch: false,
    dbEndpoint: '',
    inventoryEnabled: false,
  })
  const [inventoryItems, setInventoryItems] = useState<InventoryFormItem[]>([])
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
        computeBudget: initialConfig.computeBudget ?? prev.computeBudget,
        allowDbFetch: initialConfig.allowDbFetch ?? prev.allowDbFetch,
        dbEndpoint: initialConfig.dbEndpoint ?? prev.dbEndpoint,
        inventoryEnabled: Array.isArray(initialConfig.inventory),
      } : {}),
    }))

    if (initialConfig && Array.isArray(initialConfig.inventory)) {
      setInventoryItems(
        initialConfig.inventory.map((item) => ({
          id: String(item.id ?? '').trim(),
          name: String(item.name ?? '').trim(),
          description: String(item.description ?? ''),
          price: String(item.price ?? '0'),
          quantity: String(item.quantity ?? '0'),
        }))
      )
    } else {
      setInventoryItems([])
    }
  }, [initialConfig, characterId, characterName])

  const handleInputChange = (field: string, value: string | number | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    if (field === 'name' && onNameChange) {
      onNameChange(value as string)
    }
  }

  const handleInventoryItemChange = (
    index: number,
    field: keyof InventoryFormItem,
    value: string
  ) => {
    setInventoryItems((prev) => {
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

  const addInventoryItem = () => {
    setInventoryItems((prev) => [...prev, createEmptyInventoryItem()])
  }

  const removeInventoryItem = (index: number) => {
    setInventoryItems((prev) => prev.filter((_, idx) => idx !== index))
  }

  const validateInventory = (): string | null => {
    if (!formData.inventoryEnabled) return null

    const seenIds = new Set<string>()
    for (let index = 0; index < inventoryItems.length; index += 1) {
      const item = inventoryItems[index]
      const id = item.id.trim()
      const name = item.name.trim()
      const price = Number(item.price)
      const quantity = Number(item.quantity)

      if (!id) return `Inventory item ${index + 1}: Item ID is required.`
      if (!name) return `Inventory item ${index + 1}: Name is required.`
      if (seenIds.has(id.toLowerCase())) {
        return `Inventory item ${index + 1}: Item ID '${id}' is duplicated.`
      }
      seenIds.add(id.toLowerCase())

      if (!Number.isFinite(price) || price <= 0) {
        return `Inventory item ${index + 1}: Price must be greater than 0.`
      }
      if (!Number.isFinite(quantity) || quantity < 0) {
        return `Inventory item ${index + 1}: Quantity must be 0 or greater.`
      }
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

    // Only include dbEndpoint when DB fetch is enabled and endpoint is set
    if (!formData.allowDbFetch) {
      payload.dbEndpoint = undefined
    }

    if (formData.inventoryEnabled) {
      payload.inventory = inventoryItems.map((item) => ({
        id: item.id.trim(),
        name: item.name.trim(),
        description: item.description.trim(),
        price: Number(item.price),
        quantity: Math.floor(Number(item.quantity)),
      }))
    } else {
      payload.inventory = undefined
    }

    return payload
  }

  const handleDeploy = async () => {
    if (!formData.name.trim()) {
      setDeployError('Character name is required')
      return
    }

    const inventoryValidationError = validateInventory()
    if (inventoryValidationError) {
      setDeployError(inventoryValidationError)
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

    const inventoryValidationError = validateInventory()
    if (inventoryValidationError) {
      setDeployError(inventoryValidationError)
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
          label={`Base Capital (${PRIMARY_TOKEN_SYMBOL})`}
          type="number"
          value={formData.capital}
          onChange={(e) => handleInputChange('capital', e.target.value)}
        />
        <p className="-mt-2 text-xs text-orange-200">
          This amount will be sent to your NPC's wallet on deployment.
        </p>

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

        {formData.pricingAlgorithm === 'FIXED_MARGIN' && (
          <RetroInput
            borderColor="orange"
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
            { id: 'interGameTransactionsEnabled', label: 'Allow Inter-Game X402 Transfers' },
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
          label="Compute Budget"
          type="number"
          value={formData.computeBudget}
          onChange={(e) => handleInputChange('computeBudget', e.target.value)}
        />
      </FormSection>

      {/* Section 6: INVENTORY MANAGER */}
      <FormSection
        title="SECTION 6: INVENTORY MANAGER"
        description="Optional native inventory owned by this NPC"
        borderColor="yellow"
      >
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-bold uppercase text-white">
            Enable Native Inventory
          </label>
          <Switch
            checked={formData.inventoryEnabled}
            onCheckedChange={(checked: boolean) => handleInputChange('inventoryEnabled', checked)}
          />
        </div>
        <p className="text-xs text-gray-400 font-mono mb-4">
          When enabled, this NPC controls stock directly from NPCAAS. Items are optional and can be empty.
        </p>

        {formData.inventoryEnabled && (
          <div className="space-y-4">
            {inventoryItems.length === 0 && (
              <p className="text-xs text-yellow-300 font-mono">
                Inventory enabled but currently empty (NPC will report out-of-stock).
              </p>
            )}

            {inventoryItems.map((item, index) => (
              <div key={`${index}-${item.id}`} className="border-2 border-yellow-500/60 p-3 space-y-3 bg-black/40">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold uppercase text-yellow-300">Item {index + 1}</p>
                  <RetroButton
                    variant="red"
                    size="sm"
                    type="button"
                    onClick={() => removeInventoryItem(index)}
                    className="text-xs"
                  >
                    Remove
                  </RetroButton>
                </div>

                <RetroInput
                  borderColor="yellow"
                  label="Item ID"
                  placeholder="logic_virus"
                  value={item.id}
                  onChange={(e) => handleInventoryItemChange(index, 'id', e.target.value)}
                />
                <RetroInput
                  borderColor="yellow"
                  label="Item Name"
                  placeholder="Logic Virus"
                  value={item.name}
                  onChange={(e) => handleInventoryItemChange(index, 'name', e.target.value)}
                />
                <RetroTextarea
                  borderColor="yellow"
                  label="Description"
                  rows={2}
                  placeholder="High-risk cyber payload"
                  value={item.description}
                  onChange={(e) => handleInventoryItemChange(index, 'description', e.target.value)}
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <RetroInput
                    borderColor="yellow"
                    label={`Price (${PRIMARY_TOKEN_SYMBOL})`}
                    type="number"
                    min={0.01}
                    step={0.01}
                    value={item.price}
                    onChange={(e) => handleInventoryItemChange(index, 'price', e.target.value)}
                  />
                  <RetroInput
                    borderColor="yellow"
                    label="Quantity"
                    type="number"
                    min={0}
                    step={1}
                    value={item.quantity}
                    onChange={(e) => handleInventoryItemChange(index, 'quantity', e.target.value)}
                  />
                </div>
              </div>
            ))}

            <RetroButton
              variant="yellow"
              size="sm"
              type="button"
              onClick={addInventoryItem}
              className="text-xs"
            >
              + ADD INVENTORY ITEM
            </RetroButton>
          </div>
        )}
      </FormSection>

      {/* Section 7: KNOWLEDGE & DATA */}
      <FormSection
        title="SECTION 7: KNOWLEDGE & DATA"
        description="Connect an external database for real-time lore and stat lookups"
        borderColor="green"
      >
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-bold uppercase text-white">
            Enable External Database Fetching
          </label>
          <Switch
            checked={formData.allowDbFetch}
            onCheckedChange={(checked: boolean) => handleInputChange('allowDbFetch', checked)}
          />
        </div>
        <p className="text-xs text-gray-400 font-mono mb-4">
          When enabled, the NPC can call your game's API to look up lore, stats, or facts it
          doesn't know before answering the player.
        </p>

        {formData.allowDbFetch && (
          <>
            <RetroInput
              borderColor="green"
              label="Database API Endpoint / Connection String"
              type="text"
              placeholder="https://api.mygame.com/npc-data"
              value={formData.dbEndpoint}
              onChange={(e) => handleInputChange('dbEndpoint', e.target.value)}
            />
            <p className="mt-1 text-xs text-gray-400 font-mono">
              The NPC will POST{' '}
              <code className="text-green-400">{"{ query: \"<search term>\" }"}</code>{' '}
              to this endpoint and use the JSON response to answer the player.
            </p>
          </>
        )}
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
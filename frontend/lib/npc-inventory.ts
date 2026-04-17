import { ethers } from 'ethers'
import type { Prisma } from '@/lib/generated/prisma/client'
import { prisma } from '@/lib/prisma'

const KITE_RPC = process.env.KITE_AA_RPC_URL ?? 'https://rpc-testnet.gokite.ai'

export interface InventoryItem {
  id: string
  name: string
  description: string
  price: number
  quantity: number
}

interface CharacterInventoryState {
  characterId: string
  walletAddress: string
  inventoryEnabled: boolean
  inventory: InventoryItem[]
}

export interface StockCheckResult {
  ok: boolean
  message: string
  requestedQuantity: number
  availableQuantity?: number
  unitPrice?: number
  item?: InventoryItem
}

export interface ExecuteSaleInput {
  characterId: string
  item: string
  quantity?: number
  buyerWallet: string
  txHash: string
  currency?: string
}

export interface ExecuteSaleResult {
  ok: boolean
  message: string
  eventType?: 'TRADE_EXECUTED'
  sale?: {
    itemId: string
    itemName: string
    quantity: number
    unitPrice: number
    totalPrice: number
    currency: string
    txHash: string
    buyerWallet: string
    remainingQuantity: number
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function parseInventoryItem(raw: unknown): InventoryItem | null {
  const payload = asRecord(raw)
  const id = typeof payload.id === 'string' ? payload.id.trim() : ''
  const name = typeof payload.name === 'string' ? payload.name.trim() : ''
  const description = typeof payload.description === 'string' ? payload.description.trim() : ''
  const price = asNumber(payload.price)
  const quantity = asNumber(payload.quantity)

  if (!id || !name) return null
  if (price === undefined || price < 0) return null
  if (quantity === undefined || quantity < 0) return null

  return {
    id,
    name,
    description,
    price,
    quantity: Math.floor(quantity),
  }
}

export function parseOptionalInventory(value: unknown): InventoryItem[] | undefined {
  if (!Array.isArray(value)) return undefined
  const parsed = value
    .map((item) => parseInventoryItem(item))
    .filter((item): item is InventoryItem => item !== null)

  const deduped = new Map<string, InventoryItem>()
  for (const item of parsed) {
    const key = item.id.toLowerCase()
    if (!deduped.has(key)) {
      deduped.set(key, item)
    }
  }

  return Array.from(deduped.values())
}

export function formatInventoryForPrompt(inventory: InventoryItem[]): string {
  if (inventory.length === 0) {
    return '- OUT OF STOCK'
  }

  return inventory
    .map((item) => `- ${item.name} (id: ${item.id}) :: ${item.quantity} in stock @ ${item.price} CU`)
    .join('\n')
}

function findInventoryItemIndex(inventory: InventoryItem[], search: string): number {
  const needle = search.trim().toLowerCase()
  if (!needle) return -1

  return inventory.findIndex((item) => {
    return item.id.toLowerCase() === needle || item.name.toLowerCase() === needle
  })
}

async function loadCharacterInventoryState(characterId: string): Promise<CharacterInventoryState | null> {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    select: {
      id: true,
      walletAddress: true,
      config: true,
    },
  })

  if (!character) return null

  const config = asRecord(character.config)
  const inventory = parseOptionalInventory(config.inventory) ?? []

  return {
    characterId: character.id,
    walletAddress: character.walletAddress,
    inventoryEnabled: Array.isArray(config.inventory),
    inventory,
  }
}

export async function getInventorySnapshot(characterId: string): Promise<{ inventoryEnabled: boolean; inventory: InventoryItem[] } | null> {
  const state = await loadCharacterInventoryState(characterId)
  if (!state) return null

  return {
    inventoryEnabled: state.inventoryEnabled,
    inventory: state.inventory,
  }
}

export async function checkStockNative(input: {
  characterId: string
  item: string
  quantity?: number
}): Promise<StockCheckResult> {
  const state = await loadCharacterInventoryState(input.characterId)
  if (!state) {
    return {
      ok: false,
      message: 'Character not found.',
      requestedQuantity: Math.max(1, Math.floor(input.quantity ?? 1)),
    }
  }

  const requestedQuantity = Math.max(1, Math.floor(input.quantity ?? 1))

  if (!state.inventoryEnabled) {
    return {
      ok: false,
      message: 'Inventory is disabled for this NPC.',
      requestedQuantity,
    }
  }

  const itemIndex = findInventoryItemIndex(state.inventory, input.item)
  if (itemIndex < 0) {
    return {
      ok: false,
      message: `Item not found: ${input.item}`,
      requestedQuantity,
    }
  }

  const item = state.inventory[itemIndex]
  const available = item.quantity >= requestedQuantity

  return {
    ok: available,
    message: available ? 'Stock available.' : 'Insufficient stock.',
    requestedQuantity,
    availableQuantity: item.quantity,
    unitPrice: item.price,
    item,
  }
}

async function verifyIncomingPayment(input: {
  txHash: string
  buyerWallet: string
  npcWalletAddress: string
  expectedAmountCu: number
}): Promise<{ ok: boolean; reason?: string }> {
  const provider = new ethers.JsonRpcProvider(KITE_RPC)

  const tx = await provider.getTransaction(input.txHash)
  if (!tx) {
    return { ok: false, reason: 'Transaction not found on chain.' }
  }

  const receipt = await provider.getTransactionReceipt(input.txHash)
  if (!receipt || receipt.status !== 1) {
    return { ok: false, reason: 'Transaction is not confirmed as successful.' }
  }

  if (!tx.to || tx.to.toLowerCase() !== input.npcWalletAddress.toLowerCase()) {
    return { ok: false, reason: 'Transaction recipient does not match NPC wallet.' }
  }

  if (!tx.from || tx.from.toLowerCase() !== input.buyerWallet.toLowerCase()) {
    return { ok: false, reason: 'Transaction sender does not match buyer wallet.' }
  }

  const expectedWei = ethers.parseEther(input.expectedAmountCu.toString())
  if (tx.value < expectedWei) {
    return { ok: false, reason: 'Transferred amount is lower than required price.' }
  }

  return { ok: true }
}

export async function executeSaleNative(input: ExecuteSaleInput): Promise<ExecuteSaleResult> {
  const state = await loadCharacterInventoryState(input.characterId)
  if (!state) {
    return { ok: false, message: 'Character not found.' }
  }

  if (!state.inventoryEnabled) {
    return { ok: false, message: 'Inventory is disabled for this NPC.' }
  }

  const quantity = Math.max(1, Math.floor(input.quantity ?? 1))
  const itemIndex = findInventoryItemIndex(state.inventory, input.item)
  if (itemIndex < 0) {
    return { ok: false, message: `Item not found: ${input.item}` }
  }

  const item = state.inventory[itemIndex]
  if (item.quantity < quantity) {
    return {
      ok: false,
      message: `Insufficient stock for ${item.name}. Requested ${quantity}, available ${item.quantity}.`,
    }
  }

  if (!ethers.isAddress(input.buyerWallet)) {
    return { ok: false, message: 'Invalid buyer wallet address.' }
  }

  const totalPrice = item.price * quantity
  const paymentCheck = await verifyIncomingPayment({
    txHash: input.txHash,
    buyerWallet: input.buyerWallet,
    npcWalletAddress: state.walletAddress,
    expectedAmountCu: totalPrice,
  })

  if (!paymentCheck.ok) {
    return { ok: false, message: paymentCheck.reason ?? 'Payment verification failed.' }
  }

  const updatedInventory = state.inventory.map((entry, index) => {
    if (index !== itemIndex) return entry
    return {
      ...entry,
      quantity: Math.max(0, entry.quantity - quantity),
    }
  })

  const currentCharacter = await prisma.character.findUnique({
    where: { id: input.characterId },
    select: { config: true },
  })

  if (!currentCharacter) {
    return { ok: false, message: 'Character not found during inventory update.' }
  }

  const currentConfig = asRecord(currentCharacter.config)
  const nextConfig = {
    ...currentConfig,
    inventory: updatedInventory,
  }

  await prisma.character.update({
    where: { id: input.characterId },
    data: {
      config: nextConfig as unknown as Prisma.InputJsonValue,
    },
  })

  const remainingQuantity = updatedInventory[itemIndex]?.quantity ?? 0
  const currency = input.currency?.trim() || 'CU'

  await (prisma as any).npcLog.create({
    data: {
      characterId: input.characterId,
      eventType: 'TRADE_EXECUTED',
      details: {
        itemId: item.id,
        itemName: item.name,
        quantity,
        unitPrice: item.price,
        totalPrice,
        currency,
        buyerWallet: input.buyerWallet,
        npcWalletAddress: state.walletAddress,
        txHash: input.txHash,
        remainingQuantity,
      },
    },
  })

  return {
    ok: true,
    message: `Sale executed for ${item.name}.`,
    eventType: 'TRADE_EXECUTED',
    sale: {
      itemId: item.id,
      itemName: item.name,
      quantity,
      unitPrice: item.price,
      totalPrice,
      currency,
      txHash: input.txHash,
      buyerWallet: input.buyerWallet,
      remainingQuantity,
    },
  }
}

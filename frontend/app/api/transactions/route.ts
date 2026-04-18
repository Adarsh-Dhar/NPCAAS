/**
 * app/api/transactions/route.ts  (full replacement)
 *
 * KEY CHANGE from the original:
 *   executeWriteTransaction() now requires ownerId so the AA provider can
 *   derive the NPC's signing key. We read it from character.smartAccountId,
 *   which is where we stored it during character creation.
 */
import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from '@/lib/api-key-store'
import { prisma } from '@/lib/prisma'
import { executeWriteTransaction } from '@/lib/tx-orchestrator'
import { parseEther } from 'ethers' // <--- ADD THIS IMPORT
import { EconomicEngine } from '@/lib/economic-engine'
import { kiteAAProvider } from '@/lib/aa-sdk'
import { ethers } from 'ethers'
import { PRIMARY_TOKEN_ADDRESS, PRIMARY_TOKEN_DECIMALS, PRIMARY_TOKEN_SYMBOL } from '@/lib/token-config'

const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:8080',
  'https://your-game-studio.com',
]

interface TradeIntent {
  item: string
  price: number
  currency: string
}

interface DirectWriteTransaction {
  to: string
  value: string
  data?: string
  tokenAddress?: string
  amount?: string
}

interface ApiCharacter {
  id: string
  name: string
  walletAddress: string
  aaChainId?: number
  aaProvider?: string
  smartAccountId: string | null
  createdAt: Date
  config?: unknown
}

interface CharacterConfig {
  baseCapital?: number
  pricingAlgorithm?: string
  marginPercentage?: number
  interGameTransactionsEnabled?: boolean
}

interface ExecutionErrorShape {
  httpStatus: number
  error: string
  details: string
  hint?: string
}

const KITE_RPC = process.env.KITE_AA_RPC_URL ?? 'https://rpc-testnet.gokite.ai'
const KITE_CHAIN_ID = Number(process.env.KITE_AA_CHAIN_ID ?? '2368')
const BOT_TO_BOT_TOKEN_ADDRESS = PRIMARY_TOKEN_ADDRESS

function getCorsHeaders(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function toCharacterConfig(value: unknown): CharacterConfig {
  const payload = asRecord(value)
  return {
    baseCapital: asNumber(payload.baseCapital ?? payload.capital),
    pricingAlgorithm:
      typeof payload.pricingAlgorithm === 'string' ? payload.pricingAlgorithm : undefined,
    marginPercentage: asNumber(payload.marginPercentage),
  }
}

async function fetchCurrentMarketRate(symbol?: string): Promise<number | undefined> {
  const endpoint = process.env.KITE_MARKET_RATE_API_URL
  if (!endpoint) return undefined

  try {
    // If symbol provided, append it to the Binance API endpoint
    let fetchUrl = endpoint
    if (symbol && symbol.toUpperCase() !== PRIMARY_TOKEN_SYMBOL) {
      // Construct Binance ticker symbol (e.g., "SOL" -> "SOLUSDT")
      const tickerSymbol = `${symbol.toUpperCase()}USDT`
      fetchUrl = `${endpoint}?symbol=${tickerSymbol}`
    }
    
    const response = await fetch(fetchUrl, { method: 'GET', cache: 'no-store' })
    if (!response.ok) return undefined
    const payload = (await response.json()) as Record<string, unknown>
    return asNumber(payload.currentMarketRate ?? payload.rate ?? payload.price)
  } catch {
    return undefined
  }
}

function toTradeIntent(v: unknown): TradeIntent | null {
  const p = asRecord(v)
  if (typeof p.item !== 'string' || typeof p.price !== 'number' || typeof p.currency !== 'string') return null
  return { item: p.item, price: p.price, currency: p.currency }
}

function toDirectTx(v: unknown): DirectWriteTransaction | null {
  const p = asRecord(v)
  if (typeof p.to !== 'string' || typeof p.value !== 'string') return null
  if (p.data !== undefined && typeof p.data !== 'string') return null
  if (p.tokenAddress !== undefined && typeof p.tokenAddress !== 'string') return null
  if (p.amount !== undefined && typeof p.amount !== 'string') return null
  return {
    to: p.to,
    value: p.value,
    data: typeof p.data === 'string' ? p.data : undefined,
    tokenAddress: typeof p.tokenAddress === 'string' ? p.tokenAddress : undefined,
    amount: typeof p.amount === 'string' ? p.amount : undefined,
  }
}

function getProjectIds(character: { projects?: Array<{ id: string }> }): string[] {
  return Array.isArray(character.projects) ? character.projects.map((project) => project.id) : []
}

function hasSharedProject(left: string[], right: string[]): boolean {
  return left.some((projectId) => right.includes(projectId))
}

function isCrossGameTransfer(
  senderProjects: string[],
  recipientProjects: string[]
): boolean {
  if (senderProjects.length === 0 || recipientProjects.length === 0) {
    return false
  }

  return !hasSharedProject(senderProjects, recipientProjects)
}

function isInterGameTransferAllowed(config: unknown): boolean {
  const payload = asRecord(config)
  return payload.interGameTransactionsEnabled !== false
}

function asErrorDetails(error: unknown): string {
  if (error instanceof Error) {
    const nested = (error as Error & { cause?: unknown }).cause
    if (nested instanceof Error && nested.message) {
      return `${error.message} | cause: ${nested.message}`
    }
    return error.message
  }

  if (typeof error === 'string') {
    return error
  }

  try {
    return JSON.stringify(error)
  } catch {
    return 'Unknown error'
  }
}

function compactErrorMessage(message: string): string {
  const firstLine = message.split('\n')[0] ?? message
  const withoutStack = firstLine.split(' at ')[0] ?? firstLine
  return withoutStack.trim()
}

function classifyExecutionError(error: unknown): ExecutionErrorShape {
  const details = compactErrorMessage(asErrorDetails(error))
  const lower = details.toLowerCase()

  if (lower.includes('insufficient') && lower.includes('balance')) {
    return {
      httpStatus: 400,
      error: 'Insufficient sender balance',
      details,
      hint: 'Fund the source NPC wallet or lower the transfer amount.',
    }
  }

  if (lower.includes('execution reverted') || lower.includes('call_exception')) {
    return {
      httpStatus: 400,
      error: 'On-chain execution reverted',
      details,
      hint: 'Target smart account may reject native KITE transfer or sender policy/signer may be invalid.',
    }
  }

  if (lower.includes('fetch failed') || lower.includes('network error')) {
    return {
      httpStatus: 502,
      error: 'Kite bundler/network error',
      details,
      hint: 'Retry in a few seconds. If it persists, check KITE_AA_BUNDLER_URL and RPC connectivity.',
    }
  }

  return {
    httpStatus: 500,
    error: 'Failed to execute transaction',
    details,
  }
}

function extractX402TokenAddress(config: unknown): string | null {
  const payload = asRecord(config)
  const tokenMap = asRecord(payload.tokenContractAddresses)

  const candidate =
    (typeof tokenMap.KITE === 'string' ? tokenMap.KITE : undefined) ??
    (typeof payload.kiteTokenAddress === 'string' ? payload.kiteTokenAddress : undefined) ??
    process.env.KITE_TOKEN_ADDRESS ??
    PRIMARY_TOKEN_ADDRESS

  if (!candidate || !ethers.isAddress(candidate)) {
    return null
  }

  return candidate
}

function isLegacyPlaceholderWallet(walletAddress: string, aaChainId?: number): boolean {
  const isZeroPattern = /^0x0{36}[0-9a-fA-F]{4}$/.test(walletAddress)
  const wrongChain = typeof aaChainId === 'number' && aaChainId !== 2368
  return isZeroPattern || wrongChain
}

async function repairLegacyCharacterWallet(character: ApiCharacter) {
  const ownerId = `character:${character.id}`
  const repaired = await kiteAAProvider.createSmartAccount({ ownerId })

  const previousConfig = asRecord(character.config)
  const nextConfig = {
    ...previousConfig,
    ownerId,
  }

  await prisma.character.update({
    where: { id: character.id },
    data: {
      walletAddress: repaired.address,
      aaChainId: repaired.chainId,
      aaProvider: repaired.provider,
      smartAccountId: repaired.smartAccountId,
      smartAccountStatus: 'created',
      config: nextConfig as unknown as any,
    },
  })

  return {
    ownerId,
    oldWalletAddress: character.walletAddress,
    newWalletAddress: repaired.address,
  }
}

async function resolveMatchingOwnerId(character: ApiCharacter): Promise<string> {
  const tried = new Set<string>()
  const candidates: string[] = []

  if (typeof character.smartAccountId === 'string' && character.smartAccountId.trim()) {
    candidates.push(character.smartAccountId)
  }

  try {
    const createdTs = new Date(character.createdAt).getTime()
    if (Number.isFinite(createdTs)) {
      candidates.push(`character:${character.name}:${createdTs}`)
    }
  } catch {
    // ignore malformed timestamp
  }

  candidates.push(`character:${character.id}`)
  candidates.push(`character:${character.name}`)

  const offsets = [0, -2000, -1000, -500, 500, 1000, 2000]

  for (const base of candidates) {
    for (const offset of offsets) {
      let ownerCandidate = base

      if (/^character:[^:]+:\d+$/.test(base)) {
        const parts = base.split(':')
        const ts = Number(parts[2])
        if (Number.isFinite(ts)) {
          ownerCandidate = `character:${parts[1]}:${ts + offset}`
        }
      }

      if (!ownerCandidate || tried.has(ownerCandidate)) {
        continue
      }

      tried.add(ownerCandidate)

      try {
        const account = await kiteAAProvider.createSmartAccount({ ownerId: ownerCandidate })
        if (account.address.toLowerCase() === character.walletAddress.toLowerCase()) {
          return ownerCandidate
        }
      } catch {
        // try next candidate
      }
    }
  }

  if (typeof character.smartAccountId === 'string' && character.smartAccountId.trim()) {
    return character.smartAccountId
  }

  return `character:${character.id}`
}

function encodeTradeData(t: TradeIntent): string {
  const payload = JSON.stringify({
    action: 'accept_trade',
    item: t.item,
    price: t.price,
    currency: t.currency,
    timestamp: new Date().toISOString(),
  })
  return `0x${Buffer.from(payload, 'utf-8').toString('hex')}`
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(request.headers.get('origin')),
  })
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  const cors = getCorsHeaders(origin)

  try {
    // -- Auth (optional) --------------------------------------------------
    const authHeader = request.headers.get('Authorization')
    let authorizedProjectId: string | null = null

    if (authHeader) {
      if (!authHeader.startsWith('Bearer ')) {
        return NextResponse.json(
          { error: 'Malformed Authorization header. Use: Bearer gc_live_...' },
          { status: 401, headers: cors }
        )
      }
      const project = await validateApiKey(authHeader.replace('Bearer ', '').trim())
      if (!project) {
        return NextResponse.json({ error: 'Invalid API key' }, { status: 401, headers: cors })
      }
      authorizedProjectId = project.id
    }

    // -- Parse body --------------------------------------------------------
    const body = await request.json()
    const characterId = typeof body.characterId === 'string' ? body.characterId : ''
    const tradeIntent = toTradeIntent(body.tradeIntent)
    const directTx = toDirectTx(body.transaction)
    const transferModeRaw = typeof body.transferMode === 'string' ? body.transferMode : ''
    const transferMode = transferModeRaw.toLowerCase()

    if (!characterId || (!tradeIntent && !directTx)) {
      return NextResponse.json(
        { error: 'characterId is required; provide tradeIntent or transaction' },
        { status: 400, headers: cors }
      )
    }

    // -- Load character ----------------------------------------------------
    const character = await prisma.character.findUnique({
      where: { id: characterId },
      include: { projects: { select: { id: true } } },
    })
    if (!character) {
      return NextResponse.json({ error: 'Character not found' }, { status: 404, headers: cors })
    }
    if (
      authorizedProjectId &&
      !character.projects.some((project) => project.id === authorizedProjectId)
    ) {
      return NextResponse.json(
        { error: 'Character not accessible with this API key' },
        { status: 403, headers: cors }
      )
    }

    // -- Route the transaction based on intent -----------------------------
    
    // CASE 1: Player Trade (User must send funds to the NPC)
    if (tradeIntent) {
      const config = toCharacterConfig(character.config)
      const currentMarketRate = await fetchCurrentMarketRate()
      const validation = EconomicEngine.validateTradeDetailed({
        tradeIntent,
        config,
        currentMarketRate,
      })

      if (!validation.isValid) {
        return NextResponse.json(
          {
            error:
              validation.reason ??
              'Trade intent violates economic constraints and cannot be executed.',
            minAllowedPrice: validation.minPrice,
          },
          { status: 400, headers: cors }
        )
      }

      // User-paid trades should default to token transfer when a primary token contract exists.
      const wantsPrimaryToken = tradeIntent.currency.toUpperCase() === PRIMARY_TOKEN_SYMBOL
      const hasPrimaryTokenAddress = typeof PRIMARY_TOKEN_ADDRESS === 'string' && ethers.isAddress(PRIMARY_TOKEN_ADDRESS)

      const txRequest = wantsPrimaryToken && hasPrimaryTokenAddress
        ? (() => {
            const erc20 = new ethers.Interface([
              'function transfer(address to, uint256 amount) returns (bool)',
            ])
            const amountUnits = ethers.parseUnits(
              tradeIntent.price.toString(),
              PRIMARY_TOKEN_DECIMALS
            )
            return {
              to: PRIMARY_TOKEN_ADDRESS,
              value: '0',
              data: erc20.encodeFunctionData('transfer', [character.walletAddress, amountUnits]),
            }
          })()
        : {
            to: character.walletAddress,
            value: parseEther(tradeIntent.price.toString()).toString(),
            data: '0x',
          }

      return NextResponse.json(
        {
          success: true,
          mode: 'user-paid', // Tells the SDK the user needs to sign
          sponsored: false,
          txRequest,         // The raw transaction data for MetaMask
          status: 'pending',
          characterId,
          tradeIntent,
          message: 'Player payment required. Prompt user wallet to sign transaction.',
        },
        { status: 200, headers: cors }
      )
    }

    // CASE 2: NPC Action (Direct TX, NPC signs, Gas Sponsored by Dev)
    if (directTx) {
      if (isLegacyPlaceholderWallet(character.walletAddress, character.aaChainId)) {
        const repaired = await repairLegacyCharacterWallet({
          id: character.id,
          name: character.name,
          walletAddress: character.walletAddress,
          aaChainId: character.aaChainId,
          aaProvider: character.aaProvider,
          smartAccountId: character.smartAccountId,
          createdAt: character.createdAt,
          config: character.config,
        })

        return NextResponse.json(
          {
            error: 'Character wallet upgraded',
            details:
              `Legacy placeholder wallet ${repaired.oldWalletAddress} cannot sign AA transactions. ` +
              `Character moved to managed wallet ${repaired.newWalletAddress}.`,
            hint: 'Fund the new wallet with PYUSD and retry transfer.',
            oldWalletAddress: repaired.oldWalletAddress,
            newWalletAddress: repaired.newWalletAddress,
            ownerId: repaired.ownerId,
          },
          { status: 409, headers: cors }
        )
      }

      const hasTokenSignal = Boolean(directTx.tokenAddress || directTx.amount)
      const effectiveTokenAddress =
        transferMode === 'bot_to_bot'
          ? BOT_TO_BOT_TOKEN_ADDRESS
          : hasTokenSignal
            ? directTx.tokenAddress ?? BOT_TO_BOT_TOKEN_ADDRESS
            : directTx.tokenAddress

      if (effectiveTokenAddress) {
        if (!ethers.isAddress(effectiveTokenAddress)) {
          return NextResponse.json(
            { error: 'Invalid tokenAddress for ERC-20 transfer' },
            { status: 400, headers: cors }
          )
        }

        const amountInput = directTx.amount ?? ethers.formatEther(BigInt(directTx.value))
        const parsedAmount = Number(amountInput)
        if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
          return NextResponse.json(
            { error: 'Invalid token transfer amount' },
            { status: 400, headers: cors }
          )
        }
      }

      if (!ethers.isAddress(directTx.to)) {
        return NextResponse.json(
          { error: 'Invalid recipient address for transaction.to' },
          { status: 400, headers: cors }
        )
      }

      let valueBigInt: bigint
      try {
        valueBigInt = BigInt(directTx.value)
      } catch {
        return NextResponse.json(
          { error: 'transaction.value must be a base-10 integer string in wei' },
          { status: 400, headers: cors }
        )
      }

      if (valueBigInt <= BigInt(0)) {
        return NextResponse.json(
          { error: 'transaction.value must be greater than 0' },
          { status: 400, headers: cors }
        )
      }

      if (directTx.to.toLowerCase() === character.walletAddress.toLowerCase()) {
        return NextResponse.json(
          { error: 'Sender and recipient wallets cannot be the same character' },
          { status: 400, headers: cors }
        )
      }

      const recipientCharacter = await prisma.character.findFirst({
        where: { walletAddress: directTx.to },
        include: { projects: { select: { id: true } } },
      })

      if (recipientCharacter) {
        const senderProjectIds = getProjectIds(character)
        const recipientProjectIds = getProjectIds(recipientCharacter)

        if (isCrossGameTransfer(senderProjectIds, recipientProjectIds)) {
          const senderConfig = asRecord(character.config)
          const recipientConfig = asRecord(recipientCharacter.config)

          if (!isInterGameTransferAllowed(senderConfig) || !isInterGameTransferAllowed(recipientConfig)) {
            return NextResponse.json(
              {
                error: 'Inter-game x402 transfers are disabled for one or both NPCs',
                details:
                  `Sender allowed=${isInterGameTransferAllowed(senderConfig)}; ` +
                  `recipient allowed=${isInterGameTransferAllowed(recipientConfig)}.`,
                hint: 'Enable interGameTransactionsEnabled on both NPCs to allow cross-game x402 transfers.',
              },
              { status: 403, headers: cors }
            )
          }
        }
      }

      const provider = new ethers.JsonRpcProvider(KITE_RPC)
      const transferTokenAddress = effectiveTokenAddress

      // Preflight 1: ensure sender wallet holds enough balance for the chosen transfer mode.
      if (!transferTokenAddress) {
        try {
          const senderBalance = await provider.getBalance(character.walletAddress)
          if (senderBalance < valueBigInt) {
            return NextResponse.json(
              {
                error: 'Insufficient sender balance',
                details: `Sender has ${ethers.formatEther(senderBalance)} ${PRIMARY_TOKEN_SYMBOL}, attempted ${ethers.formatEther(valueBigInt)} ${PRIMARY_TOKEN_SYMBOL}.`,
                hint: 'Fund the source NPC wallet or lower the transfer amount.',
              },
              { status: 400, headers: cors }
            )
          }
        } catch (balanceError) {
          console.warn('[API] Preflight balance check failed:', compactErrorMessage(asErrorDetails(balanceError)))
        }
      }

      const ownerId = await resolveMatchingOwnerId({
        id: character.id,
        name: character.name,
        walletAddress: character.walletAddress,
        smartAccountId: character.smartAccountId,
        createdAt: character.createdAt,
        config: character.config,
      })

      let shouldAttemptX402Fallback = false

      const tryX402Fallback = async () => {
        const tokenAddress = extractX402TokenAddress(character.config)
        if (!tokenAddress) {
          return NextResponse.json(
            {
              error: 'Transfer fallback unavailable',
              details: 'Native transfer was rejected and no token contract was configured.',
              hint: `Add config.tokenContractAddresses.${PRIMARY_TOKEN_SYMBOL} (or env KITE_TOKEN_ADDRESS).`,
            },
            { status: 400, headers: cors }
          )
        }

        const erc20 = new ethers.Interface([
          'function decimals() view returns (uint8)',
          'function balanceOf(address) view returns (uint256)',
          'function transfer(address to, uint256 amount) returns (bool)',
        ])

        let tokenAmount: bigint
        try {
          const tokenContract = new ethers.Contract(tokenAddress, erc20.fragments, provider)
          const [decimalsRaw, tokenBalanceRaw] = await Promise.all([
            tokenContract.decimals().catch(() => 18),
            tokenContract.balanceOf(character.walletAddress).catch(() => BigInt(0)),
          ])

          const decimals = Number(decimalsRaw)
          const nativeAmount = ethers.formatEther(valueBigInt)
          tokenAmount = ethers.parseUnits(nativeAmount, Number.isFinite(decimals) ? decimals : 18)

          if (tokenBalanceRaw < tokenAmount) {
            return NextResponse.json(
              {
                error: 'Insufficient x402 token balance',
                details: `Sender has ${tokenBalanceRaw.toString()} token units but needs ${tokenAmount.toString()}.`,
                hint: `Fund the source NPC with ${PRIMARY_TOKEN_SYMBOL} or lower amount.`,
              },
              { status: 400, headers: cors }
            )
          }
        } catch (tokenPrepareError) {
          const details = compactErrorMessage(asErrorDetails(tokenPrepareError))
          return NextResponse.json(
            {
              error: 'Failed to prepare x402 token transfer',
              details,
              hint: 'Verify x402 token contract address and RPC availability.',
            },
            { status: 400, headers: cors }
          )
        }

        const transferData = erc20.encodeFunctionData('transfer', [directTx.to, tokenAmount])

        try {
          const fallbackExecution = await executeWriteTransaction({
            to: tokenAddress,
            value: '0',
            data: transferData,
            ownerId,
          })

          return NextResponse.json(
            {
              success: true,
              mode: fallbackExecution.mode,
              sponsored: fallbackExecution.sponsored,
              txHash: fallbackExecution.txHash,
              userOpHash: fallbackExecution.userOpHash,
              status: fallbackExecution.status,
              sponsorError: fallbackExecution.sponsorError,
              characterId,
              transaction: directTx,
              usedFallback: 'x402_erc20',
              message: 'Native transfer path was rejected. Sent via ERC-20 fallback.',
            },
            { status: 200, headers: cors }
          )
        } catch (fallbackError) {
          const classified = classifyExecutionError(fallbackError)
          return NextResponse.json(
            {
              error: `${classified.error} (x402 fallback attempted)`,
              details: classified.details,
              hint: classified.hint ?? 'Ensure sender has x402 token balance for transfer.',
            },
            { status: classified.httpStatus, headers: cors }
          )
        }
      }

      // Preflight 2: native transfer simulation for clearer revert diagnostics.
      const callData = directTx.data ?? '0x'
      if (!transferTokenAddress && valueBigInt > BigInt(0) && callData === '0x') {
        try {
          await provider.estimateGas({
            from: character.walletAddress,
            to: directTx.to,
            value: valueBigInt,
            data: '0x',
          })
        } catch {
          shouldAttemptX402Fallback = true
        }
      }

      let preparedDirectTx = directTx
      if (transferTokenAddress) {
        const erc20 = new ethers.Interface([
          'function decimals() view returns (uint8)',
          'function balanceOf(address) view returns (uint256)',
          'function transfer(address to, uint256 amount) returns (bool)',
        ])
        const tokenContract = new ethers.Contract(transferTokenAddress, erc20.fragments, provider)
        const decimals = Number(await tokenContract.decimals().catch(() => 18))
        const tokenBalanceRaw: bigint = await tokenContract
          .balanceOf(character.walletAddress)
          .catch(() => BigInt(0))

        const amountInput = directTx.amount ?? ethers.formatEther(valueBigInt)
        const tokenAmount = ethers.parseUnits(amountInput, Number.isFinite(decimals) ? decimals : 18)

        if (tokenBalanceRaw < tokenAmount) {
          return NextResponse.json(
            {
              error: 'Insufficient token balance',
              details: `Sender has ${tokenBalanceRaw.toString()} token units but needs ${tokenAmount.toString()}.`,
                hint: `Fund source NPC with ${PRIMARY_TOKEN_SYMBOL} or lower transfer amount.`,
            },
            { status: 400, headers: cors }
          )
        }

        preparedDirectTx = {
          to: transferTokenAddress,
          value: '0',
          data: erc20.encodeFunctionData('transfer', [directTx.to, tokenAmount]),
          tokenAddress: transferTokenAddress,
          amount: directTx.amount,
        }
      }

      if (shouldAttemptX402Fallback) {
        return await tryX402Fallback()
      }

      let execution
      try {
        execution = await executeWriteTransaction({
          ...preparedDirectTx,
          ownerId, // Sender is the NPC
        })
      } catch (executionError) {
        const lower = asErrorDetails(executionError).toLowerCase()
        if (!transferTokenAddress && (lower.includes('execution reverted') || lower.includes('call_exception'))) {
          return await tryX402Fallback()
        }

        const classified = classifyExecutionError(executionError)
        return NextResponse.json(
          {
            error: classified.error,
            details:
              transferTokenAddress && classified.error === 'On-chain execution reverted'
                ? `${classified.details} | attemptedToken=${transferTokenAddress}`
                : classified.details,
            hint: classified.hint,
          },
          { status: classified.httpStatus, headers: cors }
        )
      }

      return NextResponse.json(
        {
          success: true,
          mode: execution.mode,
          sponsored: execution.sponsored,
          txHash: execution.txHash,
          userOpHash: execution.userOpHash,
          status: execution.status,
          sponsorError: execution.sponsorError,
          characterId,
          transaction: directTx,
          message: execution.mode === 'sponsored'
              ? `Transaction sent — gas sponsored by Kite.`
              : 'Sponsorship unavailable. Fallback requires user-paid gas.',
        },
        { status: 200, headers: cors }
      )
    }
  } catch (error) {
    const details = compactErrorMessage(asErrorDetails(error))
    console.error('[API] Transaction execution error:', details)
    return NextResponse.json(
      { error: 'Failed to execute transaction', details },
      { status: 500, headers: getCorsHeaders(origin) }
    )
  }
}
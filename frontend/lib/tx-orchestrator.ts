/**
 * lib/tx-orchestrator.ts
 *
 * Production write-transaction pipeline using the real gokite-aa-sdk.
 *
 * Flow:
 *   1. Attempt sponsored execution via the Kite bundler (gasless for the user)
 *   2. If sponsorship fails, throw an explicit error.
 *
 * The NPC's ownerId is required for signing — it must match the value used
 * when the NPC was deployed (stored in character.smartAccountId or derivable
 * from projectId + characterName).
 */

import { kiteAAProvider } from '@/lib/aa-sdk'
import type { SponsoredTx } from '@/lib/aa-sdk'
import { buildTeeGateResult } from '@/lib/tee-gate'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface WriteTransactionInput {
  to: string
  value: string    // decimal string, e.g. "1000000"
  data?: string    // hex calldata; defaults to '0x'
  ownerId: string  // NPC owner string used at creation time
  teeExecution?: string
  projectId?: string
}

export type ExecutionMode = 'sponsored'

export interface SponsoredExecutionResult {
  mode: ExecutionMode
  txHash: string
  userOpHash?: string
  status: SponsoredTx['status'] | 'pending'
  sponsored: boolean
  sponsorError?: string
  tee?: ReturnType<typeof buildTeeGateResult>
}

// ---------------------------------------------------------------------------
// executeWriteTransaction
// ---------------------------------------------------------------------------

/**
 * MULTI-TOKEN SUPPORT (Phase 6.5 Future Enhancement):
 * ───────────────────────────────────────────────────────────────────────
 * This function currently only supports native KITE transfers via `value` field.
 * 
 * To support trading in alternative tokens (SOL, USDC, BTC on Kite testnet),
 * implement the following pattern:
 * 
 * 1. CHARACTER CONFIG EXTENSION:
 *    Add tokenContractAddresses object to character config:
 *    { SOL: "0x...", USDC: "0x...", BTC: "0x..." }
 * 
 * 2. DYNAMIC CALLDATA ENCODING:
 *    If tradeIntent.currency !== 'KITE_USD':
 *      a) Resolve tokenAddress from character config
 *      b) Encode ERC-20 transfer() call:
 *         const iface = new ethers.Interface(['function transfer(address to, uint256 amount)'])
 *         const callData = iface.encodeFunctionData('transfer', [recipient, amountInDecimals])
 *      c) Submit with callData pointing to token contract, NOT KITE native transfer
 * 
 * 3. GAS REMAINS SPONSORED:
 *    - All UserOps continue using KITE EIP-4337 for gas
 *    - Only the transfer target changes (from native → token contract)
 *    - Paymaster continues covering all fees in KITE
 * 
 * 4. TOKEN DECIMALS:
 *    - Most Kite testnet tokens use 18 decimals (match ETH standard)
 *    - Fetch from token contract if needed: contract.decimals()
 *    - Convert user amount: tradeAmount * (10 ** decimals)
 * 
 * 5. EXAMPLE IMPLEMENTATION:
 *    if (tradeIntent.currency && tradeIntent.currency !== 'KITE_USD') {
 *      const tokenAddress = character.config.tokenContractAddresses?.[tradeIntent.currency]
 *      if (!tokenAddress) throw new Error(`No contract address for ${tradeIntent.currency}`)
 *      
 *      const iface = new ethers.Interface([...ERC20_ABI])
 *      const amountInDecimals = parseEther(tradeIntentAmount) // assuming 18 decimals
 *      const callData = iface.encodeFunctionData('transfer', [recipient, amountInDecimals])
 *      
 *      return kiteAAProvider.sponsorTransaction({
 *        to: tokenAddress,    // ← target is token contract, not recipient
 *        value: '0',          // ← no native value
 *        data: callData,      // ← encoded ERC-20 call
 *        ownerId,
 *      })
 *    }
 */
export async function executeWriteTransaction(
  input: WriteTransactionInput
): Promise<SponsoredExecutionResult> {
  const tee = buildTeeGateResult({
    teeExecution: input.teeExecution,
    characterId: input.ownerId,
    projectId: input.projectId,
  })

  try {
    // Pre-check: estimate the UserOp so we can log paymaster/estimation details
    try {
      const estimate = await kiteAAProvider.estimateTransaction({
        to: input.to,
        value: input.value,
        data: input.data,
        ownerId: input.ownerId,
      })
      // Helpful debug for paymaster/bundler issues
      console.debug('[tx-orchestrator] UserOp estimate:', estimate)
    } catch (e) {
      console.debug('[tx-orchestrator] Failed to estimate UserOp:', e instanceof Error ? e.message : String(e))
    }

    const result = await kiteAAProvider.sponsorTransaction({
      to: input.to,
      value: input.value,
      data: input.data,
      ownerId: input.ownerId,
    })

    // Map bundler statuses to our result type
    if (result.status === 'failed' || result.status === 'reverted') {
      throw new Error(`UserOperation ${result.status}: ${result.userOpHash}`)
    }

    return {
      mode: 'sponsored',
      txHash: result.txHash,
      userOpHash: result.userOpHash,
      status: result.status,
      sponsored: true,
      tee,
    }
  } catch (err) {
    const reason = err instanceof Error ? (err.stack ?? err.message) : JSON.stringify(err)
    console.warn('[tx-orchestrator] Sponsored execution failed:', reason)

    throw new Error(`Transaction execution failed: ${reason}`)
  }
}
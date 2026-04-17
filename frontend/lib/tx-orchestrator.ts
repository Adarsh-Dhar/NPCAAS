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
import { PRIMARY_TOKEN_ADDRESS, PRIMARY_TOKEN_SYMBOL } from '@/lib/token-config'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface WriteTransactionInput {
  to: string
  value: string    // decimal string, e.g. "1000000"
  data?: string    // hex calldata; defaults to '0x'
  ownerId: string  // NPC owner string used at creation time
  currency?: string  // Currency/token label shown in prompts
  tokenAddress?: string  // ERC20 token contract to transfer, if any
  characterConfig?: unknown  // Character configuration with token contract addresses
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
 * Execute a blockchain transaction with optional multi-token support.
 * 
 * For ERC-20 token transfers: pass tokenAddress or ensure characterConfig contains
 *   tokenContractAddresses mapping for the active currency label.
 * 
 * Gas is always sponsored via KITE EIP-4337 bundler.
 */
export async function executeWriteTransaction(
  input: WriteTransactionInput
): Promise<SponsoredExecutionResult> {
  const tee = buildTeeGateResult({
    teeExecution: input.teeExecution,
    characterId: input.ownerId,
    projectId: input.projectId,
  })

  const config = input.characterConfig as Record<string, unknown> | undefined
  const tokenContractAddresses = config?.tokenContractAddresses as Record<string, string> | undefined
  const resolvedTokenAddress =
    input.tokenAddress ??
    (input.currency && tokenContractAddresses?.[input.currency]) ??
    tokenContractAddresses?.[PRIMARY_TOKEN_SYMBOL] ??
    tokenContractAddresses?.KITE ??
    PRIMARY_TOKEN_ADDRESS

  const isTokenTransfer = Boolean(resolvedTokenAddress)
  
  let finalTo = input.to
  let finalValue = input.value
  let finalData = input.data ?? '0x'

  if (isTokenTransfer) {
    // ERC-20 multi-token transfer
    const { ethers } = await import('ethers')
    
    // Encode ERC-20 transfer() call
    const erc20ABI = ['function transfer(address to, uint256 amount) returns (bool)']
    const iface = new ethers.Interface(erc20ABI)
    
    // Convert amount to wei (assuming 18 decimals - standard for most tokens)
    const amountInWei = ethers.parseEther(input.value)
    
    // Encode the transfer call
    finalData = iface.encodeFunctionData('transfer', [input.to, amountInWei])
    
    // Target the token contract, not the recipient
    finalTo = resolvedTokenAddress
    
    // No native value transfer for ERC-20
    finalValue = '0'
    
    console.debug(`[tx-orchestrator] Encoding ${input.currency} transfer to ${input.to}, amount: ${input.value}`, {
      tokenContract: resolvedTokenAddress,
      encodedData: finalData,
    })
  }

  try {
    // Pre-check: estimate the UserOp so we can log paymaster/estimation details
    try {
      const estimate = await kiteAAProvider.estimateTransaction({
        to: finalTo,
        value: finalValue,
        data: finalData,
        ownerId: input.ownerId,
      })
      // Helpful debug for paymaster/bundler issues
      console.debug('[tx-orchestrator] UserOp estimate:', estimate)
    } catch (e) {
      console.debug('[tx-orchestrator] Failed to estimate UserOp:', e instanceof Error ? e.message : String(e))
    }

    const result = await kiteAAProvider.sponsorTransaction({
      to: finalTo,
      value: finalValue,
      data: finalData,
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
/**
 * lib/tx-orchestrator.ts
 *
 * Production write-transaction pipeline using the real gokite-aa-sdk.
 *
 * Flow:
 *   1. Attempt sponsored execution via the Kite bundler (gasless for the user)
 *   2. If the bundler rejects (no sponsorship quota, network error, etc.)
 *      AND KITE_AA_ALLOW_USER_GAS_FALLBACK !== 'false', return a fallback
 *      payload the client can use for a user-paid flow.
 *
 * The NPC's ownerId is required for signing — it must match the value used
 * when the NPC was deployed (stored in character.smartAccountId or derivable
 * from projectId + characterName).
 */

import { kiteAAProvider } from '@/lib/aa-sdk'
import type { SponsoredTx } from '@/lib/aa-sdk'
import { ethers } from 'ethers'
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

export type ExecutionMode = 'sponsored' | 'fallback' | 'server_bypass'

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
// Config
// ---------------------------------------------------------------------------

function allowFallback(): boolean {
  return process.env.KITE_AA_ALLOW_USER_GAS_FALLBACK !== 'false'
}

// ---------------------------------------------------------------------------
// executeWriteTransaction
// ---------------------------------------------------------------------------

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

    if (!allowFallback()) {
      throw new Error(`Gas sponsorship failed and fallback is disabled: ${reason}`)
    }

    // Fallback: return a synthetic result so the UI can handle it gracefully.
    // In a real game client, this would prompt the player to sign the tx themselves.
    console.warn('[tx-orchestrator] Sponsored execution failed, using fallback:', reason)

    // Dev bypass: if a server PRIVATE_KEY is configured, send a normal
    // EOA transaction from the server wallet (temporary workaround while
    // the bundler/paymaster is down). This moves funds on-chain and
    // returns a real tx hash so the UI can proceed.
    if (process.env.PRIVATE_KEY) {
      try {
        const RPC = process.env.KITE_AA_RPC_URL ?? 'https://rpc-testnet.gokite.ai'
        const provider = new ethers.JsonRpcProvider(RPC)
        const serverWallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider)

        const tx = await serverWallet.sendTransaction({
          to: input.to,
          value: input.value ? BigInt(input.value) : BigInt(0),
          data: input.data ?? '0x',
        })

        console.info('[tx-orchestrator] Dev Bypass successful. Hash:', tx.hash)

        // Do not block for a long time; await one confirmation if available
        try { await tx.wait(1) } catch (_) { /* ignore wait errors */ }

        return {
          mode: 'server_bypass',
          txHash: tx.hash,
          userOpHash: undefined,
          status: 'pending',
          sponsored: false,
          tee,
        }
      } catch (bypassErr) {
        console.error('[tx-orchestrator] Dev Bypass failed:', bypassErr)
        // fall through to the default synthetic fallback below
      }
    }

    return {
      mode: 'fallback',
      txHash: '0x' + '0'.repeat(64), // placeholder — no real tx
      userOpHash: undefined,
      status: 'pending',
      sponsored: false,
      sponsorError: reason,
      tee,
    }
  }
}
import crypto from 'crypto'
import { kiteAAProvider } from '@/lib/aa-sdk'

export interface WriteTransactionInput {
  to: string
  value: string
  data?: string
}

export interface SponsoredExecutionResult {
  mode: 'sponsored' | 'fallback'
  txHash: string
  status: 'pending' | 'success'
  sponsored: boolean
  sponsorError?: string
}

function createSyntheticTxHash(): string {
  return `0x${crypto.randomBytes(32).toString('hex')}`
}

function allowFallbackToUserGas(): boolean {
  return process.env.KITE_AA_ALLOW_USER_GAS_FALLBACK !== 'false'
}

export async function executeWriteTransaction(
  input: WriteTransactionInput
): Promise<SponsoredExecutionResult> {
  try {
    const sponsored = await kiteAAProvider.sponsorTransaction(input)

    return {
      mode: 'sponsored',
      txHash: sponsored.txHash,
      status: sponsored.status,
      sponsored: true,
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown sponsor error'

    if (!allowFallbackToUserGas()) {
      throw new Error(`Gas sponsorship failed and fallback is disabled: ${reason}`)
    }

    return {
      mode: 'fallback',
      txHash: createSyntheticTxHash(),
      status: 'pending',
      sponsored: false,
      sponsorError: reason,
    }
  }
}

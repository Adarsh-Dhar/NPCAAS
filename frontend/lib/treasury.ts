import { ethers, parseEther } from 'ethers'

const KITE_RPC_URL = process.env.KITE_AA_RPC_URL ?? 'https://rpc-testnet.gokite.ai'

export interface TreasuryProvisionResult {
  status: 'success' | 'skipped' | 'failed'
  txHash?: string
  reason?: string
  amountKite: number
}

function toPositiveNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value
  }
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed
    }
  }
  return 0
}

function getMinimumProvision(): number {
  const configured = process.env.KITE_TREASURY_MIN_PROVISION
  if (!configured) return 0
  const parsed = Number(configured)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

export class TreasuryService {
  static async provisionNpcWallet(
    walletAddress: string,
    baseCapital: number | string | undefined
  ): Promise<TreasuryProvisionResult> {
    const amountKite = toPositiveNumber(baseCapital)

    if (amountKite <= 0) {
      return {
        status: 'skipped',
        reason: 'Base capital is zero or missing; nothing to provision.',
        amountKite,
      }
    }

    const minimumProvision = getMinimumProvision()
    if (amountKite < minimumProvision) {
      return {
        status: 'skipped',
        reason: `Base capital ${amountKite} is below KITE_TREASURY_MIN_PROVISION ${minimumProvision}.`,
        amountKite,
      }
    }

    const treasuryPrivateKey = process.env.KITE_TREASURY_PRIVATE_KEY
    if (!treasuryPrivateKey) {
      return {
        status: 'skipped',
        reason: 'KITE_TREASURY_PRIVATE_KEY is not configured.',
        amountKite,
      }
    }

    if (!ethers.isAddress(walletAddress)) {
      return {
        status: 'failed',
        reason: 'Invalid NPC wallet address.',
        amountKite,
      }
    }

    try {
      const provider = new ethers.JsonRpcProvider(KITE_RPC_URL)
      const treasuryWallet = new ethers.Wallet(treasuryPrivateKey, provider)
      const transferValue = parseEther(amountKite.toString())

      const treasuryBalance = await provider.getBalance(treasuryWallet.address)
      if (treasuryBalance <= BigInt(0)) {
        return {
          status: 'skipped',
          reason: 'Treasury wallet balance is zero.',
          amountKite,
        }
      }

      if (treasuryBalance < transferValue) {
        return {
          status: 'skipped',
          reason: 'Treasury wallet has insufficient balance for requested provision amount.',
          amountKite,
        }
      }

      const tx = await treasuryWallet.sendTransaction({
        to: walletAddress,
        value: transferValue,
      })

      try {
        await tx.wait(1)
      } catch {
        // Return tx hash even if confirmation wait fails.
      }

      return {
        status: 'success',
        txHash: tx.hash,
        amountKite,
      }
    } catch (error) {
      return {
        status: 'failed',
        reason: error instanceof Error ? error.message : 'Unknown treasury provisioning failure.',
        amountKite,
      }
    }
  }
}

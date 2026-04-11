/**
 * lib/aa-sdk.ts
 *
 * Production Account Abstraction integration using the real gokite-aa-sdk.
 *
 * Install before using:
 *   pnpm add gokite-aa-sdk ethers
 *
 * Required env vars:
 *   KITE_SIGNER_SECRET   — random 32-byte hex secret; used to derive per-NPC private keys
 *   KITE_AA_NETWORK      — "kite_testnet" (default) | "kite_mainnet" when live
 *   KITE_AA_RPC_URL      — https://rpc-testnet.gokite.ai  (default)
 *   KITE_AA_BUNDLER_URL  — https://bundler-service.staging.gokite.ai/rpc/ (default)
 *   KITE_AA_CHAIN_ID     — 2368 (kite testnet, default)
 */

import { GokiteAASDK } from 'gokite-aa-sdk'
import type {
  UserOperationRequest,
  UserOperationStatus,
} from 'gokite-aa-sdk'
import { ethers } from 'ethers'

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

function getEnv(key: string, fallback: string): string {
  return process.env[key] ?? fallback
}

const NETWORK    = getEnv('KITE_AA_NETWORK',     'kite_testnet')
const RPC_URL    = getEnv('KITE_AA_RPC_URL',     'https://rpc-testnet.gokite.ai')
const BUNDLER    = getEnv('KITE_AA_BUNDLER_URL', 'https://bundler-service.staging.gokite.ai/rpc/')
// Fallback to production bundler if staging is unhealthy
const BUNDLER_FALLBACK = getEnv('KITE_AA_BUNDLER_FALLBACK_URL', 'https://bundler-service.gokite.ai/rpc/')
const CHAIN_ID   = Number(getEnv('KITE_AA_CHAIN_ID', '2368'))
const PROVIDER   = 'gokite-aa-sdk'

// ---------------------------------------------------------------------------
// Deterministic per-NPC signer derivation
//
// Each NPC gets its own Ethereum private key derived from:
//   keccak256("guildcraft:" + KITE_SIGNER_SECRET + ":" + ownerId)
//
// KITE_SIGNER_SECRET must be a stable, secret value stored in your env.
// Losing it means losing access to all NPC wallets.
// ---------------------------------------------------------------------------

function deriveSignerForOwner(ownerId: string): ethers.Wallet {
  const secret = process.env.KITE_SIGNER_SECRET
  if (!secret || secret.length < 16) {
    throw new Error(
      'KITE_SIGNER_SECRET is not set or too short. ' +
      'Generate one with: openssl rand -hex 32'
    )
  }
  const privateKey = ethers.keccak256(
    ethers.toUtf8Bytes(`guildcraft:${secret}:${ownerId}`)
  )
  return new ethers.Wallet(privateKey)
}

// ---------------------------------------------------------------------------
// Shared SDK instance (lazy, singleton per process)
// ---------------------------------------------------------------------------

let _sdk: GokiteAASDK | null = null

function getSDK(): GokiteAASDK {
  if (!_sdk) {
    _sdk = new GokiteAASDK(NETWORK, RPC_URL, BUNDLER)
  }
  return _sdk
}

function makeSDKWithBundler(bundlerUrl: string): GokiteAASDK {
  return new GokiteAASDK(NETWORK, RPC_URL, bundlerUrl)
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SmartAccount {
  address: string          // AA wallet address (the on-chain contract wallet)
  signerAddress: string   // EOA signer address (derived from private key)
  chainId: number
  smartAccountId: string
  provider: string
}

export interface SponsoredTx {
  txHash: string
  userOpHash: string
  status: UserOperationStatus['status']
}

export interface CreateSmartAccountInput {
  ownerId?: string
  metadata?: Record<string, unknown>
}

export interface SponsorTransactionInput {
  to: string
  value: string     // decimal string, e.g. "1000000000000000000"
  data?: string     // hex calldata
  ownerId: string  // must match the NPC's ownerId used during creation
}

// ---------------------------------------------------------------------------
// KiteAAProvider — wraps the real GokiteAASDK
// ---------------------------------------------------------------------------

export class KiteAAProvider {
  private readonly chainId = CHAIN_ID

  /**
   * Create (or derive) the smart-account wallet for an NPC.
   * This is deterministic — calling it twice with the same ownerId returns
   * the same address without any on-chain transaction.
   */
  async createSmartAccount(input: CreateSmartAccountInput = {}): Promise<SmartAccount> {
    const ownerId = input.ownerId ?? 'anonymous'
    const sdk = getSDK()
    const signer = deriveSignerForOwner(ownerId)

    // getAccountAddress is synchronous — returns the counterfactual AA address
    const address = sdk.getAccountAddress(signer.address)

    return {
      address,
      signerAddress: signer.address,
      chainId: this.chainId,
      smartAccountId: `kite-aa:${signer.address}`,
      provider: PROVIDER,
    }
  }

  /**
   * Sponsor a write transaction for an NPC.
   * Submits via the Kite bundler; falls back gracefully if sponsorship fails.
   *
   * The NPC's derived signer signs the UserOperation; the paymaster covers gas.
   */
  async sponsorTransaction(input: SponsorTransactionInput): Promise<SponsoredTx> {
    const sdk = getSDK()
    const signer = deriveSignerForOwner(input.ownerId)

    const request: UserOperationRequest = {
      target: input.to,
      value: input.value ? BigInt(input.value) : BigInt(0),
      callData: input.data ?? '0x',
    }

    const signFn = async (userOpHash: string): Promise<string> => {
      // EIP-4337 requires signing over raw bytes (not eth_sign prefixed)
      return signer.signMessage(ethers.getBytes(userOpHash))
    }

    try {
      const { userOpHash, status } = await sdk.sendUserOperationAndWait(
        signer.address,
        request,
        signFn,
        undefined, // salt — use default (0n)
        undefined, // paymasterAddress — SDK fetches from bundler
        {
          interval: 2000,
          timeout: 60_000,
          maxRetries: 30,
        }
      )

      const txHash = status.transactionHash ?? userOpHash

      return {
        txHash,
        userOpHash,
        status: status.status,
      }
    } catch (err) {
      // If the staging bundler returned a generic "execution reverted" it may
      // be a symptom of the staging paymaster or bundler being unhealthy.
      // Retry once against the production bundler before propagating the error.
      const message = err instanceof Error ? err.message : String(err)
      if (message && message.toLowerCase().includes('execution reverted')) {
        try {
          const sdk2 = makeSDKWithBundler(BUNDLER_FALLBACK)
          const { userOpHash, status } = await sdk2.sendUserOperationAndWait(
            signer.address,
            request,
            signFn,
            undefined,
            undefined,
            {
              interval: 2000,
              timeout: 60_000,
              maxRetries: 30,
            }
          )

          const txHash = status.transactionHash ?? userOpHash

          return {
            txHash,
            userOpHash,
            status: status.status,
          }
        } catch (err2) {
          // fall-through to rethrow original error below after augmenting
          const err2msg = err2 instanceof Error ? err2.message : String(err2)
            // If we have a server-side PRIVATE_KEY configured, attempt to
            // bypass the bundler entirely by calling EntryPoint.handleOps
            // directly. This requires `PRIVATE_KEY` to be a funded account.
            if (process.env.PRIVATE_KEY) {
              try {
                // Build a userOp with no paymaster (server will pay gas)
                const userOp = await sdk.createUserOperation(
                  signer.address,
                  request,
                  undefined,
                  // create with default paymaster then clear paymasterAndData
                  undefined
                )

                // Remove paymaster data so EntryPoint.handleOps executes with
                // the server-funded signer (we'll pay gas directly).
                userOp.paymasterAndData = '0x'

                const userOpHash = await sdk.getUserOpHash(userOp)
                const signature = await signFn(userOpHash)
                userOp.signature = signature

                const directTxHash = await sdk.sendUserOperationDirectly(signer.address, userOp)

                return {
                  txHash: directTxHash,
                  userOpHash,
                  status: 'success',
                }
              } catch (err3) {
                const err3msg = err3 instanceof Error ? err3.message : String(err3)
                throw new Error(`sponsorTransaction failed (staging): ${message}; retry (prod) failed: ${err2msg}; direct send failed: ${err3msg}`)
              }
            }

            throw new Error(`sponsorTransaction failed (staging): ${message}; retry (prod) failed: ${err2msg}`)
        }
      }

      throw err
    }
  }

  /**
   * Estimate gas and sponsorship availability for a transaction.
   * Useful to check before executing.
   */
  async estimateTransaction(input: SponsorTransactionInput) {
    const sdk = getSDK()
    const signer = deriveSignerForOwner(input.ownerId)

    return sdk.estimateUserOperation(signer.address, {
      target: input.to,
      value: input.value ? BigInt(input.value) : BigInt(0),
      callData: input.data ?? '0x',
    })
  }
}

// ---------------------------------------------------------------------------
// Singleton export — used throughout the app
// ---------------------------------------------------------------------------

export const kiteAAProvider = new KiteAAProvider()
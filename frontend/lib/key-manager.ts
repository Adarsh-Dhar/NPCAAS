/**
 * lib/key-manager.ts
 *
 * Centralised, provider-agnostic key management for NPC wallets.
 *
 * The module exports a single `keyManager` singleton whose concrete
 * implementation is chosen at startup via the KEY_MANAGER_PROVIDER env var:
 *
 *   KEY_MANAGER_PROVIDER=local     (default) — deterministic derivation from KITE_SIGNER_SECRET
 *   KEY_MANAGER_PROVIDER=turnkey   — Turnkey API  (fill in TurnkeyKeyManager below)
 *   KEY_MANAGER_PROVIDER=privy     — Privy server wallets (fill in PrivyKeyManager below)
 *   KEY_MANAGER_PROVIDER=coinbase  — Coinbase WaaS (fill in CoinbaseKeyManager below)
 *
 * ─── Security notes ────────────────────────────────────────────────────────
 *
 *  LOCAL DERIVATION (current default)
 *  ───────────────
 *  • Private keys are NEVER stored in the database.
 *  • Each NPC key = keccak256("guildcraft:" + KITE_SIGNER_SECRET + ":" + ownerId)
 *  • KITE_SIGNER_SECRET must be a 32-byte hex secret stored only in your
 *    environment (Vercel secrets, AWS SSM, etc.).  Treat it like a root CA key.
 *  • Losing KITE_SIGNER_SECRET = losing access to ALL NPC wallets.
 *    Keep an encrypted backup in a hardware security module (HSM) or KMS.
 *  • Rotate KITE_SIGNER_SECRET by running a migration that transfers all NPC
 *    balances to fresh derived addresses before switching the secret.
 *
 *  PRODUCTION RECOMMENDATION
 *  ─────────────────────────
 *  Plug in Turnkey, Privy, or Coinbase WaaS so that:
 *    - Private keys live in HSMs you don't own or see.
 *    - Each signing request is an API call with full audit trail.
 *    - Key rotation is a first-class platform feature.
 *
 * ───────────────────────────────────────────────────────────────────────────
 */

import { ethers } from 'ethers'

// ---------------------------------------------------------------------------
// Public interface — every provider must implement this
// ---------------------------------------------------------------------------

export interface NpcSignerResult {
  /** Derived / fetched EOA address (hex, checksummed). */
  address: string
  /**
   * Sign an arbitrary message (plain string → eth_sign with EIP-191 prefix).
   * Used for off-chain proofs, permit signatures, etc.
   */
  signMessage: (message: string) => Promise<string>
  /**
   * Sign raw bytes — for EIP-4337 UserOperation hashes.
   * No EIP-191 prefix is added.
   */
  signBytes: (bytes: Uint8Array) => Promise<string>
}

export interface KeyManagerProvider {
  /** Human-readable name logged at startup. */
  readonly name: string
  /**
   * Derive or fetch the signer for a given NPC owner ID.
   * Must be deterministic — same ownerId always yields the same address.
   */
  getSigner(ownerId: string): Promise<NpcSignerResult>
}

// ---------------------------------------------------------------------------
// Provider: LOCAL — deterministic keccak256 derivation
// ---------------------------------------------------------------------------

class LocalDerivedKeyManager implements KeyManagerProvider {
  readonly name = 'local-derived'

  private readonly secret: string

  constructor() {
    const secret = process.env.KITE_SIGNER_SECRET ?? ''
    if (!secret || secret.length < 16) {
      throw new Error(
        '[KeyManager] KITE_SIGNER_SECRET is not set or too short.\n' +
          'Generate one with:  openssl rand -hex 32\n' +
          'Then add it to your .env:  KITE_SIGNER_SECRET=<value>'
      )
    }
    this.secret = secret
  }

  async getSigner(ownerId: string): Promise<NpcSignerResult> {
    const privateKey = ethers.keccak256(
      ethers.toUtf8Bytes(`guildcraft:${this.secret}:${ownerId}`)
    )
    const wallet = new ethers.Wallet(privateKey)

    return {
      address: wallet.address,
      signMessage: (message: string) => wallet.signMessage(message),
      signBytes: (bytes: Uint8Array) => wallet.signMessage(bytes),
    }
  }
}

// ---------------------------------------------------------------------------
// Provider: TURNKEY (stub — fill in your Turnkey org / API credentials)
// ---------------------------------------------------------------------------
// To activate: KEY_MANAGER_PROVIDER=turnkey
// Dependencies: pnpm add @turnkey/sdk-server @turnkey/ethers
//
// class TurnkeyKeyManager implements KeyManagerProvider {
//   readonly name = 'turnkey'
//   private client: TurnkeyClient
//
//   constructor() {
//     this.client = new TurnkeyClient({
//       baseUrl:   process.env.TURNKEY_BASE_URL!,
//       apiPublicKey:  process.env.TURNKEY_API_PUBLIC_KEY!,
//       apiPrivateKey: process.env.TURNKEY_API_PRIVATE_KEY!,
//       organizationId: process.env.TURNKEY_ORG_ID!,
//     })
//   }
//
//   async getSigner(ownerId: string): Promise<NpcSignerResult> {
//     // Look up or create a Turnkey wallet for this ownerId and return
//     // a TurnkeySigner that proxies sign calls to Turnkey's HSM.
//     // ...
//   }
// }

// ---------------------------------------------------------------------------
// Provider: PRIVY (stub — fill in your Privy app ID + secret)
// ---------------------------------------------------------------------------
// To activate: KEY_MANAGER_PROVIDER=privy
// Dependencies: pnpm add @privy-io/server-auth
//
// class PrivyKeyManager implements KeyManagerProvider {
//   readonly name = 'privy'
//   // Privy server wallets are created via their API and returned as
//   // embedded wallet addresses you can request signatures from.
// }

// ---------------------------------------------------------------------------
// Provider: COINBASE WaaS (stub)
// ---------------------------------------------------------------------------
// To activate: KEY_MANAGER_PROVIDER=coinbase
// Dependencies: pnpm add @coinbase/waas-sdk-typescript

// ---------------------------------------------------------------------------
// Factory — select provider from env
// ---------------------------------------------------------------------------

function createKeyManager(): KeyManagerProvider {
  const provider = process.env.KEY_MANAGER_PROVIDER ?? 'local'

  switch (provider) {
    case 'local':
      return new LocalDerivedKeyManager()
    // case 'turnkey':
    //   return new TurnkeyKeyManager()
    // case 'privy':
    //   return new PrivyKeyManager()
    default:
      console.warn(
        `[KeyManager] Unknown KEY_MANAGER_PROVIDER="${provider}", falling back to "local".`
      )
      return new LocalDerivedKeyManager()
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

let _keyManager: KeyManagerProvider | null = null

export function getKeyManager(): KeyManagerProvider {
  if (!_keyManager) {
    _keyManager = createKeyManager()
    console.info(`[KeyManager] Using provider: ${_keyManager.name}`)
  }
  return _keyManager
}

/**
 * Convenience helper — derive the signer for a character given its stored
 * smartAccountId (which is the ownerId used at creation time).
 */
export async function getSignerForCharacter(
  smartAccountId: string | null,
  characterId: string
): Promise<NpcSignerResult> {
  const ownerId = smartAccountId ?? `character:${characterId}`
  return getKeyManager().getSigner(ownerId)
}
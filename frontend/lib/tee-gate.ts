import crypto from 'crypto'

export interface TeeGateInput {
  teeExecution?: string
  characterId: string
  projectId?: string
}

export interface TeeGateResult {
  enabled: boolean
  enforced: boolean
  attestationId?: string
  attestation?: {
    issuedAt: string
    characterId: string
    projectId?: string
    environment: string
    buildHash: string
    nonce: string
    signature: string
  }
}

function isTeeEnabled(value: unknown): boolean {
  return typeof value === 'string' && value.trim().toUpperCase() === 'ENABLED'
}

export function buildTeeGateResult(input: TeeGateInput): TeeGateResult {
  const enabled = isTeeEnabled(input.teeExecution)
  const enforced = enabled && process.env.ENFORCE_TEE_ATTESTATION === 'true'

  if (!enabled) {
    return { enabled: false, enforced: false }
  }

  const issuedAt = new Date().toISOString()
  const nonce = crypto.randomUUID()
  const environment = process.env.NODE_ENV ?? 'unknown'
  const buildHash = process.env.BUILD_HASH ?? process.env.VERCEL_GIT_COMMIT_SHA ?? 'unknown'

  const payload = [input.characterId, input.projectId ?? 'none', issuedAt, environment, buildHash, nonce].join(':')
  const secret = process.env.TEE_ATTESTATION_SECRET ?? 'local-tee-secret'
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex')

  return {
    enabled,
    enforced,
    attestationId: signature.slice(0, 32),
    attestation: {
      issuedAt,
      characterId: input.characterId,
      projectId: input.projectId,
      environment,
      buildHash,
      nonce,
      signature,
    },
  }
}

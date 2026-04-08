import crypto from 'crypto'

interface CreateSmartAccountInput {
	ownerId?: string
	metadata?: Record<string, unknown>
}

export interface SmartAccount {
	address: string
	chainId: number
	smartAccountId?: string
	provider: 'kite-aa-sdk' | 'kite-aa-http' | 'kite-aa-local'
}

interface SponsorTransactionInput {
	to: string
	value: string
	data?: string
}

interface SponsoredTx {
	txHash: string
	status: 'pending' | 'success'
}

type UnknownRecord = Record<string, unknown>

function asRecord(value: unknown): UnknownRecord {
	return value && typeof value === 'object' ? (value as UnknownRecord) : {}
}

function asAddress(value: unknown): string | null {
	if (typeof value !== 'string') {
		return null
	}

	const trimmed = value.trim()
	if (!/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
		return null
	}

	return trimmed
}

function asTxHash(value: unknown): string | null {
	if (typeof value !== 'string') {
		return null
	}

	const trimmed = value.trim()
	if (!/^0x[a-fA-F0-9]{64}$/.test(trimmed)) {
		return null
	}

	return trimmed
}

export class KiteAAProvider {
	private readonly chainId = Number(process.env.KITE_AA_CHAIN_ID ?? 2368)
	private readonly networkName = process.env.KITE_AA_NETWORK ?? 'kite_testnet'
	private readonly rpcUrl = process.env.KITE_AA_RPC_URL ?? 'https://rpc-testnet.gokite.ai'
	private readonly bundlerRpcUrl =
		process.env.KITE_AA_BUNDLER_RPC_URL ?? 'https://bundler-service.staging.gokite.ai/rpc/'
	private readonly sdkModuleName = process.env.KITE_AA_SDK_MODULE ?? 'gokite-aa-sdk'
	private readonly localSeedNamespace = process.env.KITE_AA_LOCAL_SEED ?? 'kite-npc'

	async createSmartAccount(input: CreateSmartAccountInput = {}): Promise<SmartAccount> {
		const sdkResult = await this.tryCreateWithSdk(input)
		if (sdkResult) {
			return sdkResult
		}

		return this.createWithLocalFallback(input)
	}

	async sponsorTransaction(input: SponsorTransactionInput): Promise<SponsoredTx> {
		const sdkResult = await this.trySponsorWithSdk(input)
		if (sdkResult) {
			return sdkResult
		}

		return this.sponsorWithHttp(input)
	}

	private async tryCreateWithSdk(input: CreateSmartAccountInput): Promise<SmartAccount | null> {
		try {
			const sdkModule = (await import(this.sdkModuleName)) as UnknownRecord
			const ProviderCtor =
				(sdkModule.GokiteAASDK as new (...args: unknown[]) => UnknownRecord) ||
				(sdkModule.default as new (...args: unknown[]) => UnknownRecord) ||
				(sdkModule.KiteAAProvider as new (...args: unknown[]) => UnknownRecord) ||
				(sdkModule.AAProvider as new (...args: unknown[]) => UnknownRecord) ||
				null

			if (!ProviderCtor) {
				return null
			}

			const providerInstance =
				ProviderCtor.length >= 3
					? new ProviderCtor(this.networkName, this.rpcUrl, this.bundlerRpcUrl)
					: (new ProviderCtor({
						network: this.networkName,
						rpcUrl: this.rpcUrl,
						bundlerRpcUrl: this.bundlerRpcUrl,
					}) as UnknownRecord)

			const getAccountAddress = providerInstance.getAccountAddress
			if (typeof getAccountAddress !== 'function') {
				return null
			}

			const signerAddress = this.deriveSignerAddress(input.ownerId, input.metadata)
			const raw = await getAccountAddress.call(providerInstance, signerAddress)
			const address = asAddress(raw)

			if (!address) {
				throw new Error('AA SDK did not return a valid smart account address')
			}

			return {
				address,
				chainId: this.chainId,
				smartAccountId: `aa:${signerAddress}`,
				provider: 'kite-aa-sdk',
			}
		} catch (error) {
			if (process.env.KITE_AA_REQUIRE_SDK === 'true') {
				const reason = error instanceof Error ? error.message : 'Unknown SDK error'
				throw new Error(`Failed to create smart account via SDK: ${reason}`)
			}

			return null
		}
	}

	private deriveSignerAddress(
		ownerId?: string,
		metadata?: Record<string, unknown>
	): string {
		const seed = JSON.stringify({
			namespace: this.localSeedNamespace,
			ownerId: ownerId ?? 'unknown-owner',
			metadata: metadata ?? {},
		})

		return this.deriveAddress(seed)
	}

	private deriveAddress(seed: string): string {
		return `0x${crypto.createHash('sha256').update(seed).digest('hex').slice(0, 40)}`
	}

	private deriveTxHash(seed: string): string {
		return `0x${crypto.createHash('sha256').update(seed).digest('hex')}`
	}

	private createWithLocalFallback(input: CreateSmartAccountInput): SmartAccount {
		const signerAddress = this.deriveSignerAddress(input.ownerId, input.metadata)

		return {
			address: this.deriveAddress(`${signerAddress}:aa-wallet`),
			chainId: this.chainId,
			smartAccountId: `local:${signerAddress}`,
			provider: 'kite-aa-local',
		}
	}

	private async trySponsorWithSdk(
		input: SponsorTransactionInput
	): Promise<SponsoredTx | null> {
		try {
			const sdkModule = (await import(this.sdkModuleName)) as UnknownRecord
			const ProviderCtor =
				(sdkModule.KiteAAProvider as new (...args: unknown[]) => UnknownRecord) ||
				(sdkModule.AAProvider as new (...args: unknown[]) => UnknownRecord) ||
				null

			if (!ProviderCtor) {
				return null
			}

			const providerInstance = new ProviderCtor({
				network: this.networkName,
				rpcUrl: this.rpcUrl,
				bundlerRpcUrl: this.bundlerRpcUrl,
				chainId: this.chainId,
			}) as UnknownRecord

			const sponsor = providerInstance.sponsorTransaction
			if (typeof sponsor !== 'function') {
				return null
			}

			const raw = await sponsor.call(providerInstance, input)
			const payload = asRecord(raw)
			const txHash =
				asTxHash(payload.txHash) ||
				asTxHash(asRecord(payload.tx).hash) ||
				asTxHash(asRecord(payload.transaction).hash)

			if (!txHash) {
				throw new Error('AA SDK did not return a valid sponsored transaction hash')
			}

			return {
				txHash,
				status: 'success',
			}
		} catch (error) {
			if (process.env.KITE_AA_REQUIRE_SDK === 'true') {
				const reason = error instanceof Error ? error.message : 'Unknown SDK error'
				throw new Error(`Failed to sponsor transaction via SDK: ${reason}`)
			}

			return null
		}
	}

	private async createWithHttp(input: CreateSmartAccountInput): Promise<SmartAccount> {
		return this.createWithLocalFallback(input)
	}

	private async sponsorWithHttp(input: SponsorTransactionInput): Promise<SponsoredTx> {
		throw new Error(
			`AA sponsorship requires Kite SDK or sponsor service configuration for ${input.to}`
		)
	}
}

export const kiteAAProvider = new KiteAAProvider()

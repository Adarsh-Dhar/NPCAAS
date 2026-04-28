# GuildCraft SDK

GuildCraft is a lightweight JavaScript SDK for integrating autonomous, LLM-powered NPCs into games with Web3-native transaction flows.

This package exposes a single client class that handles:

- NPC chat and decision loops
- Streaming responses for real-time UX
- Character and game/project management
- Kite-backed transaction execution for NPC trade actions
- Optional Mode 3 deep integration with Kite AA smart accounts and x402 payment interception

## Installation

```bash
npm install @adarsh23/guildcraft-sdk
```

## Quickstart

### CommonJS

```js
const { GuildCraftClient } = require('@adarsh23/guildcraft-sdk')

const client = new GuildCraftClient(
  process.env.GUILDCRAFT_API_KEY,
  process.env.GUILDCRAFT_API_BASE_URL || 'http://localhost:3000/api'
)

async function run() {
  const reply = await client.chat('char_merchant_bob', 'Do you have healing potions?')
  console.log(reply.response)

  if (reply.tradeIntent) {
    const tx = await client.executeTransaction('char_merchant_bob', reply.tradeIntent)
    console.log('Trade settled:', tx.mode, tx.txHash)
  }
}

run().catch(console.error)
```

### ESM

```js
import { GuildCraftClient } from '@adarsh23/guildcraft-sdk'

const client = new GuildCraftClient(
  process.env.GUILDCRAFT_API_KEY,
  process.env.GUILDCRAFT_API_BASE_URL || 'http://localhost:3000/api'
)
```

## Mode 3 Deep Integration

Mode 3 is opt-in and adds a backend master signer, Kite AA smart-account deployment, and x402 payment settlement.

```js
const client = new GuildCraftClient(
  process.env.GUILDCRAFT_API_KEY,
  process.env.GUILDCRAFT_API_BASE_URL || 'http://localhost:3000/api',
  {
    backendPrivateKey: process.env.KITE_BACKEND_PRIVATE_KEY,
    network: 'kite_testnet',
    rpcUrl: 'https://rpc-testnet.gokite.ai',
    bundlerUrl: 'https://bundler-service.staging.gokite.ai/rpc/',
  }
)

const deploy = await client.deployCharacter({
  name: 'Merchant Bob',
  config: {
    encodedPerformCreateCallData: process.env.ENCODED_PERFORM_CREATE_CALLDATA,
    encodedConfigureSpendingRules: process.env.ENCODED_CONFIGURE_SPENDING_RULES,
    proxyAddress: process.env.CLIENT_AGENT_VAULT_ADDRESS,
  },
})

const result = await client.executeTransaction('char_merchant_bob', {
  item: 'Healing Potion',
  price: 100,
  currency: 'PYUSD',
  serviceUrl: 'https://merchant.example.com/trade',
  details: { sku: 'potion-small', quantity: 1 },
})
```

When the merchant returns `402 Payment Required`, the SDK:

1. Reads the `accepts` payload from the response body.
2. Builds an AA batch transfer for the requested ERC-20 asset.
3. Sends the payment through Kite AA using the backend master key.
4. Retries the original request with an `X-Payment` header.

Constructor options:

- `backendPrivateKey`: required for Mode 3 operations.
- `network`: Kite AA network, defaults to `kite_testnet`.
- `rpcUrl`: Kite RPC endpoint, defaults to the Kite testnet RPC.
- `bundlerUrl`: Kite bundler endpoint, defaults to the staging bundler.

If you omit the third argument, the SDK behaves exactly like the previous release.

## Streaming Chat

```js
for await (const event of client.chatStream('char_merchant_bob', 'What is the market mood today?')) {
  if (event.type === 'text_delta') process.stdout.write(event.delta)
  if (event.type === 'done') console.log('\nAction:', event.final?.action)
}
```

## Core API

### new GuildCraftClient(apiKey, baseUrl?, backendPrivateKeyOrOptions?)

- apiKey: Required. Must start with gc_live_.
- baseUrl: Optional. Defaults to http://localhost:3000/api.
- backendPrivateKeyOrOptions: Optional. Pass a backend private key string or a Mode 3 options object when you need AA wallet deployment or x402 settlement.

### Character APIs

- getCharacters()
- getCharacter(characterId)
- deployCharacter({ name, config, gameIds? })
- updateCharacter({ characterId, name?, config })

For Mode 3 deploys, `config` may also include `encodedPerformCreateCallData`, `encodedConfigureSpendingRules`, and `proxyAddress`.

### Game APIs

- createGame(name)
- getGames()
- getGameCharacters(gameId)
- assignCharactersToGame(gameId, characterIds)

### Chat and Actions

- chat(characterId, message, opts?)
- chatStream(characterId, message, opts?)
- executeTransaction(characterId, tradeIntent)
- npcInteract(initiatorId, targetName, message, tradeIntent?)

In Mode 3, `tradeIntent` may also include `serviceUrl` and `details` so the SDK can intercept a `402` paywall and settle the payment before retrying the merchant request.

## Error Handling

All SDK errors throw GuildCraftError with:

- name
- status
- body

Example:

```js
try {
  await client.getCharacter('missing-id')
} catch (err) {
  console.error(err.name, err.status, err.body)
}
```

For Mode 3 flows, validation errors are thrown when the backend private key is missing, the AA deployment calldata is incomplete, or the 402 payload cannot be parsed.

## Requirements

- Node.js 18+
- A valid GuildCraft API key

## License

MIT

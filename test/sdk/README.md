# GuildCraft SDK

JavaScript SDK for connecting NPCs to the GuildCraft platform. Enables game studios to integrate AI-powered characters into their games with secure API key authentication.

## Installation

```bash
npm install @adarsh23/guildcraft-sdk
```

## Quick Start

```javascript
import { GuildCraftClient } from '@adarsh23/guildcraft-sdk'

// Initialize with your API key from the GuildCraft dashboard
const gc = new GuildCraftClient(
  'gc_live_abc123xyz...',
  'https://your-deployed-guildcraft.com/api'
)

// Fetch all characters for your project
const characters = await gc.getCharacters()

// Chat with an NPC character
const reply = await gc.chat('char_blacksmith_001', 'I want to buy a sword')
console.log(reply.response) // AI-generated NPC response

// Check for trade offers
if (reply.tradeIntent) {
  console.log(`Trade offer: ${reply.tradeIntent.item} for ${reply.tradeIntent.price} ${reply.tradeIntent.currency}`)
}
```

## API

### `new GuildCraftClient(apiKey, baseUrl?)`

Creates a new client instance.

- `apiKey` (string): Your GuildCraft API key (must start with `gc_live_`)
- `baseUrl` (string, optional): Base URL of your GuildCraft API. Defaults to `http://localhost:3000/api`

### `new GuildCraftClient(apiKey, baseUrl?, backendPrivateKeyOrOptions?)`

You can also pass a third argument for Mode 3 AA settings.

```javascript
const gc = new GuildCraftClient('gc_live_abc123xyz...', 'https://your-deployed-guildcraft.com/api', {
  backendPrivateKey: process.env.KITE_BACKEND_PRIVATE_KEY,
  network: 'kite_testnet',
  rpcUrl: 'https://rpc-testnet.gokite.ai',
  bundlerUrl: 'https://bundler-service.staging.gokite.ai/rpc/',
})
```

Use this only when you need AA wallet deployment or x402 payment settlement. Existing tests should keep using the two-argument constructor unless they are specifically exercising Mode 3.

### `getCharacters(): Promise<Character[]>`

Fetches all characters for your project.

```javascript
const characters = await gc.getCharacters()
```

### `chat(characterId, message): Promise<ChatResponse>`

Sends a message to an NPC and gets an AI response.

- `characterId` (string): ID of the character to chat with
- `message` (string): Player's input message

Returns a `ChatResponse` with:
- `success` (boolean): Whether the request succeeded
- `response` (string): The NPC's AI-generated response
- `characterId` (string): ID of the character who responded
- `tradeIntent` (object, optional): Trade offer if the NPC suggested one
- `timestamp` (string): ISO timestamp of the response

## Types

```typescript
interface Character {
  id: string
  projectId: string
  name: string
  walletAddress?: string
  config: Record<string, any>
  isDeployedOnChain?: boolean
  deploymentTxHash?: string
  createdAt: string
}

interface TradeIntent {
  item: string
  price: number
  currency: string
  serviceUrl?: string
  details?: Record<string, any>
}

interface ChatResponse {
  success: boolean
  response: string
  characterId: string
  tradeIntent?: TradeIntent
  timestamp: string
}
```

## Mode 3 Notes

If `tradeIntent.serviceUrl` is set, the SDK can call that merchant directly, intercept a `402 Payment Required` response, pay through Kite AA, and retry the request with an `X-Payment` header.

The SDK will throw a descriptive error if the backend private key is missing, the AA deployment calldata is incomplete, or the merchant's 402 payload is malformed.

## Error Handling

The SDK throws errors for invalid API keys and network failures:

```javascript
try {
  const reply = await gc.chat('char_123', 'hello')
} catch (error) {
  console.error('Chat failed:', error.message)
}
```

## License

MIT

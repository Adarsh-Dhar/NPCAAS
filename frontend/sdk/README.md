# GuildCraft SDK

GuildCraft is a lightweight JavaScript SDK for integrating autonomous, LLM-powered NPCs into games with Web3-native transaction flows.

This package exposes a single client class that handles:

- NPC chat and decision loops
- Streaming responses for real-time UX
- Character and game/project management
- Kite-backed transaction execution for NPC trade actions

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

## Streaming Chat

```js
for await (const event of client.chatStream('char_merchant_bob', 'What is the market mood today?')) {
  if (event.type === 'text_delta') process.stdout.write(event.delta)
  if (event.type === 'done') console.log('\nAction:', event.final?.action)
}
```

## Core API

### new GuildCraftClient(apiKey, baseUrl?)

- apiKey: Required. Must start with gc_live_.
- baseUrl: Optional. Defaults to http://localhost:3000/api.

### Character APIs

- getCharacters()
- getCharacter(characterId)
- deployCharacter({ name, config, gameIds? })
- updateCharacter({ characterId, name?, config })

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

## Requirements

- Node.js 18+
- A valid GuildCraft API key

## License

MIT

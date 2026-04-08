# @adarsh23/guildcraft-sdk

JavaScript SDK for connecting game clients to the GuildCraft API.

## Install

```bash
npm install @adarsh23/guildcraft-sdk
```

## Usage

```js
const { GuildCraftClient } = require('@adarsh23/guildcraft-sdk')

const client = new GuildCraftClient(
  'gc_live_your_key_here',
  'https://your-deployed-guildcraft-app.com/api'
)

async function onPlayerTalkToNpc(input) {
  const reply = await client.chat('char_kermit_123', input)
  console.log(reply.response)

  if (reply.tradeIntent) {
    console.log('Trade intent:', reply.tradeIntent)
  }
}
```

## API

### new GuildCraftClient(apiKey, baseUrl?)

- `apiKey`: Required, must start with `gc_live_`
- `baseUrl`: Optional, defaults to `http://localhost:3000/api`

### chat(characterId, message)

Sends a chat request and returns:

- `success`
- `response`
- `characterId`
- `tradeIntent` (optional)
- `timestamp`
- `projectId` (optional)

class GuildCraftClient {
  constructor(apiKey, baseUrl = 'http://localhost:3000/api') {
    if (!apiKey || !apiKey.startsWith('gc_live_')) {
      throw new Error('Invalid GuildCraft API key. It must start with gc_live_')
    }

    this.apiKey = apiKey
    this.baseUrl = baseUrl
  }

  async chat(characterId, message) {
    if (!characterId) {
      throw new Error('characterId is required')
    }
    if (!message) {
      throw new Error('message is required')
    }

    const response = await fetch(`${this.baseUrl}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ characterId, message }),
    })

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}))
      throw new Error(
        `GuildCraft API error ${response.status}: ${errorBody.error || response.statusText}`
      )
    }

    return response.json()
  }

  async executeTransaction(characterId, tradeIntent) {
    if (!characterId) {
      throw new Error('characterId is required')
    }
    if (!tradeIntent || typeof tradeIntent !== 'object') {
      throw new Error('tradeIntent is required')
    }

    const response = await fetch(`${this.baseUrl}/transactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ characterId, tradeIntent }),
    })

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}))
      throw new Error(
        `GuildCraft API error ${response.status}: ${errorBody.error || response.statusText}`
      )
    }

    return response.json()
  }
}

module.exports = {
  GuildCraftClient,
}
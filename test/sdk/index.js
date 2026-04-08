// GuildCraft SDK
// Drop this into any game project to connect NPCs to your GuildCraft backend

class GuildCraftClient {
  constructor(apiKey, baseUrl = 'http://localhost:3000/api') {
    if (!apiKey || !apiKey.startsWith('gc_live_')) {
      throw new Error('Invalid GuildCraft API key. It must start with gc_live_')
    }
    this.apiKey = apiKey
    this.baseUrl = baseUrl
  }

  /**
   * Fetch all characters for this project.
   */
  async getCharacters() {
    const response = await fetch(`${this.baseUrl}/characters`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
    })

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}))
      throw new Error(
        `GuildCraft API error ${response.status}: ${
          errorBody.error ?? response.statusText
        }`
      )
    }

    return response.json()
  }

  /**
   * Send a player message to an NPC character and get an AI response.
   * @param characterId  The character ID from your GuildCraft dashboard
   * @param message      The player's input text
   */
  async chat(characterId, message) {
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
        `GuildCraft API error ${response.status}: ${
          errorBody.error ?? response.statusText
        }`
      )
    }

    return response.json()
  }
}

module.exports = { GuildCraftClient }

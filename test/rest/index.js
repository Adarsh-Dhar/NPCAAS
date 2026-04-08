// GuildCraft REST API Integration Test
// Direct REST version of the SDK character fetcher test

// Hardcoded game API key requested by user
const GAME_API_KEY = 'gc_live_ae6f002451c6b40f47ce057e3ee99707'
const API_BASE_URL = 'http://localhost:3000/api'

async function fetchWithAuth(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GAME_API_KEY}`,
      ...(options.headers || {}),
    },
  })

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}))
    throw new Error(
      `GuildCraft API error ${response.status}: ${errorBody.error ?? response.statusText}`
    )
  }

  return response.json()
}

async function runRestIntegrationTest() {
  try {
    console.log('GuildCraft REST API Integration Test\n')
    console.log(`API Key: ${GAME_API_KEY}`)
    console.log(`Base URL: ${API_BASE_URL}\n`)

    // Step 1: Fetch all characters for this game/project
    console.log('Fetching all characters from the game via REST...\n')
    const characters = await fetchWithAuth('/characters', { method: 'GET' })

    if (!characters || characters.length === 0) {
      console.log('No characters found for this game.')
      return
    }

    console.log(`Found ${characters.length} characters:\n`)
    console.log('='.repeat(70))

    characters.forEach((char, index) => {
      console.log(`\nCharacter ${index + 1}: ${char.name}`)
      console.log(`  ID: ${char.id}`)
      console.log(`  Project ID: ${char.projectId}`)
      console.log(`  Created: ${char.createdAt}`)
      console.log(`  Config: ${JSON.stringify(char.config, null, 2)}`)
    })

    console.log('\n' + '='.repeat(70))
    console.log('\nAll characters loaded successfully.\n')

    // Step 2: Chat with the first character via REST
    const firstCharacter = characters[0]
    const testMessage = 'Hello! Tell me about yourself.'

    console.log(`Testing chat with "${firstCharacter.name}" via REST...\n`)
    const chatResponse = await fetchWithAuth('/chat', {
      method: 'POST',
      body: JSON.stringify({
        characterId: firstCharacter.id,
        message: testMessage,
      }),
    })

    console.log(`Player: "${testMessage}"`)
    console.log(`${firstCharacter.name}: "${chatResponse.response}"`)
    console.log('\nChat test successful.\n')
  } catch (error) {
    console.error('REST integration failed:', error.message)
    process.exit(1)
  }
}

runRestIntegrationTest()
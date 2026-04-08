// GuildCraft SDK - Game Character Fetcher
// Hardcoded to fetch all characters for a specific game project

const { GuildCraftClient } = require('@adarsh23/guildcraft-sdk')

// 🎮 HARDCODED GAME API KEY
const GAME_API_KEY = 'gc_live_ae6f002451c6b40f47ce057e3ee99707'
const API_BASE_URL = 'http://localhost:3000/api'

async function fetchGameCharacters() {
  try {
    console.log('🎮 GuildCraft Game Character Fetcher\n')
    console.log(`API Key: ${GAME_API_KEY}`)
    console.log(`Base URL: ${API_BASE_URL}\n`)

    // Initialize the SDK client
    const gc = new GuildCraftClient(GAME_API_KEY, API_BASE_URL)
    console.log('✅ SDK initialized successfully\n')

    // Fetch all characters for this game/project
    console.log('📖 Fetching all characters from the game...\n')
    const characters = await gc.getCharacters()

    if (!characters || characters.length === 0) {
      console.log('❌ No characters found for this game.')
      return
    }

    // Display character data
    console.log(`✅ Found ${characters.length} characters:\n`)
    console.log('═'.repeat(70))

    characters.forEach((char, index) => {
      console.log(`\n🎭 Character ${index + 1}: ${char.name}`)
      console.log(`   ID: ${char.id}`)
      console.log(`   Project ID: ${char.projectId}`)
      console.log(`   Created: ${char.createdAt}`)
      console.log(`   Config: ${JSON.stringify(char.config, null, 2)}`)
    })

    console.log('\n' + '═'.repeat(70))
    console.log(`\n✅ All characters loaded successfully!\n`)

    // Test chat with first character
    if (characters.length > 0) {
      console.log(`💬 Testing chat with "${characters[0].name}"...\n`)
      const testMessage = 'Hello! Tell me about yourself.'
      const chatResponse = await gc.chat(characters[0].id, testMessage)

      console.log(`Player: "${testMessage}"`)
      console.log(`${characters[0].name}: "${chatResponse.response}"`)
      console.log(`\n✅ Chat test successful!\n`)
    }
  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  }
}

// Run the fetcher
fetchGameCharacters()

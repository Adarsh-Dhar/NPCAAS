// test-sdk.js - GuildCraft SDK Test Suite
// This demonstrates using the @adarsh23/guildcraft-sdk package to fetch characters and interact with NPCs

const { GuildCraftClient } = require('@adarsh23/guildcraft-sdk');

const API_KEY = 'gc_live_ae6f002451c6b40f47ce057e3ee99707';
const BASE_URL = 'http://localhost:3000/api';

// Initialize the GuildCraft client
const gc = new GuildCraftClient(API_KEY, BASE_URL);

async function testSDK() {
  console.log('🎮 GuildCraft SDK Test Suite\n');
  console.log(`API Key: ${API_KEY}`);
  console.log(`Base URL: ${BASE_URL}\n`);

  // Test 1: Get all characters for this project
  console.log('--- Test 1: Fetch All Characters ---');
  try {
    const characters = await gc.getCharacters();
    console.log(`✅ Success! Retrieved ${characters.length} characters:\n`);
    
    characters.forEach((char, index) => {
      console.log(`${index + 1}. ${char.name} (ID: ${char.id})`);
      console.log(`   Wallet: ${char.walletAddress || 'N/A'}`);
      console.log(`   On Chain: ${char.isDeployedOnChain ? 'Yes' : 'No'}`);
      if (char.config) {
        console.log(`   Config: ${JSON.stringify(char.config).substring(0, 50)}...`);
      }
      console.log();
    });

    // Test 2: Chat with each character
    if (characters.length > 0) {
      console.log('\n--- Test 2: Chat with Each Character ---\n');
      
      for (const character of characters) {
        try {
          console.log(`💬 Chatting with ${character.name}...`);
          const response = await gc.chat(character.id, 'Hello! Can you help me find good equipment?');
          
          console.log(`${character.name}: ${response.response}\n`);
          
          if (response.tradeIntent) {
            console.log(`📦 Trade Offer:`);
            console.log(`   Item: ${response.tradeIntent.item}`);
            console.log(`   Price: ${response.tradeIntent.price} ${response.tradeIntent.currency}\n`);
          }
        } catch (error) {
          console.error(`❌ Error chatting with ${character.name}:`, error.message);
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Error fetching characters:', error.message);
  }

  // Test 3: Demonstrate invalid key rejection
  console.log('\n--- Test 3: Invalid API Key Handling ---');
  try {
    const invalidClient = new GuildCraftClient('invalid_key', BASE_URL);
    console.log('❌ Should have rejected invalid key');
  } catch (error) {
    console.log(`✅ Correctly rejected invalid key: ${error.message}`);
  }
}

// Run the test suite
testSDK().catch(console.error);
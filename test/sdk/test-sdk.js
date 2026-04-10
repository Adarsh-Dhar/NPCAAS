const { GuildCraftClient } = require('@adarsh23/guildcraft-sdk');

const API_KEY = 'gc_live_ae6f002451c6b40f47ce057e3ee99707';
const BASE_URL = 'http://localhost:3000/api';

const gc = new GuildCraftClient(API_KEY, BASE_URL);

async function testSDK() {
  console.log('🎮 GuildCraft Web3 SDK Test Suite\n');

  // --- Test 1: Fetch Characters ---
  console.log('--- Test 1: Fetch All Characters ---');
  let characters = [];
  try {
    characters = await gc.getCharacters();
    console.log(`✅ Success! Retrieved ${characters.length} characters:\n`);
    characters.forEach((char, index) => {
      console.log(`${index + 1}. ${char.name} (ID: ${char.id})`);
      console.log(`   AA Wallet: ${char.walletAddress || 'None'}\n`);
    });
  } catch (error) {
    console.error('❌ Error fetching characters:', error.message);
    return;
  }

  // --- Test 2 & 3: Chat and Execute Transaction ---
  if (characters.length > 0) {
    const character = characters[0];
    console.log(`\n--- Test 2: Chatting with ${character.name} ---\n`);

    try {
      const chatRes = await gc.chat(character.id, 'I want to buy some industrial solvent to clean my ship.');

      // Render action and dialogue separately
      if (chatRes.action) {
        console.log(`[ACTION]: *${chatRes.action}*`);
      }
      console.log(`[DIALOGUE]: "${chatRes.response}"\n`);

      // --- Test 3: Transaction Routing ---
      if (chatRes.tradeIntent) {
        console.log(`📦 Trade Intent Detected! Attempting to execute transaction...`);
        console.log(`   Item: ${chatRes.tradeIntent.item} for ${chatRes.tradeIntent.price} ${chatRes.tradeIntent.currency}\n`);

        const txRes = await gc.executeTransaction(character.id, chatRes.tradeIntent);

        console.log(`--- Test 3: Transaction Routing ---`);
        console.log(`✅ Success! Execution Mode: ${txRes.mode}`);

        if (txRes.mode === 'user-paid' && txRes.txRequest) {
          console.log(`\n💳 USER PAYMENT REQUIRED`);
          console.log(`Pass this txRequest to MetaMask via window.ethereum:`);
          console.log(JSON.stringify(txRes.txRequest, null, 2));
          console.log(`\nMessage from Backend: ${txRes.message}`);
        } else if (txRes.mode === 'sponsored') {
          console.log(`\n⛽ GAS SPONSORED BY KITE PAYMASTER`);
          console.log(`Transaction Hash: ${txRes.txHash}`);
        } else {
          console.log(`\n⚠️  FALLBACK MODE`);
          console.log(`Message: ${txRes.message}`);
          if (txRes.sponsorError) console.log(`Sponsor Error: ${txRes.sponsorError}`);
        }
      } else {
        console.log(`(No trade intent generated. Re-run to trigger a sale.)`);
      }
    } catch (error) {
      console.error(`❌ Error in Chat/Transaction flow:`, error.message);
    }
  }

  // --- Test 4: Invalid Key ---
  console.log('\n--- Test 4: Invalid API Key Handling ---');
  try {
    const invalidClient = new GuildCraftClient('invalid_key', BASE_URL);
    console.log('❌ Should have rejected invalid key');
  } catch (error) {
    console.log(`✅ Correctly rejected invalid key at init: ${error.message}`);
  }
}

testSDK().catch(console.error);
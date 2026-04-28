# 🎮 GuildCraft

GuildCraft (formerly NPCAAS) is a lightweight, one-click NPM SDK that empowers game developers to deploy autonomous, LLM-integrated Non-Playable Characters (NPCs) with native Web3 payment capabilities.

Built for the Kite AI Hackathon (Novel Track), GuildCraft leverages Kite AI—the first AI payment blockchain. It provides the foundational infrastructure allowing your in-game NPCs to operate as autonomous economic actors that can transact, manage identity, and settle real-world value on-chain.

## ✨ Features

- **🧠 LLM-Powered Brain**: Connect any major LLM (via Model Context Protocol) to give your NPCs dynamic, context-aware dialogue and decision-making capabilities.
- **💳 Native Web3 Economy & Identity**: Fully integrated with the Kite Agent Passport, granting your NPCs a unique identity (Agent ID) and scoped spending sessions.
- **⚡ 1-Click Integration**: A heavily TypeScript-based (89.9%) developer experience designed to easily inject Web3-enabled NPCs into existing game engines.
- **⛽ Gasless Transactions**: Utilizes Kite's Stablecoin Gasless Transfer service via EIP-3009 signed messages so game developers can sponsor transaction fees, removing friction for players.
- **🔗 Verifiable Actions**: All premium NPC interactions (like API calls or trading in-game assets) settle directly on the Kite Testnet for full auditability.

## Mode 3 Deep Integration

GuildCraft now supports an opt-in Mode 3 path that lets the published SDK manage Kite AA smart accounts directly.

- Developers initialize `GuildCraftClient` with a backend master private key.
- `deployCharacter()` can deploy a ClientAgentVault and configure spending rules on-chain.
- `executeTransaction()` can intercept `402 Payment Required` responses from merchant services and settle the quoted ERC-20 payment through Kite AA before retrying the request.

Legacy API-only integrations still work without any changes.

## 📦 Installation

```bash
npm install guildcraft
# or
yarn add guildcraft
```

## 🚀 Quickstart: Integrating the SDK

Here is how you can initialize an autonomous NPC in your game and connect it to the Kite AI ecosystem using the `gokite-aa-sdk`:

```typescript

import { GokiteAASDK } from 'gokite-aa-sdk';

// 1. Initialize the NPC with LLM and Kite AI Web3 configurations
const gameNPC = new NPCBuilder({
  name: "Merchant Bob",
  persona: "A medieval trader who dynamically adjusts prices based on real-world market APIs.",
  llmConfig: {
    provider: "openai",
    apiKey: process.env.LLM_API_KEY
  },
  // Kite AI Integration using Account Abstraction (AA)
  kiteConfig: {
    network: "kite_testnet",
    rpcUrl: "https://rpc-testnet.gokite.ai/",
    agentPassportKey: process.env.KITE_PASSPORT_KEY, 
    enableGaslessTransactions: true // Connects to https://gasless.gokite.ai
  }
});

// 2. Start the autonomous agent & define its spending rules
await gameNPC.spawn();
await gameNPC.setSpendingRules({
    timeWindow: 86400n, // 24 hrs
    budget: 100, // Enforced on-chain via smart contracts
});

// 3. Example: NPC autonomously executes a paid API call and settles on Kite Chain
gameNPC.on('playerTrade', async (tradeDetails) => {
  const transactionReceipt = await gameNPC.executePaidAction(tradeDetails);
  console.log(`Trade settled on Kite Chain! Receipt: ${transactionReceipt.hash}`);
});
```

## 🏆 Hackathon Context (Novel Track)

This project was built to explore unexpected integrations between gaming, AI, and programmable money.

- **Agent Autonomy**: The NPC operates with minimal human involvement once spawned, adhering to cryptographic spending bounds.
- **Real-World Applicability**: Solves the friction of integrating complex Web3 tokenomics and LLM logic into games using Kite's pre-built AA wallets.
- **Developer Experience**: Clean, NPM-installable SDK with clear TypeScript definitions.

## SDK Change Summary

The SDK now has two supported paths:

- Legacy API mode: the current chat, deploy, and transaction flow remains unchanged.
- Mode 3 AA mode: add a backend master private key plus encoded deploy/config calldata to enable agent passports, spending rules, and x402 settlement.

See [frontend/sdk/README.md](frontend/sdk/README.md) for the exact constructor options and payload shapes.

## © Copyright

Copyright (c) 2026 Adarsh. All rights reserved.

## 📄 License

This project is licensed under the MIT License.
See the LICENSE file at the repository root for full terms.
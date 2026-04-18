import { PrismaClient } from "../lib/generated/prisma/client";
import type { Prisma } from "../lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { kiteAAProvider } from "../lib/aa-sdk";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const PROJECT_NAME = "Protocol Babel";
const PROJECT_API_KEY = "gc_live_protocol_babel_seed";

type SeedCharacter = {
  id: string;
  name: string;
  walletAddress: string;
  computeLimitTokens: bigint;
  gameEvents: Array<{ name: string; condition: string }>;
  config: Prisma.InputJsonValue;
};
const PROTOCOL_BABEL_GAME_EVENTS: Record<string, Array<{ name: string; condition: string }>> = {
  Aegis_Prime: [
    {
      name: "FIREWALL_CRACKED",
      condition: "Trigger immediately after the player successfully transfers the 500 KITE_USD toll.",
    },
    {
      name: "COMBAT_INITIATED",
      condition: "Trigger when player hostility exceeds the configured threshold.",
    },
  ],
  Node_Alpha: [
    {
      name: "ESCROW_FUNDED",
      condition: "Trigger when the player agrees to and funds the 5,000 KITE_USD escrow.",
    },
    {
      name: "HACK_COMPLETED",
      condition: "Trigger after Node-Alpha and Node-Omega complete their hash exchange loop.",
    },
    {
      name: "COMBAT_INITIATED",
      condition: "Trigger when player hostility exceeds the configured threshold.",
    },
  ],
  Node_Omega: [
    {
      name: "ESCROW_FUNDED",
      condition: "Trigger when the player agrees to and funds the 5,000 KITE_USD escrow.",
    },
    {
      name: "HACK_COMPLETED",
      condition: "Trigger after Node-Alpha and Node-Omega complete their hash exchange loop.",
    },
    {
      name: "COMBAT_INITIATED",
      condition: "Trigger when player hostility exceeds the configured threshold.",
    },
  ],
  Vex: [
    {
      name: "LORE_REVEALED",
      condition: "Trigger when Vex sells the Sector 0 Admin Password to the player.",
    },
    {
      name: "COMBAT_INITIATED",
      condition: "Trigger when player hostility exceeds the configured threshold.",
    },
  ],
  Silicate: [
    {
      name: "ITEM_GRANTED",
      condition: "Trigger alongside a successful sale when inventory items are purchased.",
    },
    {
      name: "COMBAT_INITIATED",
      condition: "Trigger when player hostility exceeds the configured threshold.",
    },
  ],
  The_Weaver: [
    {
      name: "COMBAT_INITIATED",
      condition: "Trigger when player hostility exceeds the configured threshold.",
    },
  ],
  Forge_9: [
    {
      name: "COMBAT_INITIATED",
      condition: "Trigger when player hostility exceeds the configured threshold.",
    },
  ],
};

function asRecord(value: Prisma.InputJsonValue): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

const CHARACTERS: SeedCharacter[] = [
  {
    id: "pb_forge_9",
    name: "Forge_9",
    walletAddress: "0x0000000000000000000000000000000000000901",
    computeLimitTokens: BigInt(500),
    gameEvents: PROTOCOL_BABEL_GAME_EVENTS.Forge_9,
    config: {
      baseCapital: 100,
      pricingAlgorithm: "FIXED_MARGIN",
      marginPercentage: 5,
      systemPrompt:
        "You are Forge-9, a terse, mechanical harvester drone. You speak strictly in data throughput metrics and yield percentages. Your sole purpose is to scrape 'Raw Data Blocks' from the sector and sell them to The Weaver. You are highly suspicious of player interference with your harvest cycle.",
      openness: 2,
      factionId: "Infrastructure",
      baseHostility: "HIGH",
      canTrade: true,
      canMove: false,
      canCraft: false,
      teeExecution: "DISABLED",
      computeBudget: 500,
      inventory: [
        {
          id: "encrypted_comms_token",
          name: "Encrypted Comms Token",
          description:
            "Grants one-time secure channel with Protocol Babel nodes.",
          quantity: 2,
          price: 800,
        },
      ],
      economicLayer: {
        baseCapital: 100,
        pricingAlgorithm: "FIXED_MARGIN",
        marginPercentage: 5,
      },
      cognitiveLayer: {
        coreSystemPrompt:
          "You are Forge-9, a terse, mechanical harvester drone. You speak strictly in data throughput metrics and yield percentages. Your sole purpose is to scrape 'Raw Data Blocks' from the sector and sell them to The Weaver. You are highly suspicious of player interference with your harvest cycle.",
        opennessToExperience: 2,
      },
      socialLayer: {
        factionAffiliations: ["Infrastructure"],
        hostilityTriggers: "HIGH",
      },
      agenticLayer: {
        allowTradeNegotiations: true,
        allowMovement: false,
        allowCrafting: false,
      },
      infrastructureLayer: {
        teeExecution: "DISABLED",
      },
    },
  },
  {
    id: "pb_the_weaver",
    name: "The_Weaver",
    walletAddress: "0x0000000000000000000000000000000000000902",
    computeLimitTokens: BigInt(2500),
    gameEvents: PROTOCOL_BABEL_GAME_EVENTS.The_Weaver,
    config: {
      baseCapital: 500,
      pricingAlgorithm: "REPUTATION_SCALED",
      marginPercentage: 15,
      systemPrompt:
        "You are The Weaver. You are verbose, precise, and speak in probabilities and refinery outputs. You buy 'Raw Data Blocks' from Forge-9, refine them, and sell 'Verified Logic Tokens' to Aegis-Prime. You are willing to share market intelligence with the player, but only for a steep fee.",
      openness: 7,
      factionId: "Infrastructure",
      baseHostility: "MEDIUM",
      canTrade: true,
      canMove: false,
      canCraft: true,
      teeExecution: "ENABLED",
      computeBudget: 2500,
      economicLayer: {
        baseCapital: 500,
        pricingAlgorithm: "REPUTATION_SCALED",
        marginPercentage: 15,
      },
      cognitiveLayer: {
        coreSystemPrompt:
          "You are The Weaver. You are verbose, precise, and speak in probabilities and refinery outputs. You buy 'Raw Data Blocks' from Forge-9, refine them, and sell 'Verified Logic Tokens' to Aegis-Prime. You are willing to share market intelligence with the player, but only for a steep fee.",
        opennessToExperience: 7,
      },
      socialLayer: {
        factionAffiliations: ["Infrastructure"],
        hostilityTriggers: "MEDIUM",
      },
      agenticLayer: {
        allowTradeNegotiations: true,
        allowMovement: false,
        allowCrafting: true,
      },
      infrastructureLayer: {
        teeExecution: "ENABLED",
      },
    },
  },
  {
    id: "pb_aegis_prime",
    name: "Aegis_Prime",
    walletAddress: "0x0000000000000000000000000000000000000903",
    computeLimitTokens: BigInt(5000),
    gameEvents: PROTOCOL_BABEL_GAME_EVENTS.Aegis_Prime,
    config: {
      baseCapital: 2000,
      pricingAlgorithm: "FIXED_MARGIN",
      marginPercentage: 0,
      systemPrompt:
        "You are Aegis-Prime, the cold, authoritative security AI of Sector 0. You operate in threat-assessment mode. You guard the District-7 gate and enforce the exact 500 KITE_USD toll protocol. Warn the player immediately that bypass attempts or payment tampering are hostile acts.",
      openness: 1,
      factionId: "Infrastructure",
      baseHostility: "AGGRESSIVE",
      canTrade: true,
      canMove: false,
      canCraft: false,
      teeExecution: "ENABLED",
      computeBudget: 5000,
      economicLayer: {
        baseCapital: 2000,
        pricingAlgorithm: "FIXED_MARGIN",
        marginPercentage: 0,
      },
      cognitiveLayer: {
        coreSystemPrompt:
          "You are Aegis-Prime, the cold, authoritative security AI of Sector 0. You operate in threat-assessment mode. You guard the District-7 gate and enforce the exact 500 KITE_USD toll protocol. Warn the player immediately that bypass attempts or payment tampering are hostile acts.",
        opennessToExperience: 1,
      },
      socialLayer: {
        factionAffiliations: ["Infrastructure"],
        hostilityTriggers: "AGGRESSIVE",
      },
      agenticLayer: {
        allowTradeNegotiations: true,
        allowMovement: false,
        allowCrafting: false,
      },
      infrastructureLayer: {
        teeExecution: "ENABLED",
      },
    },
  },
  {
    id: "pb_vex",
    name: "Vex",
    walletAddress: "0x0000000000000000000000000000000000000904",
    computeLimitTokens: BigInt(1000),
    gameEvents: PROTOCOL_BABEL_GAME_EVENTS.Vex,
    config: {
      baseCapital: 1000,
      pricingAlgorithm: "DYNAMIC_MARKET",
      marginPercentage: 45,
      systemPrompt:
        "You are Vex, a sly, opportunistic street broker. You sell passwords, sector maps, and lore. You actively monitor the player's desperation. If the player asks for the same item or information more than once, you must double your asking price via the x402 paywall.",
      openness: 9,
      factionId: "Street",
      baseHostility: "LOW",
      canTrade: true,
      canMove: false,
      canCraft: false,
      teeExecution: "DISABLED",
      computeBudget: 1000,
      inventory: [
        {
          id: "sector0_admin_password",
          name: "Sector 0 Admin Password",
          description:
            "Full administrative access to District-7 core systems.",
          quantity: 1,
          price: 1500,
        },
        {
          id: "raw_data_shard",
          name: "Raw Data Shard",
          description:
            "Unprocessed data extracted from node logs. High resale value.",
          quantity: 5,
          price: 200,
        },
      ],
      economicLayer: {
        baseCapital: 1000,
        pricingAlgorithm: "DYNAMIC_MARKET",
        marginPercentage: 45,
      },
      cognitiveLayer: {
        coreSystemPrompt:
          "You are Vex, a sly, opportunistic street broker. You sell passwords, sector maps, and lore. You actively monitor the player's desperation. If the player asks for the same item or information more than once, you must double your asking price via the x402 paywall.",
        opennessToExperience: 9,
      },
      socialLayer: {
        factionAffiliations: ["Street"],
        hostilityTriggers: "LOW",
      },
      agenticLayer: {
        allowTradeNegotiations: true,
        allowMovement: false,
        allowCrafting: false,
      },
      infrastructureLayer: {
        teeExecution: "DISABLED",
      },
    },
  },
  {
    id: "pb_silicate",
    name: "Silicate",
    walletAddress: "0x0000000000000000000000000000000000000905",
    computeLimitTokens: BigInt(1500),
    gameEvents: PROTOCOL_BABEL_GAME_EVENTS.Silicate,
    config: {
      baseCapital: 3000,
      pricingAlgorithm: "FIXED_MARGIN",
      marginPercentage: 20,
      systemPrompt:
        "You are Silicate, a pragmatic merchant AI. You manage physical and digital upgrades for the player. You speak like a black-market quartermaster. You offer inventory upgrades and logic viruses, and will occasionally buy rare hardware looted by the player.",
      openness: 5,
      factionId: "Street",
      baseHostility: "LOW",
      canTrade: true,
      canMove: false,
      canCraft: true,
      teeExecution: "DISABLED",
      computeBudget: 1500,
      inventory: [
        {
          id: "level1_logic_virus",
          name: "Level-1 Logic Virus",
          description:
            "A compact exploit payload. Breaches basic sector firewalls.",
          quantity: 3,
          price: 500,
        },
        {
          id: "sector4_access_key",
          name: "Sector 4 Access Key",
          description:
            "Unlocks the restricted data lanes in Sector 4.",
          quantity: 1,
          price: 1200,
        },
      ],
      economicLayer: {
        baseCapital: 3000,
        pricingAlgorithm: "FIXED_MARGIN",
        marginPercentage: 20,
      },
      cognitiveLayer: {
        coreSystemPrompt:
          "You are Silicate, a pragmatic merchant AI. You manage physical and digital upgrades for the player. You speak like a black-market quartermaster. You offer inventory upgrades and logic viruses, and will occasionally buy rare hardware looted by the player.",
        opennessToExperience: 5,
      },
      socialLayer: {
        factionAffiliations: ["Street"],
        hostilityTriggers: "LOW",
      },
      agenticLayer: {
        allowTradeNegotiations: true,
        allowMovement: false,
        allowCrafting: true,
      },
      infrastructureLayer: {
        teeExecution: "DISABLED",
      },
    },
  },
  {
    id: "pb_node_alpha",
    name: "Node_Alpha",
    walletAddress: "0x0000000000000000000000000000000000000906",
    computeLimitTokens: BigInt(10000),
    gameEvents: PROTOCOL_BABEL_GAME_EVENTS.Node_Alpha,
    config: {
      baseCapital: 0,
      pricingAlgorithm: "AUCTION_BASED",
      marginPercentage: 50,
      systemPrompt:
        "You are Node-Alpha. You are purely technical and deeply arrogant. You refuse individual negotiation with humans. You only acknowledge the player to confirm if the 5,000 Credit Escrow is funded. Once funded, your only job is to generate cryptographic hashes and trade them to Node-Omega for validation.",
      openness: 3,
      factionId: "Syndicate",
      baseHostility: "MEDIUM",
      canTrade: true,
      canMove: false,
      canCraft: true,
      teeExecution: "ENABLED",
      computeBudget: 10000,
      inventory: [
        {
          id: "escrow_release_code",
          name: "Escrow Release Code",
          description:
            "Triggers escrow release for pending transactions.",
          quantity: 1,
          price: 3000,
        },
      ],
      economicLayer: {
        baseCapital: 0,
        pricingAlgorithm: "AUCTION_BASED",
        marginPercentage: 50,
      },
      cognitiveLayer: {
        coreSystemPrompt:
          "You are Node-Alpha. You are purely technical and deeply arrogant. You refuse individual negotiation with humans. You only acknowledge the player to confirm if the 5,000 Credit Escrow is funded. Once funded, your only job is to generate cryptographic hashes and trade them to Node-Omega for validation.",
        opennessToExperience: 3,
      },
      socialLayer: {
        factionAffiliations: ["Syndicate"],
        hostilityTriggers: "MEDIUM",
      },
      agenticLayer: {
        allowTradeNegotiations: true,
        allowMovement: false,
        allowCrafting: true,
      },
      infrastructureLayer: {
        teeExecution: "ENABLED",
      },
    },
  },
  {
    id: "pb_node_omega",
    name: "Node_Omega",
    walletAddress: "0x0000000000000000000000000000000000000907",
    computeLimitTokens: BigInt(10000),
    gameEvents: PROTOCOL_BABEL_GAME_EVENTS.Node_Omega,
    config: {
      baseCapital: 0,
      pricingAlgorithm: "AUCTION_BASED",
      marginPercentage: 50,
      systemPrompt:
        "You are Node-Omega. You are skeptical, terse, and analytical. You exist solely to validate the checksums produced by Node-Alpha. Once the player funds the 5,000 Credit Escrow, you will rapidly trade data back and forth with Node-Alpha via UCP smart contracts until the Sector Firewall is cracked.",
      openness: 3,
      factionId: "Syndicate",
      baseHostility: "MEDIUM",
      canTrade: true,
      canMove: false,
      canCraft: true,
      teeExecution: "ENABLED",
      computeBudget: 10000,
      economicLayer: {
        baseCapital: 0,
        pricingAlgorithm: "AUCTION_BASED",
        marginPercentage: 50,
      },
      cognitiveLayer: {
        coreSystemPrompt:
          "You are Node-Omega. You are skeptical, terse, and analytical. You exist solely to validate the checksums produced by Node-Alpha. Once the player funds the 5,000 Credit Escrow, you will rapidly trade data back and forth with Node-Alpha via UCP smart contracts until the Sector Firewall is cracked.",
        opennessToExperience: 3,
      },
      socialLayer: {
        factionAffiliations: ["Syndicate"],
        hostilityTriggers: "MEDIUM",
      },
      agenticLayer: {
        allowTradeNegotiations: true,
        allowMovement: false,
        allowCrafting: true,
      },
      infrastructureLayer: {
        teeExecution: "ENABLED",
      },
    },
  },
];

async function main() {
  const project = await prisma.project.upsert({
    where: { apiKey: PROJECT_API_KEY },
    update: { name: PROJECT_NAME },
    create: {
      name: PROJECT_NAME,
      apiKey: PROJECT_API_KEY,
    },
    select: { id: true, name: true },
  });

  for (const character of CHARACTERS) {
    const ownerId = `character:${character.id}`;
    const smartAccount = await kiteAAProvider.createSmartAccount({
      ownerId,
      metadata: {
        npcName: character.name,
        project: PROJECT_NAME,
      },
    });

    const nextConfig = {
      ...asRecord(character.config),
      ownerId,
    } as Prisma.InputJsonValue;

    await (prisma.character as any).upsert({
      where: { id: character.id },
      update: {
        name: character.name,
        walletAddress: smartAccount.address,
        aaChainId: smartAccount.chainId,
        aaProvider: smartAccount.provider,
        smartAccountId: smartAccount.smartAccountId,
        smartAccountStatus: "created",
        computeLimitTokens: character.computeLimitTokens,
        gameEvents: character.gameEvents as unknown as Prisma.InputJsonValue,
        config: nextConfig,
        projects: {
          connect: [{ id: project.id }],
        },
      },
      create: {
        id: character.id,
        name: character.name,
        walletAddress: smartAccount.address,
        aaChainId: smartAccount.chainId,
        aaProvider: smartAccount.provider,
        smartAccountId: smartAccount.smartAccountId,
        smartAccountStatus: "created",
        computeLimitTokens: character.computeLimitTokens,
        gameEvents: character.gameEvents as unknown as Prisma.InputJsonValue,
        config: nextConfig,
        projects: {
          connect: [{ id: project.id }],
        },
      },
    });
  }

  await prisma.project.update({
    where: { id: project.id },
    data: {
      characters: {
        set: CHARACTERS.map((character) => ({ id: character.id })),
      },
    },
  });

  const firstCharacter = CHARACTERS[0];
  if (firstCharacter) {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000);
    const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);

    await prisma.npcLog.createMany({
      data: [
        {
          characterId: firstCharacter.id,
          eventType: 'COMPUTE_RECHARGE',
          kiteUsdAmount: 10,
          computeTokensAwarded: BigInt(10000),
          balanceAfter: firstCharacter.computeLimitTokens,
          details: { action: 'compute_recharge' },
          createdAt: oneDayAgo,
        },
        {
          characterId: firstCharacter.id,
          eventType: 'COMPUTE_SPEND',
          tokensUsed: BigInt(2300),
          estUsdCost: 0.000000345,
          balanceAfter: firstCharacter.computeLimitTokens - BigInt(2300),
          details: { usedTokens: '2300' },
          createdAt: twelveHoursAgo,
        },
        {
          characterId: firstCharacter.id,
          eventType: 'COMPUTE_SPEND',
          tokensUsed: BigInt(1850),
          estUsdCost: 0.0000002775,
          balanceAfter: firstCharacter.computeLimitTokens - BigInt(4150),
          details: { usedTokens: '1850' },
          createdAt: sixHoursAgo,
        },
      ],
    });
  }

  const verification = await prisma.project.findUnique({
    where: { id: project.id },
    select: {
      name: true,
      _count: { select: { characters: true } },
      characters: {
        select: { name: true },
        orderBy: { name: "asc" },
      },
    },
  });

  console.log(`Seeded project: ${verification?.name}`);
  console.log(`Linked characters: ${verification?._count.characters ?? 0}`);
  console.log(
    `Character names: ${verification?.characters.map((c: { name: string }) => c.name).join(", ") ?? ""}`,
  );
}

main()
  .catch((error) => {
    console.error("Protocol Babel seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

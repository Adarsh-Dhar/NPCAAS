-- Add smart-account and adaptation metadata to characters.
ALTER TABLE "Character"
ADD COLUMN "walletAddress" TEXT,
ADD COLUMN "aaChainId" INTEGER,
ADD COLUMN "aaProvider" TEXT,
ADD COLUMN "smartAccountId" TEXT,
ADD COLUMN "smartAccountStatus" TEXT NOT NULL DEFAULT 'created',
ADD COLUMN "isDeployedOnChain" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "deploymentTxHash" TEXT,
ADD COLUMN "adaptation" JSONB,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill required fields for pre-existing rows.
UPDATE "Character"
SET
	"walletAddress" = COALESCE(
		"walletAddress",
		'0x' || substr(md5("id"), 1, 32) || substr(md5("projectId"), 1, 8)
	),
	"aaChainId" = COALESCE("aaChainId", 42161),
	"aaProvider" = COALESCE("aaProvider", 'legacy-migration');

ALTER TABLE "Character"
ALTER COLUMN "walletAddress" SET NOT NULL,
ALTER COLUMN "aaChainId" SET NOT NULL,
ALTER COLUMN "aaProvider" SET NOT NULL;

ALTER TABLE "Character"
ALTER COLUMN "aaChainId" SET DEFAULT 42161,
ALTER COLUMN "aaProvider" SET DEFAULT 'kite-aa';

-- Remove compute budgeting fields and compute accounting columns.
ALTER TABLE "Character"
  DROP COLUMN IF EXISTS "computeUsageTokens",
  DROP COLUMN IF EXISTS "computeLimitTokens",
  DROP COLUMN IF EXISTS "lastComputeResetAt";

ALTER TABLE "NpcLog"
  DROP COLUMN IF EXISTS "kiteUsdAmount",
  DROP COLUMN IF EXISTS "computeTokensAwarded",
  DROP COLUMN IF EXISTS "tokensUsed",
  DROP COLUMN IF EXISTS "estUsdCost",
  DROP COLUMN IF EXISTS "balanceAfter";

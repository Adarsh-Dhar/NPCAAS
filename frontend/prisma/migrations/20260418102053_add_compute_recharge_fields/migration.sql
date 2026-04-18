-- AlterTable
ALTER TABLE "Character" ADD COLUMN     "gameEvents" JSONB;

-- AlterTable
ALTER TABLE "NpcLog" ADD COLUMN     "balanceAfter" BIGINT,
ADD COLUMN     "computeTokensAwarded" BIGINT,
ADD COLUMN     "estUsdCost" DECIMAL(10,6),
ADD COLUMN     "kiteUsdAmount" DECIMAL(10,2),
ADD COLUMN     "tokensUsed" BIGINT,
ADD COLUMN     "txHash" TEXT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "globalContext" TEXT;

-- CreateIndex
CREATE INDEX "NpcLog_eventType_idx" ON "NpcLog"("eventType");

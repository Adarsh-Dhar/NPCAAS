/*
  Warnings:

  - You are about to drop the column `projectId` on the `Character` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Character" DROP CONSTRAINT "Character_projectId_fkey";

-- DropIndex
DROP INDEX "Character_projectId_idx";

-- AlterTable
ALTER TABLE "Character" DROP COLUMN "projectId",
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "NpcLog" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NpcLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionQueue" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "payload" JSONB,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "executeAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActionQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_CharacterToProject" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_CharacterToProject_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "NpcLog_characterId_idx" ON "NpcLog"("characterId");

-- CreateIndex
CREATE INDEX "NpcLog_characterId_eventType_idx" ON "NpcLog"("characterId", "eventType");

-- CreateIndex
CREATE INDEX "ActionQueue_characterId_idx" ON "ActionQueue"("characterId");

-- CreateIndex
CREATE INDEX "ActionQueue_characterId_status_idx" ON "ActionQueue"("characterId", "status");

-- CreateIndex
CREATE INDEX "_CharacterToProject_B_index" ON "_CharacterToProject"("B");

-- AddForeignKey
ALTER TABLE "NpcLog" ADD CONSTRAINT "NpcLog_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionQueue" ADD CONSTRAINT "ActionQueue_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CharacterToProject" ADD CONSTRAINT "_CharacterToProject_A_fkey" FOREIGN KEY ("A") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CharacterToProject" ADD CONSTRAINT "_CharacterToProject_B_fkey" FOREIGN KEY ("B") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

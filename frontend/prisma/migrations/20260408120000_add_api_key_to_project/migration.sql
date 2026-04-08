-- Add apiKey to projects and backfill existing rows safely.
ALTER TABLE "Project" ADD COLUMN "apiKey" TEXT;

UPDATE "Project"
SET "apiKey" = 'gc_live_' || substr(md5("id" || clock_timestamp()::text), 1, 32)
WHERE "apiKey" IS NULL;

ALTER TABLE "Project" ALTER COLUMN "apiKey" SET NOT NULL;

CREATE UNIQUE INDEX "Project_apiKey_key" ON "Project"("apiKey");

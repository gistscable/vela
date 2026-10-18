-- Applies 20261018000000_product_applications and 20261018010000_admin_controls.
-- Idempotent (safe to re-run). Paste into the Supabase SQL editor.
-- Afterwards, mark them applied for Prisma (from a terminal with DIRECT_URL set):
--   npx prisma migrate resolve --applied 20261018000000_product_applications
--   npx prisma migrate resolve --applied 20261018010000_admin_controls
BEGIN;

ALTER TABLE "Card" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'DEBIT';
ALTER TABLE "Card" ADD COLUMN IF NOT EXISTS "creditLimit" INTEGER;

CREATE TABLE IF NOT EXISTS "ProductApplication" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "productCode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
    "linkedAccountId" TEXT,
    "nickname" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAccountId" TEXT,
    "createdCardId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductApplication_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ProductApplication_userId_createdAt_idx" ON "ProductApplication"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "ProductApplication_status_createdAt_idx" ON "ProductApplication"("status", "createdAt");
DO $$ BEGIN
  ALTER TABLE "ProductApplication" ADD CONSTRAINT "ProductApplication_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "historyPaused" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "historyPausedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "historyPausedById" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "accessLocked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lockReason" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lockedById" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lockedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "User_accessLocked_idx" ON "User"("accessLocked");
CREATE INDEX IF NOT EXISTS "User_historyPaused_idx" ON "User"("historyPaused");

COMMIT;

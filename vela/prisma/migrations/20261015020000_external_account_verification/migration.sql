-- Add a review and simulated microdeposit-verification lifecycle for external destinations.
-- Existing destinations are put back into the review flow because no prior ownership challenge is recorded.
ALTER TABLE "ExternalAccount" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL';
ALTER TABLE "ExternalAccount" ADD COLUMN "microdepositAmount1" INTEGER;
ALTER TABLE "ExternalAccount" ADD COLUMN "microdepositAmount2" INTEGER;
ALTER TABLE "ExternalAccount" ADD COLUMN "microdepositExpiresAt" TIMESTAMP(3);
ALTER TABLE "ExternalAccount" ADD COLUMN "microdepositAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ExternalAccount" ADD COLUMN "reviewedById" TEXT;
ALTER TABLE "ExternalAccount" ADD COLUMN "reviewedAt" TIMESTAMP(3);
ALTER TABLE "ExternalAccount" ADD COLUMN "verifiedAt" TIMESTAMP(3);

CREATE INDEX "ExternalAccount_userId_status_createdAt_idx" ON "ExternalAccount"("userId", "status", "createdAt");

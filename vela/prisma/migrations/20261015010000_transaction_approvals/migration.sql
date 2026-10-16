-- Add a protected admin role and audit fields for approvals.
ALTER TABLE "User" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'CUSTOMER';

ALTER TABLE "Transaction" ADD COLUMN "paymentMethod" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "reviewedById" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "reviewedAt" TIMESTAMP(3);

CREATE INDEX "Transaction_status_createdAt_idx" ON "Transaction"("status", "createdAt");

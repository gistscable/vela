-- Additional deposit accounts, debit/credit card applications, and card kind/limit.

ALTER TABLE "Card" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'DEBIT';
ALTER TABLE "Card" ADD COLUMN "creditLimit" INTEGER;

CREATE TABLE "ProductApplication" (
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

CREATE INDEX "ProductApplication_userId_createdAt_idx" ON "ProductApplication"("userId", "createdAt");
CREATE INDEX "ProductApplication_status_createdAt_idx" ON "ProductApplication"("status", "createdAt");

ALTER TABLE "ProductApplication" ADD CONSTRAINT "ProductApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

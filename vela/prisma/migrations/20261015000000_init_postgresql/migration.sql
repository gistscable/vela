-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "routingNumber" TEXT NOT NULL,
    "balance" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "apy" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "counterparty" TEXT,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "reference" TEXT,
    "balanceAfter" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Card" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "last4" TEXT NOT NULL,
    "brand" TEXT NOT NULL DEFAULT 'Visa',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "dailyLimit" INTEGER NOT NULL DEFAULT 50000,
    "spentToday" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Card_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payee" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillPayee" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'OTHER',
    "accountMask" TEXT,
    "encryptedAccountNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillPayee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillPayment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "payeeId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "frequency" TEXT NOT NULL DEFAULT 'ONCE',
    "memo" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "confirmationNumber" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinkedBank" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'PLAID',
    "plaidItemId" TEXT,
    "institutionId" TEXT,
    "institutionName" TEXT NOT NULL,
    "encryptedAccessToken" TEXT NOT NULL,
    "accountsJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LinkedBank_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FundingIntent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "provider" TEXT NOT NULL DEFAULT 'STRIPE',
    "providerSessionId" TEXT,
    "stripePaymentIntentId" TEXT,
    "reference" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FundingIntent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MoneyRequest" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "memo" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "reference" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "MoneyRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessorEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessorEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Account_accountNumber_key" ON "Account"("accountNumber");

-- CreateIndex
CREATE INDEX "Account_userId_createdAt_idx" ON "Account"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Transaction_accountId_createdAt_idx" ON "Transaction"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "Transaction_reference_idx" ON "Transaction"("reference");

-- CreateIndex
CREATE INDEX "Card_accountId_idx" ON "Card"("accountId");

-- CreateIndex
CREATE INDEX "Payee_userId_createdAt_idx" ON "Payee"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "BillPayee_userId_createdAt_idx" ON "BillPayee"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BillPayment_confirmationNumber_key" ON "BillPayment"("confirmationNumber");

-- CreateIndex
CREATE INDEX "BillPayment_userId_scheduledFor_idx" ON "BillPayment"("userId", "scheduledFor");

-- CreateIndex
CREATE INDEX "BillPayment_accountId_scheduledFor_idx" ON "BillPayment"("accountId", "scheduledFor");

-- CreateIndex
CREATE UNIQUE INDEX "LinkedBank_plaidItemId_key" ON "LinkedBank"("plaidItemId");

-- CreateIndex
CREATE INDEX "LinkedBank_userId_createdAt_idx" ON "LinkedBank"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FundingIntent_providerSessionId_key" ON "FundingIntent"("providerSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "FundingIntent_stripePaymentIntentId_key" ON "FundingIntent"("stripePaymentIntentId");

-- CreateIndex
CREATE UNIQUE INDEX "FundingIntent_reference_key" ON "FundingIntent"("reference");

-- CreateIndex
CREATE INDEX "FundingIntent_userId_createdAt_idx" ON "FundingIntent"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MoneyRequest_reference_key" ON "MoneyRequest"("reference");

-- CreateIndex
CREATE INDEX "MoneyRequest_requesterId_status_createdAt_idx" ON "MoneyRequest"("requesterId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "MoneyRequest_recipientId_status_createdAt_idx" ON "MoneyRequest"("recipientId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "MoneyRequest_recipientEmail_status_createdAt_idx" ON "MoneyRequest"("recipientEmail", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Card" ADD CONSTRAINT "Card_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payee" ADD CONSTRAINT "Payee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillPayee" ADD CONSTRAINT "BillPayee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillPayment" ADD CONSTRAINT "BillPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillPayment" ADD CONSTRAINT "BillPayment_payeeId_fkey" FOREIGN KEY ("payeeId") REFERENCES "BillPayee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillPayment" ADD CONSTRAINT "BillPayment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkedBank" ADD CONSTRAINT "LinkedBank_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundingIntent" ADD CONSTRAINT "FundingIntent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundingIntent" ADD CONSTRAINT "FundingIntent_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoneyRequest" ADD CONSTRAINT "MoneyRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoneyRequest" ADD CONSTRAINT "MoneyRequest_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoneyRequest" ADD CONSTRAINT "MoneyRequest_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;


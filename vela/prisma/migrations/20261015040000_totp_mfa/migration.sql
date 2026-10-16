-- One encrypted TOTP secret per user. New users must enroll before full sign-in is issued.
ALTER TABLE "User" ADD COLUMN "mfaEnabled" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "User" ADD COLUMN "totpSecretEncrypted" TEXT;
ALTER TABLE "User" ADD COLUMN "totpLastUsedStep" INTEGER;
ALTER TABLE "User" ADD COLUMN "mfaPendingSecretEncrypted" TEXT;
ALTER TABLE "User" ADD COLUMN "mfaPendingExpiresAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "mfaFailedAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "mfaLockedUntil" TIMESTAMP(3);

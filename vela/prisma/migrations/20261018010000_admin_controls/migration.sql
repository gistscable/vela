-- Admin controls: pause generated history, lock customer access with a reason.

ALTER TABLE "User" ADD COLUMN "historyPaused" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "historyPausedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "historyPausedById" TEXT;
ALTER TABLE "User" ADD COLUMN "accessLocked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "lockReason" TEXT;
ALTER TABLE "User" ADD COLUMN "lockedById" TEXT;
ALTER TABLE "User" ADD COLUMN "lockedAt" TIMESTAMP(3);

CREATE INDEX "User_accessLocked_idx" ON "User"("accessLocked");
CREATE INDEX "User_historyPaused_idx" ON "User"("historyPaused");

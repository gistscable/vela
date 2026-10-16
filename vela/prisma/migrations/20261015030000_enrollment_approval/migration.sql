-- Existing accounts stay approved; only new enrollments explicitly start pending.
ALTER TABLE "User" ADD COLUMN "enrollmentStatus" TEXT NOT NULL DEFAULT 'APPROVED';
ALTER TABLE "User" ADD COLUMN "enrollmentReviewedById" TEXT;
ALTER TABLE "User" ADD COLUMN "enrollmentReviewedAt" TIMESTAMP(3);

CREATE INDEX "User_enrollmentStatus_createdAt_idx" ON "User"("enrollmentStatus", "createdAt");

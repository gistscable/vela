-- Repair for fresh databases. This does NOT modify any previously applied migration.
--
-- The init migration never created "ExternalAccount", yet 20261015020000_external_account_verification
-- ALTERs it, so replaying the history on a brand-new database failed there. Databases that were
-- created from the Prisma schema (e.g. `db push`) already have this table.
--
-- Everything here is IF NOT EXISTS: on a database that already has the table it changes nothing;
-- on a fresh database it creates the pre-20261015020000 shape that the next migration extends.
-- Its timestamp sorts between the two migrations it sits between, so replays run it in order, and
-- `prisma migrate deploy` applies it as a harmless no-op to databases that are already past that point.
CREATE TABLE IF NOT EXISTS "ExternalAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "institutionName" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "accountMask" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalAccount_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ExternalAccount_userId_createdAt_idx" ON "ExternalAccount"("userId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ExternalAccount_userId_fkey' AND conrelid = '"ExternalAccount"'::regclass
  ) THEN
    ALTER TABLE "ExternalAccount" ADD CONSTRAINT "ExternalAccount_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

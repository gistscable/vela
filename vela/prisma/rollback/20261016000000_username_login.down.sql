-- Manual rollback for 20261016000000_username_login. Prisma does not run this file.
--
-- Roll the application back to a release that predates usernames FIRST (or at the same time);
-- the previous release ignores these columns, so leaving them in place is also safe and is the
-- recommended default. Dropping them permanently deletes every chosen username.
--
-- If the migration was recorded by Prisma, afterwards run:
--   npx prisma migrate resolve --rolled-back 20261016000000_username_login --schema prisma/schema.postgresql.prisma
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_username_consistent_check";
DROP INDEX IF EXISTS "User_usernameNormalized_key";
ALTER TABLE "User" DROP COLUMN IF EXISTS "usernameNormalized";
ALTER TABLE "User" DROP COLUMN IF EXISTS "username";

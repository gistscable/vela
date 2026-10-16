-- Username / User ID: a separate, unique login identifier (not the internal "id").
--
-- Existing users are NOT given a generated username and keep signing in with their email.
-- They choose a username themselves in Settings; until then both columns stay NULL.
-- PostgreSQL treats NULLs as distinct in a unique index, so any number of users may still be
-- without a username while chosen usernames remain unique.
--
-- "username" keeps the spelling the user typed (for display); "usernameNormalized" is the
-- lower-cased value that carries the unique index, so "Sam.Lee" and "sam.lee" collide.
ALTER TABLE "User" ADD COLUMN "username" TEXT;
ALTER TABLE "User" ADD COLUMN "usernameNormalized" TEXT;

CREATE UNIQUE INDEX "User_usernameNormalized_key" ON "User"("usernameNormalized");

-- Defence in depth: the database itself refuses a normalized value that is not the lower-cased
-- username, an "@" (reserved to tell emails from usernames at sign-in), or a username set
-- without its normalized twin.
ALTER TABLE "User" ADD CONSTRAINT "User_username_consistent_check" CHECK (
  ("username" IS NULL AND "usernameNormalized" IS NULL)
  OR (
    "username" IS NOT NULL
    AND "usernameNormalized" IS NOT NULL
    AND "usernameNormalized" = lower("username")
    AND position('@' IN "username") = 0
  )
);

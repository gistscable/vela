# Deploying Username / User ID login (migration `20261016000000_username_login`)

**Order matters: apply the database migration first, then deploy the application.**

The new release reads `User.username` / `User.usernameNormalized`. Prisma selects every column of the
model on every `User` query, so a release deployed *before* the migration fails on sign-in, MFA, and
every authenticated page until the columns exist. The previous release, by contrast, ignores the new
columns, so applying the migration early is safe. (`tests/postgres-migrations.test.ts` checks both
directions.)

Netlify builds from `main`, so merging the PR deploys production. Apply the migration **before merging**.

## What the migration does

| Migration | Effect | Existing data |
|---|---|---|
| `20261015015000_ensure_external_account_table` | `CREATE TABLE/INDEX IF NOT EXISTS "ExternalAccount"` (+ FK guarded). Repairs *fresh* databases only: the init migration never created this table, so replaying history failed at `20261015020000`. | No-op where the table exists. |
| `20261016000000_username_login` | Adds nullable `User.username` and `User.usernameNormalized`, a unique index on `usernameNormalized`, and a CHECK that keeps the pair consistent (`usernameNormalized = lower(username)`, no `@`, both set or both null). | Rows are not modified. Nobody gets a generated username; users keep email sign-in and choose a username in Settings. |

Neither migration edits a previously applied migration. The guard migration's timestamp sorts before
migrations already applied in an existing database; `prisma migrate deploy` applies unapplied migrations
regardless, and the guard does nothing there.

## Applying through the Supabase dashboard (SQL editor)

The scripts in [`docs/supabase/`](./supabase) are generated from `prisma/migrations` by
`scripts/build-supabase-sql.mjs` (a test fails if they drift) and were replayed against real PostgreSQL, then
checked with Prisma's own `migrate status` / `migrate deploy`, which accepted the hand-written records.
Run them in this order, **per distinct production database**, one step at a time:

| Step | Script | Writes? | Purpose |
|---|---|---|---|
| 1a | `01a_readonly_state_check.sql` | no | Database identity, tracked vs untracked, whether the 5 released migrations' tables/columns exist, username columns absent, no name clashes. Verdict `READY` or `STOP`. |
| 1b | `01b_readonly_migration_history.sql` | no | Only if tracked: the recorded migrations and any failed/unfinished one. |
| 2 | *(backup)* | — | Dashboard → Database → Backups: a restorable backup/PITR point taken now, or a `pg_dump`. |
| 3a | `02_baseline_untracked_only.sql` | yes | **Only if untracked.** Creates `_prisma_migrations` and records the five released migrations. |
| 3b | `03_apply_username_migrations.sql` | yes | Guard + username migrations (columns, unique index, CHECK) **and** their Prisma records, in one transaction. Refuses to run if preconditions fail. |
| 4 | `04_verify_read_only.sql` | no | PASS/FAIL per column, index, constraint and migration record (checksums compared with the files in this PR). Verdict `ALL PASS`. |

If a script errors, nothing from it is kept (it is one transaction); run `ROLLBACK;` once in the editor to be
safe, then re-run `01a`/`04` and report the output. Never run `03` twice or edit the SQL: it checks for this.
After step 4, confirm the **currently deployed** site still signs in, and only then merge the PR.

## Steps (command-line alternative)

Run every command below in `vela/` on your own machine, with the connection strings set as
**environment variables in your own terminal**. Never paste them into chat, tickets, or commits.
Prisma needs two variables because `schema.postgresql.prisma` declares `directUrl`:
`DATABASE_URL` and `DIRECT_URL` (for migrations both should be the **direct / session** connection on
port 5432, not the pooler on 6543).

### 1. Identify the database behind each Netlify site

Each site has its own environment variables, so do not assume the two sites share a database. In
Netlify → *Site configuration → Environment variables*, read `DATABASE_URL` and `DIRECT_URL` for
**each** site (note the *Production* context value specifically). Compare the host and database name
(for Supabase, the project ref in `db.<ref>.supabase.co` or `postgres.<ref>@…pooler.supabase.com`).
Write down: site → project/database. Every distinct database needs the remaining steps.
Then confirm each with the inspector, which prints host/database/server but never the password:

```bash
npm ci
DATABASE_URL='<direct url for that database>' node scripts/verify-migration-state.mjs pre
```

### 2. Confirm a recoverable backup (per database)

Supabase dashboard → *Database → Backups*: a daily backup from today, or point-in-time recovery enabled,
**or** take a manual dump: `pg_dump "$DIRECT_URL" --format=custom --file=vela-before-username.dump`.
Note the time and the `User` row count that `verify-migration-state.mjs pre` printed.

### 3. Apply the migrations (per database)

`verify-migration-state.mjs pre` prints which of these applies and the exact commands.

- **Tracked database** (`_prisma_migrations` lists the five earlier migrations): 
  `DATABASE_PROVIDER=postgresql npm run db:migrate:deploy`
  applies only the two new migrations. (`migrate status` will list both as pending first: the guard is
  older than migrations that are already recorded, and `deploy` still applies it.)
- **Untracked database** (no `_prisma_migrations`, e.g. built with `db push`; `migrate deploy` stops with
  **P3005** and `migrate status` misleadingly lists *all seven* as pending): baseline the five released
  migrations, then deploy. Only baseline migrations whose changes the schema really contains (`pre`
  checks this and refuses otherwise):
  ```bash
  export DATABASE_PROVIDER=postgresql
  for m in 20261015000000_init_postgresql 20261015010000_transaction_approvals \
           20261015020000_external_account_verification 20261015030000_enrollment_approval \
           20261015040000_totp_mfa; do node scripts/prisma.mjs migrate resolve --applied $m; done
  npm run db:migrate:deploy
  ```
- Applying the SQL by hand in the Supabase SQL editor also works (run the guard first, then the username
  migration, each as one run), but you must then record them with `migrate resolve --applied <name>`
  (after baselining as above if the database is untracked).

### 4. Verify (per database)

```bash
DATABASE_URL='<direct url>' node scripts/verify-migration-state.mjs post
```

It checks, read-only: both columns exist and are nullable; `User_usernameNormalized_key` is a unique
index; `User_username_consistent_check` exists and is validated; `ExternalAccount` has exactly one FK;
all seven migrations are recorded as applied with none failed; no user has an inconsistent pair; every
table/column matches `schema.postgresql.prisma`. Exit code 0 means all passed. Also confirm that the
**currently deployed (old) release still signs in** on every site, with an existing email and password.

### 5. Merge, then smoke test

Only when step 4 passed for every database: merge the PR and let Netlify deploy. Smoke test: sign in with
an existing email, confirm the dashboard shows the "Choose a Username / User ID" prompt, set one in
Settings, sign out, sign in with it (any letter case), and open the MFA screen to check the masked
phone/email and the three method options.

## Rollback

Prefer rolling the **application** back (Netlify → previous deploy). The old release ignores the new
columns, so the migration can stay. To remove the columns as well (this deletes chosen usernames),
run `prisma/rollback/20261016000000_username_login.down.sql`, then
`prisma migrate resolve --rolled-back 20261016000000_username_login`.

## What has and has not been verified

- **Real PostgreSQL 18.4 + Prisma 6.19.3 `migrate` (schema engine), run locally** (see caveats): fresh
  `migrate deploy` of all seven migrations; a *tracked* database whose history already lists the five
  earlier migrations (with users and an `ExternalAccount` row) — `migrate status` lists the guard and the
  username migration as pending, `migrate deploy` applies both out of timestamp order without error, the
  guard is a no-op, no row changes, `migrate status` then reports up to date; an *untracked* database —
  `migrate deploy` gives P3005, the baseline-then-deploy procedure above succeeds; re-running is a no-op.
  `verify-migration-state.mjs` was run against all of those and fails on a database that lacks the changes.
- `docs/supabase/*.sql` (`tests/supabase-sql.test.ts` on PGlite, plus real PostgreSQL 18.4 with Prisma `migrate status`/`deploy` afterwards): tracked and untracked databases, preconditions refuse, re-run refuses, a mid-script failure rolls back everything, `01a` reports STOP for a missing released column.
- PGlite tests (`tests/postgres-migrations.test.ts`): replay, drift against `schema.postgresql.prisma`,
  old release against the migrated schema, collisions, rollback SQL.
- **Caveats:** the sandbox cannot download Prisma's native engines, so the lab ran Prisma's bundled WASM
  schema engine through `@prisma/adapter-pg`, patched to run each migration script whole (as the native
  engine does) and to accept the `name` column type. `migrate resolve --rolled-back` could not run there; the
  rollback SQL itself was run and the record was updated by hand. Production runs Supabase's PostgreSQL, not 18.4.
- **Not verified:** any real production Supabase database (not reachable from the build environment).

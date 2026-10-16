# First Meridian — retail-banking product preview

A fictional, full-stack retail-banking prototype for internal product evaluation. It uses a traditional navy, white and red visual system with an app-style mobile layout, but keeps First Meridian branding distinct. No real bank accounts are opened, no real funds are held or moved, and the product is not FDIC insured.

> **Important:** First Meridian is not a bank, money transmitter or payment service. Internal transfers, Quick Pay, bill-pay scheduling, deposits and withdrawals only update the product's test ledger. Stripe is restricted to test keys. Plaid linking is optional and does not initiate a payment. A live launch requires an approved bank/BaaS partner, provider approvals, compliance, reconciliation and security review.

## Demo access

| Field | Value |
|---|---|
| Email | `demo@vela.app` |
| Password | `demo1234` |
| Quick Pay test recipient | `marcus@example.com` / `demo1234` |

The sample users predate Username / User IDs, so they sign in with their email (the sign-in field accepts either). They can choose a username under **Settings → Sign-in & passcode**.

## Features

- **Username / User ID** — enrollment requires a unique Username / User ID (3–32 letters, numbers, `.`, `_`, `-`; no `@`), validated on the server and unique case-insensitively. It is a login identifier stored separately from the internal database `User.id`, and is the primary sign-in field. Email sign-in keeps working. Existing users are never given a generated username or locked out: they keep signing in with email, see a prompt, and choose a username themselves in Settings (it can be set once there).
- **Password visibility** — every password field (sign-in, enrollment, passcode change) is hidden by default and has a keyboard-accessible **Show password / Hide password** button that never submits the form or clears the value.
- **Personalized MFA method screen** — the method-choice screen shows the signed-in challenge user's own registered destinations, masked on the server: `Phone ending in 1234` and `j•••@example.com`. They come from the user record tied to the signed MFA challenge cookie (never a URL parameter or client-supplied ID), and only masked values reach the page. A missing or too-short (< 8 digits) phone shows “No phone number registered”. Text message, Email code and Approve in First Meridian app are selectable, but each one shows the selected method and masked destination while clearly stating that this demo does not send a text, email or app approval request. Every choice still opens the same six-digit Authenticator form; a **Back to verification methods** button returns to the list. Selecting is client-side only and never signs anyone in — only the server-side authenticator check (signed challenge, lockout, replay protection) does. Registered does not mean verified: contacts are not marked verified.
- **Authentication** — new enrollments wait for admin approval before sign-in; an administrator chooses per applicant whether to provision the sample Jan 2023–Oct 2026 account history or leave new accounts at their current balances (normally $0 until separately approved funding). After approval, each user must set up one Google Authenticator-compatible TOTP app. TOTP secrets are encrypted, codes cannot be replayed, and no email/SMS login codes are used.
- **Admin customer payments** — admins can record a payment from a named individual or organization to one customer account or to every approved customer’s active checking account. Each batch has a selectable activity date and still requires separate approval before balances change.
- **Accounts** — demo checking and savings accounts, masked account identifiers, interest-rate display, balance history and transaction detail.
- **Move money** — internal transfers and member-to-member Quick Pay use review/confirm steps and an atomic, balance-checked ledger. Members can also request money from one another; the recipient explicitly confirms payment from their own account.
- **Mobile check deposit preview** — capture or select front/back sample images, review the amount and record a simulated credit. Images are not uploaded or stored, and no real check is processed.
- **Bill Pay** — save billers, encrypt their account references at rest, select funding account/date/frequency, review and schedule. The preview records a pending instruction locally; it does **not** deliver money to a real biller or automatically run future recurring cycles.
- **Stripe ACH test checkout** — optional Stripe Checkout for US bank-account test payments. A signed webhook posts a deposit only on `payment_intent.succeeded`; event IDs and funding intents are idempotent. Live Stripe keys are intentionally rejected.
- **Plaid Link** — optional Plaid Sandbox account identification. Access tokens are encrypted with AES-256-GCM; only masked account details are shown. Plaid linking here does not authorize or move money.
- **Transactions and statements** — searchable account activity, categories, monthly demo statements and print styling.
- **Cards and settings** — virtual-card display and controls, profile and password changes.
- **Mobile banking UI** — responsive First Meridian account home, large touch-friendly actions, compact account rows and a persistent bottom app dock. The presentation is original First Meridian work, not a replica using another bank's logo, assets or exact screen artwork.

## Stack

| Layer | Choice |
|---|---|
| App | Next.js 15 App Router, React 19, TypeScript, Server Actions |
| UI | Tailwind CSS, lucide-react, hand-built SVG charts |
| Database | Prisma; local SQLite by default, with a Supabase PostgreSQL schema and versioned migrations for deployment |
| Auth | bcryptjs + jose + encrypted Google Authenticator-compatible TOTP |
| Payments | Stripe Node SDK (test-mode Checkout + signed webhooks) |
| Bank linking | Plaid Node SDK + `react-plaid-link` |
| Validation | zod |
| E2E | Playwright (`e2e/test.mjs`) |

## Local setup

```bash
cp .env.example .env
# Set AUTH_SECRET to a long random value.
npm install
npm run db:setup
npm run dev
```

Open `http://localhost:3000` and sign in using the credentials above. `db:setup` creates the local schema and adds sample users only if the reserved seed users do not already exist. A deliberate local reset is `npm run db:seed -- --reset`; it deletes only the reserved sample users (`demo@vela.app` and `marcus@example.com`), never arbitrary user rows. Demo seeding is disabled in production by default.

## Supabase PostgreSQL (multi-user deployment)

This repository keeps a local SQLite schema for the workspace preview and includes a matching PostgreSQL schema plus versioned migrations for Supabase. The migrations cover the base schema, transaction approvals, external-account verification, admin approval of new enrollments, encrypted authenticator setup, and a repair guard for fresh databases (`20261015015000_ensure_external_account_table`), and the Username / User ID login identifier (`20261016000000_username_login`: nullable `username` + `usernameNormalized` with a unique index and a CHECK keeping them consistent; existing rows are left as-is). Existing users remain approved; new signups wait for admin review and cannot sign in until approved. User records are scoped through `userId` relationships, and account, transaction and payee lookups have supporting indexes. The app uses its existing server-side authentication; it does not depend on Supabase Auth or expose database credentials in the browser.

1. Create a Supabase project and copy its connection strings from the project's **Connect** panel. Prefer a dedicated database role for Prisma rather than the dashboard's owner credential.
2. In the deployment's **build and runtime** secret settings, set `DATABASE_PROVIDER=postgresql` and add `DATABASE_URL` and `DIRECT_URL`. Use Supavisor transaction mode for app requests in serverless/auto-scaling hosts (port `6543`; include `pgbouncer=true`, and `connection_limit=1` where appropriate). Use Supavisor session mode (port `5432`) or a supported direct connection for `DIRECT_URL` and migrations. Keep both passwords out of source control.
3. Apply all checked-in migrations and build the PostgreSQL Prisma client:

   ```bash
   npm run db:migrate:deploy
   npm run build
   npm start
   ```

4. Do **not** run the sample seed against a production database. New customers register through the app. The included migration creates empty tables; it does not copy existing SQLite rows.

The active preview remains on SQLite until a Supabase project and connection secrets are supplied through the deployment environment. See the [Supabase Prisma guide](https://supabase.com/docs/guides/database/prisma) for current connection-string and role guidance.

> **Upgrading an existing PostgreSQL deployment to Username / User ID login?** Apply the migration *before* deploying the app. See [docs/deploy-username-login.md](docs/deploy-username-login.md).

## Netlify hosting with GitHub and Supabase

This is a full-stack Next.js app. GitHub stores the source code; Netlify runs the site, server actions and API routes; Supabase provides PostgreSQL. Do not deploy it as a static-only site because login, admin approvals and server actions need a server runtime. The checked-in `netlify.toml` sets the Next.js build and PostgreSQL Prisma provider.

1. Push this project to a GitHub repository and connect that repository in Netlify.
2. In Netlify's build/runtime environment settings, add `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, and `APP_ENCRYPTION_KEY`. Use the Supabase connection guidance above. Keep secrets out of GitHub and do not use `NEXT_PUBLIC_` for server secrets.
3. From a secure terminal or one-time migration job configured with `DATABASE_PROVIDER=postgresql` and the same Supabase URLs, run `npm run db:migrate:deploy`. Do not seed the production database.
4. Deploy on Netlify. Leave `PREVIEW_DEMO_MODE` unset (or `0`) in production; the cookie-less sample identity is preview-only.

The current workspace has no linked GitHub, Netlify, or Supabase account, so this setup is prepared in code but has not been pushed or deployed. Netlify's [Next.js support](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/) handles server-rendered routes and API functionality; avoid `output: "export"`.

## Optional provider sandboxes

### Stripe ACH test checkout

1. Add a Stripe **test** secret key (`sk_test_...`) to `STRIPE_SECRET_KEY`.
2. Set `APP_BASE_URL` to the app's public URL.
3. Start signed webhook forwarding, for example:

   ```bash
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   ```

4. Copy the CLI webhook secret (`whsec_...`) to `STRIPE_WEBHOOK_SECRET` and restart the app.
5. Visit Transfers → Deposits. The ACH test checkout appears when both values are configured.

The app deliberately rejects `sk_live_...`. Checkout completion alone does not credit the demo ledger; only a verified Stripe `payment_intent.succeeded` webhook does. Set up ACH/US bank account payments in the Stripe test dashboard for the test account.

### Plaid Sandbox Link

1. Create Plaid Sandbox credentials in the Plaid dashboard.
2. Set `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV=sandbox`.
3. Generate a separate 32-byte encryption key and add it as base64 to `APP_ENCRYPTION_KEY`:

   ```bash
   openssl rand -base64 32
   ```

4. Restart and visit More → Linked accounts. Plaid Link uses test institution credentials, not the customer's real bank login.

Never put a secret key in `NEXT_PUBLIC_*`, source code, form fields or browser storage. Configure production credentials only through a secret manager after a formal security and compliance review.

## Unit and integration tests

```bash
npm test
```

Vitest covers username validation and case-insensitive uniqueness (SQLite data layer and the PostgreSQL migration, replayed in-process with PGlite), existing-user sign-in compatibility, enrollment approval/history choices, single and all-customer admin payments with activity dates and sender labels, generic login errors, the password show/hide toggle (jsdom), and the MFA method screen — each user sees only their own masked phone/email and no full contact value appears in the rendered page or its props. Tests use disposable databases and never touch `prisma/dev.db` data.

## E2E tests

After building the app (do not rebuild while a Next server is using the same `.next` directory):

```bash
npm run build
npm run e2e
```

The runner creates a disposable SQLite database and a separate test server, then removes the database afterward. The suite exercises login and protected navigation, pending enrollment and admin approval, user-data isolation, review/confirm transfers, Quick Pay, request-and-pay flows, simulated external-account challenges, deposits, mobile check-deposit preview, bill-pay scheduling, account activity, card controls, statements, profile changes and both mobile menus. It does not mutate the workspace database or call live payment networks.

## Data and money safety

- Amounts are stored as integer cents.
- Internal account transfers and Quick Pay write paired transaction records in a DB transaction and re-check available funds.
- Simulated bill-pay debits are marked pending and include a confirmation reference.
- Stripe funding intents are created before Checkout and reconciled via a signature-verified, idempotent webhook. The database credit is not based on a browser redirect.
- Plaid access tokens and biller account references use AES-256-GCM encryption at rest. In development only, the app can derive a fallback key from `AUTH_SECRET`; production must set a dedicated `APP_ENCRYPTION_KEY`.
- Local SQLite can store multiple user records, but it is a workspace-local file, not a shared or managed production database. Use the Supabase PostgreSQL configuration for persistent multi-user hosting; this prototype is still not authorized for real money movement.

## Not production-ready

This prototype does not provide card issuing, ACH payouts, biller delivery, any third-party P2P network, KYC/AML, dispute handling, fraud monitoring, a regulated ledger, safeguarding, reconciliation or customer support operations. Live consumer banking requires a licensed bank/BaaS relationship and provider-specific authorization. The code intentionally does not present the demo ledger as a real deposit account.

## Long account history (2023-2026)

The generated sample history spans Jan 3, 2023 – Oct 15, 2026: a $950,000.00 opening deposit, $450,000.00 in later credits, and $1,054,717.25 in debits, ending at $345,282.75 per user ($245,282.75 Everyday Checking + $100,000.00 High-Yield Savings). Recurring bills post on fixed days each month (mortgage 1st, ComEd 15th, People Gas 18th, phone 20th, Xfinity 22nd, water 25th, savings sweep 28th); internal checking↔savings transfers net to zero. The generator is `src/lib/history.ts`; the demo seed uses it. For new enrollments, the admin explicitly chooses during approval whether to provision this history (`ensureUserHistory` never overwrites existing completed activity). If the admin opts out, the customer keeps the new account's current balance (normally $0 until separately approved funding). The separate backfill command still targets every selected user and replaces their transaction history when run with `--apply`. To preview or apply it for all existing users in a database:

```bash
npm run db:backfill-history          # dry run, writes nothing
npm run db:backfill-history:apply    # replaces each user's transaction history
```

## Netlify deployment checklist (prepared, not yet deployed)

The code is Netlify-ready: `netlify.toml` builds with the Next.js plugin on Node 22,
and `src/lib/db.ts` automatically uses the real Prisma/PostgreSQL client when
`DATABASE_PROVIDER=postgresql` (Supabase) and the local SQLite layer otherwise.

1. **Supabase**: create a project, then from a terminal with the project's
   `DATABASE_URL` (transaction pooler, port 6543, `?pgbouncer=true&connection_limit=1`)
   and `DIRECT_URL` (session pooler/direct, port 5432) run:
   ```bash
   DATABASE_PROVIDER=postgresql npm run db:migrate:deploy
   ```
2. **Netlify**: import this GitHub repo as a new site (base directory `vela` if the
   repo root is connected, so `netlify.toml` is picked up), and set environment
   variables (never commit them):
   - `DATABASE_URL` and `DIRECT_URL` (from Supabase, above)
   - `DATABASE_PROVIDER=postgresql` (already set in `netlify.toml`)
   - `AUTH_SECRET` (long random string) and `APP_ENCRYPTION_KEY` (separate random string)
   - Do **not** set `PREVIEW_DEMO_MODE` in production.
3. Deploy. New users sign up and wait for admin approval. The administrator decides per enrollment whether to provision the generated 2023–2026 history; users then set up Google Authenticator. To backfill any existing Postgres users instead: `DATABASE_PROVIDER=postgresql npm run db:backfill-history:apply`.
4. Optional demo accounts on the hosted copy only:
   `ALLOW_DEMO_SEED=true npm run db:seed -- --reset` (creates demo@vela.app / demo1234).

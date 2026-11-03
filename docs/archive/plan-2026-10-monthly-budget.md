# Plan: Personal budgeting web app ("Budgeting")

> **Status (October 2026):** milestones 1–10 are implemented. The items under "Later" are not built yet.

## Context
You want your own budgeting software, to use yourself and to share with a few friends. The repo (`mibrahim930/budgeting`, branch `claude/vibrant-galileo-bo0ndu`) is empty, so this is a new project.

A Sonnet research agent surveyed budgeting methods, open-source apps, bank-data APIs, stacks, money data modeling and security. Its main finding was that self-hosting Actual Budget is the fastest route to a working budget. You chose to build your own instead. So this app borrows Actual's proven budgeting rules and adds real per-friend accounts.

Your requirements:
- Banks are in the US.
- Transactions arrive by automatic bank sync.
- It is a web app that works on a phone (PWA).
- Each friend has a separate, private account.
- Budgeting supports envelope/zero-based and simple per-category limits.
- It costs under $5/mo and is hosted on Fly.io.

## Decisions (from research + your answers)
| Area | Choice | Why |
|---|---|---|
| Framework | **SvelteKit + TypeScript** (`@sveltejs/adapter-node`) | One language end to end and a light runtime. Better Auth has first-party Svelte support. |
| DB | **SQLite** via `better-sqlite3` + **Drizzle ORM** | One file and no DB server, which is plenty for fewer than 10 users. |
| Backups | **Litestream → Cloudflare R2** (free tier) | Continuous replication. Restores are tested. |
| Auth | **Better Auth** (email+password, passkey plugin), **invite-only signup** | Lucia is deprecated and Auth.js is in maintenance mode. Pin the version. |
| Bank sync | **SimpleFIN Bridge** ($15/yr, **each user brings their own token**), behind a `BankProvider` interface | Cheapest US option, with no developer approval and no shared item cap. Plaid's free Trial (10 Items total) can be added later as a second provider. |
| Fallback import | CSV/OFX upload | Covers banks SimpleFIN doesn't support. Also used to backfill history. |
| UI | Tailwind CSS, mobile-first, PWA manifest + service worker (offline read-only) | Installs to the home screen without app stores. |
| Hosting | **Fly.io**: one always-on shared-cpu-1x 256MB machine + 1GB volume, about $2–3/mo | Public HTTPS URL for friends. The volume holds SQLite. |
| Tests | Vitest (unit/integration), Playwright (e2e, Chromium is pre-installed) | |

## Budgeting model
Each user picks one of two modes in their settings:
- **Envelope mode (default).** This follows Actual's rules.
  - Income goes into a "To Budget" pool. You assign dollars to categories each month.
  - `available = prev_available + budgeted + activity`, so leftover money rolls over.
  - Overspending in a category is taken from next month's To Budget.
- **Limits mode.** Each category gets a monthly target, compared with spending. There is no rollover and no To Budget pool. This is the "category spending limits" style.

Both modes use the same `budget_allocation` table. Only the calculation and the UI differ.

## Data model (`src/lib/server/db/schema.ts`)
General rules:
- Money is always an **integer number of cents** (`amount_minor`), never a float.
- Every domain table has `user_id`.
- Categories and accounts are soft-deleted with `archived_at`.

Tables:
- Better Auth tables: `user`, `session`, `account`, `verification`, `passkey`. Plus `invite (code, created_by, used_by, expires_at)`.
- `bank_connection (id, user_id, provider, access_secret_enc, last_synced_at, status, error)`. The SimpleFIN Access URL is stored encrypted with AES-256-GCM, using a key from the env secret `DATA_ENCRYPTION_KEY`.
- `fin_account (id, user_id, connection_id?, external_id?, name, type [checking|savings|credit|cash|loan|investment], on_budget, currency, archived_at)`
- `balance_snapshot (account_id, as_of, balance_minor)` stores the provider's balance from each sync. It is used for reconciliation and, later, net worth.
- `category_group`, `category (id, user_id, group_id, name, sort, is_income, archived_at)`
- `payee (id, user_id, name, normalized_name)`
- `txn` columns:
  - `id, user_id, account_id, date, amount_minor, payee_id, category_id?, memo`
  - `cleared, reconciled, pending`
  - `parent_id?`, used for split children
  - `transfer_id?`, linking the two legs of a transfer
  - `source [manual|csv|ofx|simplefin], external_id?, import_hash, import_batch_id?`
  - `created_at, updated_at`
- `budget_allocation (user_id, category_id, month 'YYYY-MM', budgeted_minor)`, unique on `(user_id, category_id, month)`
- `rule (id, user_id, match_field, match_op, match_value, set_category_id?, set_payee_id?, priority)`
- `import_batch (id, user_id, source, created_at, counts)` makes it possible to undo an import.

Activity and available amounts are **calculated from transactions, never stored**. That avoids drift.

## Project layout
```
src/lib/server/
  db/ (schema.ts, client.ts, migrations/)
  auth.ts                       Better Auth config (invite gate, passkeys)
  repo/                         ALL data access; every query is scoped by userId
  money.ts                      cents parse/format helpers
  crypto.ts                     encrypt/decrypt secrets
  budget/engine.ts              envelope + limits month calculations (pure functions)
  import/ (csv.ts, ofx.ts, dedupe.ts)
  sync/ (provider.ts interface, simplefin.ts, scheduler.ts)
  rules/apply.ts
src/routes/  (login, signup?invite=, budget/[month], accounts/[id], transactions, import, settings, admin/invites)
static/manifest.webmanifest, src/service-worker.ts
Dockerfile, fly.toml, litestream.yml, scripts/start.sh (litestream restore → migrate → litestream replicate -exec node build)
```

## Milestones (each is one or more commits pushed to `claude/vibrant-galileo-bo0ndu`)
1. **Scaffold.** Set up SvelteKit + TS, Tailwind, Drizzle + SQLite, Vitest, Playwright, ESLint/Prettier, and a CI workflow (`.github/workflows/ci.yml`: lint, typecheck, test).
2. **Auth.**
   - Better Auth with email+password and passkeys.
   - Invite-only signup: the first user becomes admin, and the admin page generates invite links.
   - A `hooks.server.ts` guard on all non-auth routes.
3. **Core ledger.**
   - Accounts CRUD.
   - Manual transaction entry and an editable transaction list.
   - Transfers (paired legs).
   - Splits, where the children must sum to the parent and this is enforced in the repo layer.
   - `money.ts` with tests.
4. **Categories + budget screen.**
   - Category groups and categories, with a default category set seeded on signup.
   - Month view with budgeted / activity / available per category.
   - To Budget header and month navigation.
   - Mode toggle (envelope or limits).
   - `budget/engine.ts` with thorough unit tests: rollover, overspend, income, future months.
5. **Import.**
   - CSV upload with a column-mapping step saved per account, plus OFX/QFX parsing.
   - Dedupe:
     1. Match on `external_id` first.
     2. Then on `import_hash` = hash(account, date, amount, normalized description, occurrence index).
     3. Then fuzzy match (±3 days, same amount, similar payee) against manual entries.
   - Undo an import batch.
6. **SimpleFIN sync.**
   - Settings page where the user pastes their setup token. The app claims the Access URL and stores it encrypted.
   - The user maps SimpleFIN accounts to app accounts.
   - Sync pulls transactions (posted only, or pending updated by ID) and records a balance snapshot.
   - An in-process scheduler (every 6h) plus a "Sync now" button. Errors are shown on the connection.
7. **Rules.** Payee normalization and "if description contains X → category Y" rules, applied on import and sync. Offer "create rule from this transaction".
8. **Reconciliation + reports.** Reconcile an account against a statement balance (cleared sum vs entered balance) and show drift against the provider balance. Reports: spending by category per month, and income vs expense (simple SVG/Chart.js).
9. **PWA + polish.** Manifest, icons, a service worker caching the shell and the last-viewed budget for offline reading, and a responsive pass at phone width.
10. **Deploy.**
    - Dockerfile and `fly.toml` with a volume mounted at `/data`.
    - Litestream to R2.
    - Secrets: `BETTER_AUTH_SECRET`, `DATA_ENCRYPTION_KEY`, R2 credentials.
    - A documented restore drill in `README.md`, and a one-page privacy note for friends covering what's stored, who can see it, and how to delete it.

**Later (not in MVP):** recurring transactions/schedules, goals, net worth chart, Plaid Trial provider, optional LLM categorization (only for transactions the rules don't categorize, cached per merchant, with consent), shared household budgets.

## Security essentials
- No bank credentials are ever stored. Only SimpleFIN Access URLs are kept, and they are encrypted at the application level.
- A single `repo/` layer forces `userId` scoping. Tests attempt cross-user reads and must fail them.
- Secure httpOnly cookies, SvelteKit CSRF origin check and rate-limited login.
- Logs never contain amounts, payees or access URLs.
- Backups are encrypted at the bucket level, and the R2 credential is used only for backups.

## Verification
- `npm run check && npm run lint && npm test` must pass on every milestone. CI runs the same checks.
- **Unit tests:**
  - `money.ts`
  - `budget/engine.ts`: table-driven cases for rollover, overspend and limits mode
  - `import/dedupe.ts`: re-importing the same CSV adds 0 rows, and overlapping files dedupe
  - `crypto.ts` round-trip
  - The repo layer's user isolation
- **SimpleFIN:** an integration test against a mocked SimpleFIN `/accounts` JSON fixture. Then a manual test with your real SimpleFIN token.
- **Playwright e2e scenario:**
  1. Sign up via invite and create an account.
  2. Import a sample CSV and assign money to categories.
  3. Overspend a category and confirm the next month's To Budget is reduced.
  4. A second user cannot see the first user's data.
- **Deploy:** `fly deploy`, sign in from a phone, and install the PWA. Then destroy and recreate the machine and confirm Litestream restores the data.
- **Cost check:** Fly invoice about $2–3/mo plus SimpleFIN $1.25/mo, under $5.

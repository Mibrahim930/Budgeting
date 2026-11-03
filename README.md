# Budgeting

A small, self-hosted paycheck planner for me and a few friends: before each payday, decide where every dollar of it will go, then tick things off as the money actually moves.

**What it does**

- **Plan each paycheck.** Enter the amount and date, then split it into savings, debt payments, bills and spending money. "Left to allocate" shows what still needs a job, and any leftover becomes spending money in one click.
- **Bills with due dates.** Recurring bills (monthly, every few weeks, yearly or one-off) land in the plan for the paycheck that comes before them, so you see what is due before the next payday.
- **Tick to confirm.** Every line starts as planned. Ticking it records the real transaction or transfer, and unticking removes it again.
- **Projected balances.** See what each account will hold once the plan is carried out, next to what it holds now.
- A pay schedule (weekly, every 2 weeks, twice a month or monthly) that predicts the next payday, and a short set-up wizard for new users.
- Accounts, transactions, transfers and split transactions.
- Bank sync through [SimpleFIN Bridge](https://bridge.simplefin.org), about $15/year per person.
- CSV/OFX/QFX import, with automatic duplicate detection.
- Rules that categorize transactions automatically, and reconciliation against bank statements.
- Reports (including where each paycheck went), plus an installable phone app (PWA) that can show your plans offline.
- Invite-only accounts, with passwords or passkeys. Each person sees only their own data.

**Stack:** SvelteKit, TypeScript, SQLite (Drizzle ORM), Better Auth and Tailwind. It runs on Railway, or on Fly.io with Litestream backing the database up to Cloudflare R2.

**Docs:** [docs/research.md](docs/research.md) covers the research behind these choices, and [docs/plan.md](docs/plan.md) is the plan.

## Development

```sh
git clone https://github.com/Mibrahim930/Budgeting.git && cd Budgeting
npm install
npm run setup                   # writes .env with fresh secrets and creates ./data
npm run dev                     # http://localhost:5173 — the first sign-up becomes the admin
```

| Command               | What it does                                                                    |
| --------------------- | ------------------------------------------------------------------------------- |
| `npm run setup`       | Create `.env` with generated secrets (never overwrites an existing one)         |
| `npm run check`       | Type-check                                                                      |
| `npm run lint`        | Prettier + ESLint (`npm run format` fixes formatting)                           |
| `npm test`            | Unit/integration tests (Vitest, in-memory SQLite)                               |
| `npm run test:e2e`    | Browser tests (Playwright). Set `PW_CHROMIUM_PATH` to use an installed Chromium |
| `npm run db:generate` | Create a migration after editing `src/lib/server/db/schema.ts`                  |

Migrations run automatically when the app opens the database.

### Where things live

```
src/lib/money.ts                    cents parsing/formatting (money is always integer cents)
src/lib/month.ts                    date helpers (dates are 'YYYY-MM-DD' strings)
src/lib/planner/                    pure paycheck-planner logic: bill due dates, next payday, plan totals
src/lib/import/                     CSV + OFX parsers (shared by browser preview and server)
src/lib/components/                 shared UI, including the paycheck plan, picker and projections
src/lib/server/db/schema.ts         all tables
src/lib/server/repo/                data access — every query is scoped by user id
  paychecks.ts                      paycheck plans and their lines; tick/untick
  bills.ts                          recurring bills and the occurrences due in a window
  pay-schedule.ts                   each user's pay schedule
  reports.ts                        reports, including where each paycheck went
  backup.ts                         copy of the whole database for the admin's "Download a backup"
src/lib/server/onboarding.ts        the set-up wizard (first accounts and pay schedule)
src/lib/server/paycheck-actions.ts  form actions shared by the home page and plan pages
src/lib/server/import/              importer with dedupe, payee clean-up
src/lib/server/rules/               categorization rules
src/lib/server/sync/                SimpleFIN client, sync, background scheduler
src/routes/(app)/                   signed-in pages (home `/` is the paycheck planner)
scripts/setup.mjs                   `npm run setup`: writes .env with generated secrets
```

## Deploying

Bank sync is optional: the app works on balances you type in, and SimpleFIN can be added later without code changes. There are two ways to host it, both with step-by-step runbooks in [docs/go-live.md](docs/go-live.md):

- **[Path A — Railway](docs/go-live.md#path-a--railway-no-bank-sync-no-extra-accounts)** (about $5/month after a free trial): set up entirely in the browser, with no other accounts. Backups are files the admin downloads from **Invites → Download a backup now**. `railway.json` holds the service settings.
- **[Path B — Fly.io with Cloudflare R2 backups](docs/go-live.md#path-b--flyio-with-cloudflare-r2-backups)** (about $2–3/month): needs the `fly` CLI and a Cloudflare account, and Litestream backs every change up continuously. The next section is the short version of path B.

## Deploying to Fly.io (about $2–3/month)

You need a [Fly.io](https://fly.io) account and the `fly` CLI. For backups you also need a free Cloudflare R2 bucket (or Backblaze B2 / S3).

1. **Create the app.** `fly.toml` is already named `paycheck-planner` (change all three occurrences if you pick another name), then run:

   ```sh
   fly apps create paycheck-planner
   fly volumes create budget_data --size 1 --region iad --app paycheck-planner
   ```

   The step-by-step version of this whole section, including the account sign-ups, is in [docs/go-live.md](docs/go-live.md).

2. **Set the secrets.** Generate each value with `openssl rand -base64 32`:

   ```sh
   fly secrets set BETTER_AUTH_SECRET=... DATA_ENCRYPTION_KEY=...
   ```

   `DATA_ENCRYPTION_KEY` encrypts the stored SimpleFIN links. **Keep a copy somewhere safe** (a password manager). Without it, bank connections must be set up again.

3. **Set up backups.** These are optional but strongly recommended.
   1. In Cloudflare, create an R2 bucket (for example `budget-backups`).
   2. Create an R2 API token with read and write access to that bucket only.
   3. Set the backup secrets:

      ```sh
      fly secrets set LITESTREAM_BUCKET=budget-backups \
        LITESTREAM_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com \
        LITESTREAM_ACCESS_KEY_ID=... LITESTREAM_SECRET_ACCESS_KEY=...
      ```

   Litestream streams every change to the bucket. R2 encrypts data at rest, and 30 days of history are kept.

4. **Deploy.** Run:

   ```sh
   fly deploy
   fly scale count 1      # SQLite needs exactly one machine
   ```

5. **Create your account.** Open `https://<your-app-name>.fly.dev` and sign up; the first account becomes the admin.
6. **Invite friends.** Go to **Invites** → **New invite link**. Each link works once and expires after 7 days.

### Bank sync for each person

Each user signs up at SimpleFIN Bridge themselves, connects their banks there, and creates a setup token. They then paste the token into **Settings → Bank sync** and choose which accounts to link. After that, the app syncs every 6 hours, and the **Sync now** button syncs on demand.

### Restore drill

Rehearse this once after deploying, so you know backups work:

```sh
fly ssh console -C "litestream generations -config /etc/litestream.yml /data/budget.db"  # backups exist
fly machine destroy <machine-id> --force && fly volumes destroy <volume-id>             # simulate disaster
fly volumes create budget_data --size 1 --region iad && fly deploy                       # fresh machine
```

On start, `scripts/start.sh` sees the empty volume and restores it from R2 before launching the app. Sign in afterwards and check that your data is there.

To get a copy on your own computer, install [Litestream](https://litestream.io/install/), export the same `LITESTREAM_*` variables, and run:

```sh
DATABASE_PATH=./restored.db litestream restore -config litestream.yml ./restored.db
```

### Costs

| Item                                                  | Monthly           |
| ----------------------------------------------------- | ----------------- |
| Fly.io shared-cpu-1x, 256 MB, always on + 1 GB volume | ~$2–3             |
| Cloudflare R2 (well under the 10 GB free tier)        | $0                |
| SimpleFIN Bridge                                      | ~$1.25 per person |

Check current prices before relying on them; they come from the research done in October 2026.

## Privacy

Friends can see what is stored (accounts, transactions, paycheck plans and bills) and who can see it at `/privacy`. Nobody else using the app can see another person's plans, bills or accounts. Each person can delete everything themselves under **Settings → Delete my account**.

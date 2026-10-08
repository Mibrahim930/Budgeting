# Budgeting

A small, self-hosted envelope budgeting web app for me and a few friends.

**What it does**

- Two budgeting styles, chosen per user in Settings:
  - **Envelope (zero-based):** give every dollar a job. Leftovers roll over, and overspending comes out of next month.
  - **Monthly limits:** a cap per category, with no rollover.
- Accounts, transactions, transfers and split transactions.
- Bank sync through [SimpleFIN Bridge](https://bridge.simplefin.org), about $15/year per person.
- CSV/OFX/QFX import, with automatic duplicate detection.
- Rules that categorize transactions automatically, and reconciliation against bank statements.
- Reports, plus an installable phone app (PWA) that can show your budget offline.
- Invite-only accounts, with passwords or passkeys. Each person sees only their own data.

**Stack:** SvelteKit, TypeScript, SQLite (Drizzle ORM), Better Auth and Tailwind. It runs on Fly.io, with Litestream backing the database up to Cloudflare R2.

**Docs:** [docs/research.md](docs/research.md) covers the research behind these choices, and [docs/plan.md](docs/plan.md) is the plan.

## Development

```sh
cp .env.example .env            # then fill in the two secrets (see the comments)
npm install
npm run dev                     # http://localhost:5173 — the first sign-up becomes the admin
```

| Command               | What it does                                                                    |
| --------------------- | ------------------------------------------------------------------------------- |
| `npm run check`       | Type-check                                                                      |
| `npm run lint`        | Prettier + ESLint (`npm run format` fixes formatting)                           |
| `npm test`            | Unit/integration tests (Vitest, in-memory SQLite)                               |
| `npm run test:e2e`    | Browser tests (Playwright). Set `PW_CHROMIUM_PATH` to use an installed Chromium |
| `npm run db:generate` | Create a migration after editing `src/lib/server/db/schema.ts`                  |

Migrations run automatically when the app opens the database.

### Where things live

```
src/lib/money.ts                 cents parsing/formatting (money is always integer cents)
src/lib/import/                  CSV + OFX parsers (shared by browser preview and server)
src/lib/server/db/schema.ts      all tables
src/lib/server/repo/             data access — every query is scoped by user id
src/lib/server/budget/engine.ts  envelope / limits math (pure functions)
src/lib/server/import/           importer with dedupe, payee clean-up
src/lib/server/rules/            categorization rules
src/lib/server/sync/             SimpleFIN client, sync, background scheduler
src/routes/(app)/                signed-in pages
```

## Deploying to Fly.io (about $2–3/month)

You need a [Fly.io](https://fly.io) account and the `fly` CLI. For backups you also need a free Cloudflare R2 bucket (or Backblaze B2 / S3).

1. **Name the app.** In `fly.toml`, replace every `budgeting-change-me` with a unique name, then run:

   ```sh
   fly apps create <your-app-name>
   fly volumes create budget_data --size 1 --region iad
   ```

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

Friends can see what is stored and who can see it at `/privacy`. They can delete everything themselves under **Settings → Delete my account**.

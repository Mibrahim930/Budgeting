# Go-live runbook

There are two ways to run the app. Bank sync is optional in both: balances can always be typed in by hand.

- **[Path A — Railway](#path-a--railway-no-bank-sync-no-extra-accounts)**: everything happens in the browser, no bank sync and no accounts beyond Railway itself. Backups are files you download from the app. Start here if you just want to use it.
- **[Path B — Fly.io with Cloudflare R2 backups](#path-b--flyio-with-cloudflare-r2-backups)**: a little cheaper, with continuous backups to Cloudflare R2, but needs the `fly` CLI and a Cloudflare account.

You can move from A to B later; download a backup first and restore it on the new host.

## Path A — Railway (no bank sync, no extra accounts)

Everything runs in the browser except generating two secrets in step 2, which you can do in any terminal. Budget about 30 minutes.

`railway.json` in the repo already tells Railway to build the `Dockerfile`, run exactly one copy (SQLite needs that) and check `/healthz`. Without Cloudflare settings the logs say "running WITHOUT backups"; that's expected here, because step 7 covers backups.

### 0. Sign up

Create an account at [railway.com](https://railway.com). Signing in with GitHub is easiest, because the repo is on GitHub. On the pricing page, confirm the two numbers this runbook assumes:

- new accounts get a one-time trial credit (about $5 for 30 days, no card needed);
- after that, the Hobby plan is about $5 a month, including $5 of usage.

### 1. Create the service

**New project → Deploy from GitHub repo → `Mibrahim930/Budgeting`**, branch `main`. Railway finds the `Dockerfile` and `railway.json` and starts a build, which takes 3–5 minutes. The first deploy fails its health check until steps 2–4 are done; that's expected.

### 2. Set the variables

Open the service, then **Variables**, and add:

| Variable              | Value                                                                                         |
| --------------------- | --------------------------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET`  | the output of `openssl rand -base64 32`                                                       |
| `DATA_ENCRYPTION_KEY` | the output of a second `openssl rand -base64 32`                                              |
| `APP_TIMEZONE`        | `America/New_York` (or your zone)                                                             |
| `PORT`                | `3000`, so the port in step 4 is always the same                                              |

Any random string of 32 or more characters works for `BETTER_AUTH_SECRET`, so Railway's "generate" button is fine for that one. `DATA_ENCRYPTION_KEY` must be exactly 32 random bytes in base64, so use the command. It's only used once you connect SimpleFIN, but set it now and keep a copy of both in a password manager.

Leave `ORIGIN` and `BETTER_AUTH_URL` for step 4.

### 3. Add the disk

**Settings → Volumes → Add volume**, mount path **`/data`**. 1 GB is plenty. The database lives at `/data/budget.db`.

### 4. Give it an address

**Settings → Networking → Generate domain**, port **3000**. Copy the `https://….up.railway.app` address and add two more variables, both set to that exact address:

- `ORIGIN`
- `BETTER_AUTH_URL`

Railway redeploys. Wait for the health check to turn green.

### 5. First sign-in

Open the address and create your account; the first one becomes the admin. Enter your checking, savings and debt balances and your pay schedule. On your phone, open the same address and choose **Add to Home Screen**.

### 6. Invite friends

**Invites → New invite link**. Each link works once and expires after 7 days.

### 7. Back up

Once a week, and after big changes, go to **Invites → Download a backup now**. The file holds everyone's data, so keep it somewhere safe, such as a cloud drive or a password-manager attachment. Until you add Cloudflare R2 (path B), this file is the only copy.

**To restore** a backup file:

1. Install the [Railway CLI](https://docs.railway.com/guides/cli), run `railway login`, then `railway link` in a clone of this repo and pick the project.
2. Open a shell in the running service with `railway ssh` (or the terminal in the dashboard) and copy the backup file to `/data/restore.db`.
3. In that shell, swap it in and remove the old database's side files:

   ```sh
   mv /data/restore.db /data/budget.db && rm -f /data/budget.db-wal /data/budget.db-shm
   ```

4. Straight away, **Redeploy** (or **Restart**) the service in the dashboard, so the app opens the restored file.
5. Sign in and check that your data is there.

Railway's CLI changes now and then; if a command above has moved, `railway --help` lists the current ones.

### 8. Later, optional

- **Bank sync**: each person subscribes to SimpleFIN Bridge and connects it under **Settings → Bank sync**.
- **Automatic backups**: add the `LITESTREAM_*` variables from path B to stream every change to Cloudflare R2.

Neither needs a code change.

**Updates.** Every push to `main` redeploys automatically. Database migrations run when the app starts.

### Costs

| Item                                     | Monthly                             |
| ---------------------------------------- | ----------------------------------- |
| Railway, during the trial credit         | $0                                  |
| Railway Hobby plan, after the trial      | about $5 (includes $5 of usage)     |
| Volume, 1 GB at about $0.15 per GB-month | included in the usage above         |

Check Railway's pricing page before relying on these; they come from third-party summaries, because railway.com couldn't be checked while this was written.

### If something goes wrong

- **Deployments → View logs** is the first place to look.
- A failing health check usually means a missing variable or volume (steps 2–4). `/healthz` answers `ok` only when the database opens.
- Sign-in that silently fails usually means `ORIGIN` or `BETTER_AUTH_URL` doesn't exactly match the address in the browser.

## Path B — Fly.io with Cloudflare R2 backups


Everything here runs on your own computer, in a clone of this repo on `main`. Secrets are generated and entered there and never go anywhere else. Budget about an hour the first time, most of it sign-ups.

The app is named `paycheck-planner` in `fly.toml`, so the URL will be `https://paycheck-planner.fly.dev`. If Fly says that name is taken, use `my-paycheck-planner` instead and change the three occurrences in `fly.toml` to match.

### 0. One-time sign-ups (about 15 minutes)

- **Fly.io** hosts the app (about $2–3 a month).
  1. Create an account at fly.io and add a payment method; it's required even at this size.
  2. Install the CLI: `brew install flyctl` on macOS, or `curl -L https://fly.io/install.sh | sh`.
  3. Run `fly auth login`.
- **Cloudflare** stores the backups (free).
  1. Create a free account.
  2. Open **R2 Object Storage** and create a bucket named `budget-backups` (default location is fine).
  3. Open **Manage R2 API Tokens → Create API token**. Permission *Object Read & Write*, scoped to that one bucket.
  4. Save the **Access Key ID**, the **Secret Access Key** and the **S3 endpoint** (`https://<account-id>.r2.cloudflarestorage.com`) shown on that page. The secret is shown only once.
- **Password manager**: make an entry called "Paycheck planner". Four secrets go in it during step 2.

### 1. Create the app and its disk

```sh
git clone https://github.com/Mibrahim930/Budgeting.git && cd Budgeting
fly apps create paycheck-planner
fly volumes create budget_data --size 1 --region iad --app paycheck-planner
```

### 2. Set the secrets

```sh
openssl rand -base64 32   # run it twice: the first value is BETTER_AUTH_SECRET, the second DATA_ENCRYPTION_KEY
fly secrets set --app paycheck-planner \
  BETTER_AUTH_SECRET='<first value>' \
  DATA_ENCRYPTION_KEY='<second value>' \
  LITESTREAM_BUCKET=budget-backups \
  LITESTREAM_ENDPOINT='https://<account-id>.r2.cloudflarestorage.com' \
  LITESTREAM_ACCESS_KEY_ID='<R2 access key id>' \
  LITESTREAM_SECRET_ACCESS_KEY='<R2 secret access key>'
```

Now put `DATA_ENCRYPTION_KEY`, `BETTER_AUTH_SECRET` and both R2 keys in the password manager.

- Losing `DATA_ENCRYPTION_KEY` means everyone has to reconnect their bank.
- Losing the R2 keys means the backups can't be restored.

### 3. Deploy

```sh
fly deploy --app paycheck-planner          # builds the image remotely; 3–5 minutes the first time
fly scale count 1 --app paycheck-planner   # exactly one machine, because SQLite lives on one volume
fly status --app paycheck-planner          # the machine is "started" and the health check passes
fly logs --app paycheck-planner            # shows "Listening on" and NOT "running WITHOUT backups"
```

### 4. First sign-in

1. Open `https://paycheck-planner.fly.dev`. The first account created becomes the admin and lands on the setup page: checking balance, savings, debts and pay schedule.
2. On a phone, open the same address in Safari or Chrome and choose **Add to Home Screen** to install it as an app.
3. To bring in friends: **Invites → New invite link**. Each link works once and expires after 7 days.

### 5. Prove the backup works

Do this once, before there is data you'd miss. It takes about 10 minutes.

```sh
fly ssh console --app paycheck-planner -C "litestream generations -config /etc/litestream.yml /data/budget.db"
# at least one generation listed means backups are flowing

fly machine list --app paycheck-planner    # note the machine id
fly volumes list --app paycheck-planner    # note the volume id
fly machine destroy <machine-id> --force --app paycheck-planner
fly volumes destroy <volume-id> --app paycheck-planner
fly volumes create budget_data --size 1 --region iad --app paycheck-planner
fly deploy --app paycheck-planner
```

On start, the app finds an empty volume and restores the database from R2 before serving. Sign in again: your admin account and setup data must still be there. If they are, the backups are real.

### 6. After launch

- **Bank sync.** Subscribe at bridge.simplefin.org (about $15 a year), connect your banks there, create a setup token, and paste it in **Settings → Bank sync**, then link the accounts. Each friend does the same with their own subscription.
- **Updates.** Merge to `main`, then `fly deploy --app paycheck-planner`. Database migrations run automatically when the app starts.
- **Costs to expect.** Fly about $2–3 a month (one shared-cpu-1x 256 MB machine plus a 1 GB volume), Cloudflare R2 free at this size, SimpleFIN about $1.25 a month per person.

### If something goes wrong

- `fly logs --app paycheck-planner` is the first place to look.
- "running WITHOUT backups" in the logs means `LITESTREAM_BUCKET` isn't set; re-run step 2.
- A 403 from R2 during restore means the API token isn't scoped to the bucket, or the endpoint has the wrong account id.
- The health check path is `/healthz`; it answers `ok` only when the database opens.

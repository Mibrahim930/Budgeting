# Go-live runbook

Everything here runs on your own computer, in a clone of this repo on `main`. Secrets are generated and entered there and never go anywhere else. Budget about an hour the first time, most of it sign-ups.

The app is named `paycheck-planner` in `fly.toml`, so the URL will be `https://paycheck-planner.fly.dev`. If Fly says that name is taken, use `my-paycheck-planner` instead and change the three occurrences in `fly.toml` to match.

## 0. One-time sign-ups (about 15 minutes)

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

## 1. Create the app and its disk

```sh
git clone https://github.com/Mibrahim930/Budgeting.git && cd Budgeting
fly apps create paycheck-planner
fly volumes create budget_data --size 1 --region iad --app paycheck-planner
```

## 2. Set the secrets

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

## 3. Deploy

```sh
fly deploy --app paycheck-planner          # builds the image remotely; 3–5 minutes the first time
fly scale count 1 --app paycheck-planner   # exactly one machine, because SQLite lives on one volume
fly status --app paycheck-planner          # the machine is "started" and the health check passes
fly logs --app paycheck-planner            # shows "Listening on" and NOT "running WITHOUT backups"
```

## 4. First sign-in

1. Open `https://paycheck-planner.fly.dev`. The first account created becomes the admin and lands on the setup page: checking balance, savings, debts and pay schedule.
2. On a phone, open the same address in Safari or Chrome and choose **Add to Home Screen** to install it as an app.
3. To bring in friends: **Invites → New invite link**. Each link works once and expires after 7 days.

## 5. Prove the backup works

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

## 6. After launch

- **Bank sync.** Subscribe at bridge.simplefin.org (about $15 a year), connect your banks there, create a setup token, and paste it in **Settings → Bank sync**, then link the accounts. Each friend does the same with their own subscription.
- **Updates.** Merge to `main`, then `fly deploy --app paycheck-planner`. Database migrations run automatically when the app starts.
- **Costs to expect.** Fly about $2–3 a month (one shared-cpu-1x 256 MB machine plus a 1 GB volume), Cloudflare R2 free at this size, SimpleFIN about $1.25 a month per person.

## If something goes wrong

- `fly logs --app paycheck-planner` is the first place to look.
- "running WITHOUT backups" in the logs means `LITESTREAM_BUCKET` isn't set; re-run step 2.
- A 403 from R2 during restore means the API token isn't scoped to the bucket, or the endpoint has the wrong account id.
- The health check path is `/healthz`; it answers `ok` only when the database opens.

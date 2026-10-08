# Research: building a personal budgeting app (October 2026)

A research agent produced this report before any code was written. Several primary sources (plaid.com, simplefin.org, actualbudget.org, teller.io) were blocked during research. Prices and access terms therefore come from search summaries and third-party sites. **Confirm them on each provider's site before paying for anything.**

## Recommendation summary

- **Build vs. self-host.** Self-hosting [Actual Budget](https://github.com/actualbudget/actual) is the fastest way to get a working envelope budget. It is MIT-licensed, actively released, and supports SimpleFIN. We build our own anyway, to get real per-friend accounts and a data model we control. The app copies Actual's proven budgeting rules.
  - Don't fork Firefly III: it is PHP, AGPL, and accounting-style rather than envelope-based.
  - Don't fork Maybe: it was archived in July 2025.
  - Don't fork Sure, Maybe's community fork: it is Rails, Redis and Sidekiq, under AGPL.
- **Stack.** One TypeScript full-stack app: SvelteKit, SQLite (Drizzle) and Better Auth, with Litestream backups to Cloudflare R2. It runs as a single container on Fly.io and installs as a PWA.
- **US bank data.**
  - **SimpleFIN Bridge** costs about $15/yr per user, up to 25 institutions. It is self-serve, read-only, and uses a setup token that becomes an Access URL.
  - **Plaid's free Trial plan** allows 10 production Items in total, and removing an Item does not free a slot. It is fine as a second provider for one or two people.
  - **Teller** has a free developer tier, but reportedly relies on private mobile banking APIs, which is a stability risk.
- **Fallback.** CSV/OFX/QFX import works with any bank.

## Budgeting methods

- **Category spending limits** are the simplest to build.
- **Zero-based / envelope budgeting** works best by design, but needs explicit rules for rollover, overspending, income timing and credit cards.
- **Actual's defaults**, which this app adopts:
  - Leftover money rolls forward.
  - Overspending in a category is taken from next month's "To Budget".
  - A "tracking" mode with no rollover exists for people who want limits only.
- **What users value across YNAB, Monarch, Copilot and Actual:** reliable sync, fast rules-based categorization, a clear "what can I spend now" number, and partner sharing.
- **Common complaints:** YNAB's learning curve and price (about $109/yr), Monarch's sync gaps, Copilot being Apple-only, and Actual having no built-in US bank sync.

## Money data modeling

- **Amounts:** store them as integers in minor units (cents), never as floats. Convert to dollars only for display.
- **Ledger:** single-entry transactions are enough for this app. A transfer is two linked rows sharing a `transfer_id`. Deduplicate transfers on the pair, not on each row separately.
- **Splits:** a parent transaction has child rows, and the children must sum to the parent. Budgets and reports use the children.
- **Categories:** categories belong to groups and are soft-deleted (archived), so history stays intact.
- **Budget table:** `budget_allocation(user, category, month, budgeted)`. Activity and available amounts are calculated from transactions, not stored, so they cannot drift.
- **Reconciliation:** each transaction has cleared and reconciled flags. The app also stores provider balance snapshots so differences show up.
- **Provenance fields:** `source`, `external_id`, `import_hash` and `import_batch_id` make deduplication and undo possible.

## Import deduplication (following Actual)

1. Match on the provider or FITID external ID first.
2. Some banks regenerate FITIDs, so fall back to a hash of (account, date, amount, normalized description, occurrence index).
3. Fuzzy-match against manually entered transactions: within ±3 days, same amount, similar payee.
4. Pending transactions change amount, so either update them by provider ID or import posted transactions only.

## Security and privacy

- **No bank credentials are stored**, only aggregator tokens. Those tokens are encrypted in the app with a key kept outside the database.
- **Each user only sees their own data.** One data-access layer adds the user to every query, and tests check that reads across users fail.
- **Sessions are protected.** HTTPS only, httpOnly cookies, CSRF protection and rate-limited login.
- **Backups are separate and tested.** They use their own credentials, and restores are rehearsed.
- **Logs hold no sensitive data:** no amounts, payee names or access URLs.
- **Optional LLM categorization requires consent.** Friends must agree before their transaction descriptions go to a cloud model.
- **Legal (not legal advice).** Keep the group small and invite-only. Publish a one-page note on what is stored and how to delete it, and don't promise security you can't deliver.

## Auth and hosting notes

- **Auth libraries.**
  - Lucia is deprecated.
  - Auth.js is in security-patch-only mode.
  - Better Auth is the current default. Pin its version and watch its security advisories.
- **Hosting.**
  - Fly.io: a tiny always-on machine plus a volume costs about $2–3/mo.
  - Vercel Hobby doesn't suit SQLite, because there is no persistent disk.
  - Supabase free projects pause after a week of inactivity.
  - Cloudflare D1's free tier now rejects queries over its daily limits.

## Later features, by difficulty

- **Easy:** goals.
- **Low–medium:** rules and charts.
- **Medium:** net worth tracking, and LLM categorization as a fallback after rules, cached per merchant.
- **Medium–high:** shared household budgets.
- **High:** offline editing with sync, which needs CRDTs. Deferred.

Key sources:
- [Actual docs](https://actualbudget.org/docs/budgeting/)
- [Plaid billing](https://plaid.com/docs/account/billing/)
- [SimpleFIN protocol](https://www.simplefin.org/protocol.html)
- [Better Auth passkeys](https://www.better-auth.com/docs/plugins/passkey)
- [Litestream](https://github.com/benbjohnson/litestream)
- [Firefly transfers](https://docs.firefly-iii.org/how-to/data-importer/import/transfers/)

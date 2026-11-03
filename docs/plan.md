# Plan: Turn "Budgeting" into a paycheck planner

> **Status (November 2026):** all seven milestones are implemented and pushed. The verification checklist in §9 was run on the final commit.

## 1. Context

### Where we are
The repo `Mibrahim930/Budgeting` (branch `claude/vibrant-galileo-bo0ndu`, clean, CI green) already contains a working SvelteKit app built in October 2026: invite-only accounts with passwords/passkeys, an accounts + transactions ledger (transfers, splits, cleared/reconciled flags), CSV/OFX import with duplicate detection, SimpleFIN bank sync, categorization rules, reconciliation, reports, a PWA, and a Fly.io/Litestream deployment. Its centrepiece is a **monthly envelope budget** (`/budget/[month]`) modelled on Actual Budget.

### What changed
The owner described how they actually want to use the app, and it is not monthly budgeting. It is **paycheck planning**:

> "If I get paid $1,000 on Friday, I have a savings account with $250, a credit card with a $300 balance, and my gym membership ($100) is due the day after I get paid, I want to go in, enter my pay amount, allocate some to savings, some to the credit card, and the gym amount — and see where my money will go before the paycheck comes."

So the unit of planning is **one paycheck**, not one month. Every paycheck gets a plan made before payday; the plan is a checklist the owner ticks off as the money actually moves; recurring bills with due dates feed each plan automatically; and the app shows what every account balance will be once the plan is carried out.

### Decisions the owner made (do not re-litigate)
| Question | Answer |
|---|---|
| Pay schedule | Regular rhythm, but **the amount and date are typed in for every paycheck**. The schedule only predicts the next payday (to pre-fill the date and to know which bills fall before the next paycheck). |
| What allocating does | **Plan first, then confirm.** Lines start as planned; ticking a line creates the real transaction and updates balances; unticking removes it. |
| Bills | **Recurring bills with due dates** (gym on the 16th, rent on the 1st, Netflix on the 9th, card minimum payment…). The planner auto-suggests the ones due before the next paycheck. |
| Leftover money | **It's spending money.** Unassigned pay stays in checking as a "Spending money" line so the owner knows what they can spend until the next paycheck. Not forced to zero. |
| The existing monthly budget | **Replace it entirely.** Remove the month view, the `budget_allocation` table, the envelope/limits engine and the "budget style" setting. |
| Everything else already built | **Keep it.** Ledger, import, bank sync, rules, reconciliation, reports, PWA, deploy, friends' accounts all stay. Confirmed plan lines become ordinary transactions in that ledger. |
| Onboarding | First sign-in collects current financial status: **checking balance, savings balance(s), debts (cards/loans: amount owed), and the income schedule** (frequency, typical take-home amount, next payday). |

### Intended outcome
Opening the app on a phone shows: the next (or current) paycheck's plan with "Left to allocate", a checklist of where the money goes, projected balances after the plan, the bills due before the next paycheck, and current account balances. Creating a new paycheck takes four taps: amount, date, tick the bills it covers, allocate the rest.

### How this plan is executed
Fable (this session) orchestrates. Each milestone below is handed to an **Opus implementation agent** with this file as its brief plus the milestone's section. After each milestone Fable verifies independently (runs the full check suite, reads the diff, screenshots the UI at phone width with the existing Playwright setup) before committing and pushing to `claude/vibrant-galileo-bo0ndu`, as the owner asked: **push after every task**. Nothing is merged to `main`; no PR is opened unless the owner asks.

---

## 2. Product specification

### 2.1 Vocabulary
- **Paycheck**: one pay event. Has a date, a net amount, the account it lands in (checking), an expected next payday, and a list of **lines**.
- **Line**: one place money from this paycheck goes. Four kinds:
  - `savings` — transfer to a savings/cash account ("$100 to Emergency fund").
  - `debt` — payment toward a credit card or loan account ("$150 to Visa").
  - `bill` — one occurrence of a recurring bill ("Gym, $100, due Jan 16"). Snapshot of the bill at the time it was added, so editing or deleting the bill later doesn't rewrite history.
  - `spending` — money earmarked for a category or just "Spending money" ("Groceries $300"). Optionally withdrawn to a cash account.
- **Left to allocate** = paycheck amount − sum of all lines. Zero is ideal, positive means unassigned money (offered as a one-click "Spending money" line), negative means over-allocated (shown red, still allowed).
- **Planned / done**: every line is `planned` until the owner ticks it. Ticking creates the matching ledger transaction(s) and records their id. Unticking deletes them (unless they were reconciled or were *linked* to a bank-synced transaction rather than created by the app).
- **Paycheck received**: the first checkbox on every plan. Ticking it records the income transaction into the deposit account.
- **Window**: a paycheck "covers" the bills due from its date up to (not including) the next payday. `[date, nextDate)`.
- **Pay schedule**: frequency (weekly / every 2 weeks / twice a month / monthly), typical amount, a known payday to anchor the cycle, deposit account. One per user. Used only for predictions and defaults.
- **Recurring bill**: name, amount, cadence (monthly on day N / every N weeks / yearly / one-off), first due date, optional end date, paid-from account, optional category, optional "pays off" account (for debt payments the bill targets a card/loan).

### 2.2 Screens
| Route | Purpose |
|---|---|
| `/welcome` | Onboarding wizard, shown once (when the user has no accounts and no pay schedule). Checking balance → savings accounts → debts → income schedule → Finish. Creates accounts with opening balances and the pay schedule. |
| `/` (home, "Paychecks") | The current/next paycheck's plan: stats (Pay, Allocated, **Left to allocate**), checklist, "Add to plan" picker, projected balances, upcoming bills before next payday (with "in plan ✓" / "Add"), accounts snapshot, list of past paychecks with status, "New paycheck" button, uncategorized-transactions banner. |
| `/paychecks/new` | Create a paycheck: date and next payday pre-filled from the schedule, amount pre-filled with the typical amount, deposit account, and a checklist of bills in the window (checked by default). |
| `/paychecks/[id]` | Full plan page: edit date/amount/next payday/note, same plan components as home, delete (only when nothing is ticked). |
| `/bills`, `/bills/[id]` | List and edit recurring bills, grouped Active / Ended, with next due date and cadence text. Link to `/categories`. |
| `/settings/pay` | Edit the pay schedule. Settings index gets "Pay schedule" and "Categories" cards and loses "Budget style". |
| `/reports` | Existing two reports stay; add "Where each paycheck went": per paycheck, planned vs actual for savings / debt / bills / spending / unallocated. |
| Removed | `/budget`, `/budget/[month]`, the budget-mode setting. |

Navigation order: **Paychecks** (`/`), **Bills**, Accounts, Transactions, Import, Rules, Reports, Settings, Invites (admin). Brand logo links to `/`. Active-link rule: `/` is active for `/` and `/paychecks*`; others by prefix.

### 2.3 Worked example (this is also the e2e scenario)
Onboarding: Main checking $1,000; Emergency savings $250; Visa card owes $300; paid every 2 weeks, about $2,000, next payday 2030-01-03.
Bills: Rent $1,200 monthly on the 1st; Netflix $15.49 monthly on the 9th (category Subscriptions).
New paycheck 2030-01-03, $2,000, next payday 2030-01-17 → Netflix (Jan 9) is pre-ticked, Rent (Feb 1) is not in the window. Left to allocate **$1,984.51**.
Add $100 savings → Emergency (**$1,884.51**); $150 debt → Visa (**$1,734.51**); "Use $1,734.51 as spending money" (**$0.00**).
Projected after plan: Emergency $350.00, Visa −$150.00, Main checking $2,734.51 (1,000 + 2,000 − 15.49 − 100 − 150; the spending line is earmarked, not moved).
Tick "Paycheck received" → Main checking is really $3,000.00. Tick Netflix, savings, debt → Main checking $2,734.51, Emergency $350.00, Visa −$150.00; `/transactions?q=netflix` shows one Subscriptions expense. Untick savings → Emergency back to $250.00. Status shows "Partly confirmed".

---

## 3. Data model changes (`src/lib/server/db/schema.ts`)

Conventions already in force: integer cents in `*Minor` columns, dates as `'YYYY-MM-DD'` strings, `userId()` helper on every domain table, `...timestamps`, soft deletes via `archivedAt` where applicable, `ValidationError` from `repo/transactions.ts` for bad input.

### Remove
- `budgetAllocation` table.
- `user.budgetMode` column **and** the `budgetMode` entry in `additionalFields` in `src/lib/server/auth.ts` (otherwise Better Auth keeps writing the column and sign-up breaks), and its use in `src/routes/(app)/+layout.server.ts`.

### Add (place after `txn`; two tables reference it)
```ts
export const PAY_FREQUENCIES = ['weekly', 'biweekly', 'semimonthly', 'monthly'] as const;

pay_schedule        id PK, user_id (unique index: one per user), frequency, amount_minor (>0, typical net pay),
                    anchor_date (a known payday; cycle anchor; day-of-month source for monthly),
                    semi_day_1, semi_day_2 (semimonthly only; default 1 and 15),
                    deposit_account_id FK fin_account (set null), income_category_id FK category (set null), timestamps

export const BILL_FREQUENCIES = ['monthly', 'every_n_weeks', 'yearly', 'once'] as const;

recurring_bill      id PK, user_id (index), name, amount_minor (>0), frequency,
                    day_of_month (monthly/yearly, 1..31 clamped to month length), month_of_year (yearly, 1..12),
                    interval_weeks (every_n_weeks, 1..52),
                    start_date (first possible due date; weekday anchor for every_n_weeks; THE date for once),
                    ended_at (nullable, inclusive last due date),
                    account_id FK fin_account cascade (paid from), category_id FK category set null,
                    pay_to_account_id FK fin_account set null (credit/loan this bill pays down), timestamps

paycheck            id PK, user_id, date, amount_minor (>0), account_id FK fin_account cascade (deposit account),
                    income_category_id FK category set null, next_date (expected next payday, nullable),
                    income_txn_id FK txn set null (set when "Paycheck received" is ticked), note, timestamps
                    index (user_id, date)

export const LINE_KINDS = ['savings', 'debt', 'bill', 'spending'] as const;
export const LINE_STATUSES = ['planned', 'done'] as const;

paycheck_line       id PK, user_id (index), paycheck_id FK paycheck cascade (index), kind, label (snapshot text),
                    amount_minor (>=0),
                    from_account_id FK set null (null = the paycheck's deposit account; bills snapshot bill.account_id),
                    to_account_id FK set null (savings/debt target; bill.pay_to_account_id; cash account for spending),
                    category_id FK set null, bill_id FK recurring_bill set null, due_date (bill occurrence date),
                    status default 'planned', txn_id FK txn set null,
                    txn_origin enum('created','linked') nullable, done_at timestamp_ms nullable, sort int, timestamps
                    index (bill_id, due_date)   -- "already in a plan" lookup
```
`txn_origin` is added now even though linking arrives in the last milestone, to avoid a second migration.

### Migration
`npx drizzle-kit generate --name paycheck_planner` → `src/lib/server/db/migrations/0001_paycheck_planner.sql` (+ snapshot + journal). No renames, so no prompts. Expect 4 `CREATE TABLE`, indexes, `DROP TABLE budget_allocation`, and either `ALTER TABLE user DROP COLUMN budget_mode` or drizzle's copy-table pattern; both are fine (bundled SQLite is 3.53). Existing `budget_allocation` rows are discarded on purpose. Tests open `:memory:` and run every migration, so `npm test` validates the SQL. The Dockerfile already ships the migrations folder.

---

## 4. Pure logic (no database; importable from Svelte for live math)

### 4.1 Date helpers — extend `src/lib/month.ts`
Everything string-based, using `Date.UTC` under the hood (never `new Date('YYYY-MM-DD')` in local time; never compare `Date` objects).
```ts
isDate(s): boolean                       // /^\d{4}-\d{2}-\d{2}$/
addDays(date, n): string
dayDiff(from, to): number                // to − from, signed whole days
daysInMonth(y, m): number
makeDate(y, m, d): string                // clamps d to the month's length (31 → Feb 28/29)
weekdayOf(date): number                  // 0 = Sunday
dateParts(date): { y, m, d }
```
Optional cleanup: the importer's private `shiftDate`/`dayDiff` in `src/lib/server/import/importer.ts` can switch to these.

### 4.2 `src/lib/planner/occurrences.ts` — when is a bill due?
```ts
interface BillSchedule { frequency; startDate; dayOfMonth?; monthOfYear?; intervalWeeks?; endedAt? }
nextOccurrences(bill, from, to): string[]     // due dates with from <= d < to, ascending; honours startDate and endedAt (inclusive)
nextOccurrence(bill, onOrAfter): string | null
```
Algorithm: monthly → for each month from month(from)−1 to month(to), candidate `makeDate(y, m, dayOfMonth)`, keep if in window and within `[startDate, endedAt]`. yearly → same per year with `monthOfYear`. every_n_weeks → `step = 7·n`, `k = max(0, ceil(dayDiff(startDate, from)/step))`, emit `startDate + k·step` while `< to`. once → `[startDate]` if in window.

Table-driven tests (`occurrences.test.ts`): day 31 in Feb → `2026-02-28`; day 31 in Mar → `2026-03-31`; day 30 in leap Feb → `2028-02-29`; half-open end (due on `to` is excluded); empty window; December→January crossing; `startDate` after window start skips the first month; `endedAt` cuts later ones; two months → two dates; every 2 weeks from 2026-01-02 in [01-10, 02-10) → `01-16, 01-30`; weekly starting before the window; yearly; yearly Feb 29 in a non-leap year → Feb 28; once inside / outside window; `from > to` → `[]`; `nextOccurrence` for a passed one-off → `null`.

### 4.3 `src/lib/planner/payday.ts` — when is the next paycheck?
```ts
interface PayScheduleInput { frequency; anchorDate; semiDay1?; semiDay2? }
nextPayday(s, after): string              // strictly after
paydayOnOrAfter(s, date): string
paydaysBetween(s, from, to): string[]     // half-open
```
weekly/biweekly: step 7/14 from the anchor, walks forwards or backwards (an anchor in the future is fine). semimonthly: candidates `makeDate(y, m, d1)`, `makeDate(y, m, d2)` for this and next month; smallest `> after` (15/30 → Feb 28). monthly: the anchor's day-of-month, clamped per month (Jan 31 → Feb 28 → Mar 31).

Tests: weekly from Fri 01-02 after 01-02 → 01-09; after 01-05 → 01-09; backwards from an anchor → previous cycle date; biweekly after 01-15 → 01-16, after 01-16 → 01-30; far-future anchor resolves to the right cycle date; semimonthly 1/15 and 15/30 boundaries; monthly 31st clamping forward and back; `paydaysBetween`; `paydayOnOrAfter` returns the date itself when it is a payday.

### 4.4 `src/lib/planner/plan-math.ts` — totals and projections
```ts
interface PlanLine { kind; amountMinor; status; fromAccountId: string|null; toAccountId: string|null }
planTotals(paycheck, lines): { allocated, left, doneCount, plannedCount, byKind: Record<kind, number> }
projectBalances(paycheck: { accountId, amountMinor, incomeConfirmed }, lines, balances: Map<accountId, number>)
  : Map<accountId, { before, after }>
```
Projection rules: if income is not yet confirmed, `+amount` on the deposit account. For every **planned** line: `from = fromAccountId ?? deposit`; `from −= amount`; if `toAccountId`, `to += amount`. Done lines and a confirmed paycheck change nothing (they are already in the real balances). **Spending lines with no cash account do not change any projection**: the money physically stays in checking and ticking them creates no transaction, so the projected checking balance must not drop when they are ticked (this is what makes §2.3's $2,734.51 correct). The UI shows that earmarked amount separately as "Spending money until next payday". Accounts missing from `balances` count as 0.

Tests: the §2.3 numbers; over-allocation gives negative `left`; no lines → `left = amount`; done lines are inert; bill paid from the credit card moves the card, not checking; card payment line moves checking down and card up; spending to a cash account moves money to cash.

---

## 5. Server layer

### 5.1 Small changes to existing code
| File | Change |
|---|---|
| `src/lib/server/repo/transactions.ts` | `export` `assertCategory`; move `uncategorizedSummary` here from `repo/budget.ts` (the home page still shows the banner). |
| `src/lib/server/repo/accounts.ts` | New `createAccountWithOpeningBalance(db, userId, input, balanceMinor, date = today())` extracted from `src/routes/(app)/accounts/+page.server.ts` (sign flip for credit/loan, payee "Starting balance", income category only when `onBudget`, `cleared: true`). The route calls it. |
| `src/lib/safe-redirect.ts` (+ test) | Fallback `/` instead of `/budget`. |
| `src/routes/(auth)/signup/+page.server.ts` | Redirect to `/`. Delete `src/routes/+page.server.ts` (home moves into `(app)`). |
| `src/routes/(app)/+layout.svelte` | New nav list; exact-match rule for `/`. |
| `src/routes/(app)/+layout.server.ts` | Stop returning `budgetMode`. |
| `src/routes/(app)/settings/*` | Remove the "Budget style" section and action; add "Pay schedule" and "Categories" cards; update delete-account copy. |
| `src/routes/(app)/categories/+page.svelte` | Back link → `/bills`. |
| `static/manifest.webmanifest` | `start_url: "/"`, description "Paycheck planning for you and a few friends". |
| `src/routes/privacy/+page.svelte`, `README.md`, `docs/plan.md` | Wording: paycheck plans and bills instead of budgets. |
| `package.json` | Pre-existing bug: `start` references `scripts/migrate.js`, which doesn't exist. Set `"start": "node build"` (migrations run when the app opens the database). |
| Delete | `src/routes/(app)/budget/**`, `src/lib/server/budget/engine.ts` + test, `src/lib/server/repo/budget.ts`, `e2e/budget.test.ts`, the "budget month" block and `setBudgeted` import in `src/lib/server/repo/ledger.test.ts`. |

### 5.2 `src/lib/server/repo/pay-schedule.ts`
`getPaySchedule(db, userId)`, `upsertPaySchedule(db, userId, input)`, `defaultIncomeCategoryId(db, userId)` (the seeded "Paycheck" income category, else any income category). Validation: frequency in enum; amount safe int > 0; anchor is a date; semimonthly needs two distinct days 1..31; deposit account must belong to the user (`getAccount`).

### 5.3 `src/lib/server/onboarding.ts`
```ts
interface OnboardingInput {
  checking: { name; balanceMinor };
  savings: { name; balanceMinor }[];
  debts: { name; type: 'credit'|'loan'; owedMinor }[];
  pay: { frequency; amountMinor; anchorDate; semiDay1?; semiDay2? };
}
completeOnboarding(db, userId, input): { checkingId }   // one db.transaction
needsOnboarding(db, userId): boolean                      // no schedule AND no accounts (archived included)
```

### 5.4 `src/lib/server/repo/bills.ts`
`listBills({ includeEnded, asOf })` (joins account/category/pay-to names, adds `nextDue`), `getBill`, `createBill`, `updateBill`, `endBill(id, endedAt)`, `deleteBill`, and
`billsDueBetween(db, userId, from, to): BillOccurrence[]` — expands every active bill with `nextOccurrences`, left-joins `paycheck_line` on `(bill_id, due_date)` so each occurrence carries `plannedLineId`/`plannedPaycheckId`, sorted by due date then name.
Validation: name required; amount > 0; per-frequency fields present and in range; `endedAt >= startDate`; paid-from account owned; category via `assertCategory`; pay-to account owned, of type credit/loan, and not the same as paid-from.
`deleteBill`: delete this user's **planned** lines for the bill, then the bill; **done** lines keep their snapshot and get `bill_id = null` through the FK.

### 5.5 `src/lib/server/repo/paychecks.ts`
```ts
createPaycheck(db, userId, input, { billOccurrences? })      // nextDate defaults to nextPayday(schedule, date) or date+14
updatePaycheck(db, userId, id, patch)                          // if income txn exists, updateTransaction keeps it in sync
deletePaycheck(db, userId, id)                                 // refuses while anything is ticked
addLine / updateLine / removeLine                              // update/remove refuse on done lines
allocateLeftover(db, userId, paycheckId, label = 'Spending money', categoryId?)   // adds a spending line for left > 0
confirmIncome / unconfirmIncome                                // +amount income txn on the deposit account, payee "Paycheck", date = paycheck.date
confirmLine(db, userId, lineId, date) / unconfirmLine
getPaycheck(db, userId, id): PaycheckDetail                    // lines with names, totals, projected balances, billsDue in the window, spent-so-far per spending line
listPaychecks(db, userId, { limit = 24 }): PaycheckSummary[]  // status: planned | partial | confirmed
pickHomePaycheck(summaries, today)                             // pure: first unconfirmed or future plan, else the latest
suggestNextPaycheck(db, userId, today)                         // from the schedule; skips dates that already have a paycheck
```
Line rules:
- `savings`: `toAccountId` required, owned, not credit/loan, not the deposit account.
- `debt`: `toAccountId` required, type credit or loan.
- `bill`: `billId` + `dueDate` required; snapshot label/amount/from/to/category from the bill; reject a duplicate `(billId, dueDate)` anywhere in this user's plans ("That bill is already in a plan").
- `spending`: label required (defaults to the category name); optional `toAccountId` must be a `cash` account.
- All: amount is a safe integer ≥ 0; `sort = max + 1`.

Confirming (one transaction each):
- savings / debt / bill-with-pay-to / spending-to-cash → `createTransaction({ accountId: from, date, amountMinor: −amount, transferAccountId: to, categoryId, memo: label })`. The existing `transferLegCategory` keeps the category on the checking leg only when the target is off-budget (loan/investment).
- bill without pay-to → `createTransaction({ accountId: from, date: dueDate, amountMinor: −amount, payeeName: label, categoryId })`.
- spending without a cash account → **no transaction**. Ticking marks the envelope acknowledged. Reason: the real spending arrives as many synced/manual transactions; a lump −$300 on payday would double-count and make checking wrong. Instead `getPaycheck` returns `spentMinor` for each spending line with a category: the sum of expense transactions in that category dated in `[paycheck.date, nextDate)`, shown as "spent $84.20 of $300.00" with a thin progress bar.
- Dates: bills use their `dueDate`, income uses `paycheck.date`, everything else the `date` passed by the action (`today()`).
- Unticking: refuse if the created transaction is `reconciled`; `deleteTransaction` removes both transfer legs; a transaction already deleted from the ledger (FK set null) just resets the line; a `linked` transaction is never deleted, only unlinked.

### 5.6 Forms and actions
`src/lib/server/forms.ts`: add `parseBillForm`, `parsePaycheckForm` (bills arrive as checkbox values `billId|dueDate`), `parseLineForm`, `parseOnboardingForm` (savings/debts as hidden JSON, same pattern as `splits` in `TransactionForm.svelte`), `parsePayScheduleForm`. All use `parseMoney`, amounts entered positive, throw `ValidationError`.
`src/lib/server/paycheck-actions.ts`: `confirmLine`, `unconfirmLine`, `confirmIncome`, `unconfirmIncome`, `addLine`, `updateLine`, `removeLine`, `allocateLeftover` — each `requireUserId` + `handleValidation`, exactly like `transactionActions` in `page-helpers.ts`. Spread into both `/` and `/paychecks/[id]`.

### 5.7 Reports — `src/lib/server/repo/reports.ts`
`paycheckBreakdown(db, userId, limit = 12)`: per paycheck `{ id, date, amountMinor, planned: { savings, debt, bills, spending }, actual: same from done lines (|txn amount| when a txn exists, else the line amount), unallocated }`.

### 5.8 Linking bank-synced transactions (last milestone)
`suggestLineMatches(db, userId, paycheckId)`: for each planned line, candidate transactions on the `from` account with amount `−line.amountMinor`, dated within ±3 days of the expected date (due date or paycheck date), `source ∈ {csv, ofx, simplefin}`, not already referenced by any line or paycheck; transfer lines also need a matching candidate on the `to` account. `linkLine(db, userId, lineId, txnId)` sets `done`, `txnOrigin = 'linked'`. `suggestIncomeMatch` does the same for the paycheck (+amount, income category or uncategorized). No changes to `sync.ts`.

---

## 6. UI

Reuse: `Money.svelte` (`colored`), `CategorySelect.svelte`, `TransactionList.svelte`, `parseMoney`/`centsToInput`/`formatMoney`, `handleValidation`/`requireUserId`/`loadFormOptions`, the submit-on-change amount input pattern from the old budget page, the hidden-JSON repeatable rows pattern from `TransactionForm.svelte`. Mobile-first: one column on phones, two on `md`. The existing nav wraps on phones; nine links fit in two rows (verified in the October screenshots).

New components in `src/lib/components/`:
- `PaycheckPlan.svelte` — header ("Paycheck · Fri Jan 3 · $2,000.00"), three stats with `data-testid="left-to-allocate"` (green at 0, amber > 0, red < 0 with "Over-allocated by $X"), the checklist: "Paycheck received" row, then one row per line (checkbox form, label + sub-text like "to Emergency fund" / "due Jan 9 · Subscriptions" / "Visa payment" / "spent $84.20 of $300.00", amount input while planned or `Money` + link to `/transactions/{txnId}` once done, ✕ remove), footer "Use $X leftover as spending money" when `left > 0` and "Every dollar has a job" at 0.
- `AddLinePicker.svelte` — four segmented buttons (Savings / Debt / Bill / Spending) with the matching fields; bills offered are the window's occurrences not yet planned, amount pre-filled.
- `ProjectedBalances.svelte` — account · now · after, deposit account first, then touched accounts, then the rest; a footer line "Spending money until next payday: $X" (sum of planned spending lines with no cash account), since that money stays in checking.
- `UpcomingBills.svelte` — bills due before the next payday with "In plan ✓" or "Add".
- `PaycheckList.svelte` — past/future paychecks with status pill (Planned / Partly confirmed / Confirmed) and left-to-allocate if ≠ 0.
- `BillForm.svelte` — frequency-driven fields; "Paid from" account; `CategorySelect`; "Pays off" select of credit/loan accounts.

Onboarding (`/welcome`): four cards (Checking; Savings with "+ Add savings account"; Debts with name / type / amount owed; Income with frequency, "Take-home pay", "Next payday" defaulting to today, two day inputs when semimonthly). Accessible labels used by tests: "Checking balance", "Take-home pay", "Next payday", "Pay frequency". Only the **home page** redirects to `/welcome` (when `needsOnboarding`), so no existing flow gets trapped; `/welcome` redirects home once done. Users who have accounts but no schedule see a "Set up your pay schedule" card on the home page linking to `/settings/pay`.

`/paychecks/new`: GET params `?date=&next=` drive the bill checklist (a "Refresh bills" GET button like the reports filter) so changing the date updates which bills are offered; `create` action → `/paychecks/[id]`.

---

## 7. Milestones

Each milestone ends with `npm run check && npm run lint && npm test && npm run test:e2e` green (Playwright with `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium`), one commit, one push to `claude/vibrant-galileo-bo0ndu`. Each is delegated to an Opus agent with this file + the milestone text; Fable reviews the diff and screenshots before committing.

**M1 — Remove the monthly budget; add schema and pure logic.**
Schema edits (§3), migration, `budgetMode` removal in `auth.ts` + layout, deletions and small changes from §5.1, `package.json` start fix. Temporary home: `src/routes/(app)/+page.server.ts` redirecting to `/accounts`; e2e `helpers.ts`/`auth.test.ts`/`pwa.test.ts` updated to expect `/accounts` and its heading. Add §4 modules with their tests. Nav loses "Budget". Commit: "Replace the monthly budget with paycheck-planner schema and date logic".

**M2 — Server layer.**
§5.2–5.6 (pay schedule, onboarding, bills, paychecks, forms, actions) with Vitest coverage: onboarding creates the right accounts/schedule and `needsOnboarding` flips; bill validation matrix; `billsDueBetween` marks planned occurrences; `deleteBill` keeps done lines; the full §2.3 flow through the repo functions, including untick restoring balances and status transitions; refusals (edit a done line, delete a ticked paycheck, untick a reconciled txn); `updatePaycheck` after income confirmed updates the txn; isolation (a second user cannot read or touch anything, and cannot point a line at the first user's account). Commit.

**M3 — Onboarding, pay-schedule settings, home skeleton.**
`/welcome`, `/settings/pay`, settings cards, home load with the onboarding redirect, accounts snapshot, schedule card, empty state "No paycheck planned yet → New paycheck", nav (Paychecks/Bills), manifest. e2e helpers: `loginAsAdmin` tolerates landing on `/welcome`; `auth.test.ts` sign-up expects `/welcome`. Commit.

**M4 — Bills.**
`/bills`, `/bills/[id]`, `BillForm.svelte`, categories back link. Start `e2e/planner.test.ts` (serial): sign in as the *friend* account created by `auth.test.ts` (fresh, so onboarding runs) → onboarding from §2.3 → add Rent and Netflix → list shows next due dates. Commit.

**M5 — Paychecks.**
`/paychecks/new`, `/paychecks/[id]`, home planner components, confirm/unconfirm, leftover, spent-so-far. e2e part 2: the rest of §2.3 with exact dollar assertions on `left-to-allocate`, projected balances, real balances after ticking, the Netflix transaction, untick, status pill. Commit.

**M6 — Reports, PWA, docs, isolation.**
`paycheckBreakdown` + report section (table + thin stacked bars in the existing style); `pwa.test.ts` moves to `/` and asserts on `left-to-allocate` (or a stable `data-testid="home"`); README feature list and "Where things live" (`src/lib/planner/`), `docs/plan.md` status note, privacy copy. e2e part 3: admin sees no friend bills, `/paychecks/<friend id>` is a 404, admin's home shows the "Set up your pay schedule" card; complete it so later tests have a planner at `/`. Commit.

**M7 — Link synced transactions.**
§5.8 with tests (a synced −$15.49 within 3 days of Netflix's due date is suggested; linking marks done without creating a txn; unticking unlinks without deleting). UI: a muted "Looks paid on Jan 9 — link" chip on the line and on the "Paycheck received" row. Commit.

---

## 8. Edge cases (decided)
- **Bill deleted while planned**: its planned lines go; done lines keep their snapshot.
- **Paycheck amount/date edited after lines exist**: allowed; left-to-allocate recomputes; an existing income transaction is updated.
- **Bill paid from a credit card**: the card balance moves, checking doesn't; projection shows it. A bill with a pay-to account (card minimum) is a transfer checking → card.
- **Debt/savings into an off-budget account** (loan, investment): the checking leg keeps the optional category.
- **Leftover**: positive → one-click spending line; negative → red warning but confirming still allowed; zero → "Every dollar has a job".
- **Two paychecks on one date** are allowed (two jobs); a bill occurrence can be in only one plan.
- **Windows are half-open**: a bill due on the next payday belongs to the next paycheck. With no schedule, `nextDate` defaults to +14 days and is editable.
- **Archived accounts** referenced by bills/plans still work; hard-deleting an account cascades.
- **Dates and time zones**: all "today" values come from `today()` in `src/lib/month.ts`; all planner math is string-based.
- **Offline**: plan pages are cached like any page; ticking needs the network (unchanged).
- **Security**: every new repo function takes `userId` and scopes every query; cross-user tests are mandatory in M2; no new secrets.

## 9. Verification checklist (Fable runs this after each milestone and at the end)
1. `npm run check && npm run lint && npm test && PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:e2e` green locally; GitHub Actions green on the pushed commit (both `check` and `docker` jobs).
2. Build and run the production bundle with a scratch SQLite file, seed the §2.3 scenario through the UI with Playwright, and screenshot `/`, `/paychecks/[id]`, `/bills`, `/welcome` at 390×844 and 1200×900. Check: no horizontal scroll, every nav item reachable, dollar figures match §2.3.
3. Open a fresh database: first sign-up lands on `/welcome`; finishing lands on `/` with the accounts snapshot.
4. Confirm the migration applies to a database created by the October version (copy of the old schema with a `budget_allocation` row) without error.
5. Final: README deploy section still accurate; `docs/plan.md` carries this plan's status; `git status` clean; branch pushed.

---

# Addendum (November 2026): Calendar and automatically planned charges

## Context
The owner is using the app on Railway and asked for a **calendar** of recurring charges, and for charges to be **added to a plan automatically** when they fall before the next paycheck. Recurring charges already exist as bills (`/bills`, `recurring_bill`), and a new paycheck pre-ticks the bills in its window. Two gaps remain: there is no calendar view, and a bill created or changed *after* a plan exists only appears as an "Add" suggestion instead of landing in the plan. The owner chose: a month calendar showing charges, paydays and paid status; **no** automatic drafting of paychecks (they create each plan themselves); ship via a PR merged once CI is green.

## Behaviour
1. **Auto-add on bill changes** (`src/lib/server/repo/bills.ts`):
   - `createBill`: for every paycheck of the user whose status is not `confirmed` and whose window `[date, windowEnd)` contains an occurrence of the new bill, add a `bill` line for that occurrence (reuse `addLine` from `repo/paychecks.ts`; skip occurrences already planned anywhere).
   - `updateBill`: for this bill's **planned** (not done) lines: drop lines whose `dueDate` is no longer an occurrence or no longer inside their paycheck's window; refresh `label`, `amountMinor`, `fromAccountId`, `toAccountId`, `categoryId` from the bill on the remaining planned lines; then add any occurrence now missing, as in `createBill`. Done lines are never touched.
   - `endBill`: remove this bill's planned lines dated after `endedAt`.
   - All inside one `db.transaction`, scoped by user; a helper `syncBillIntoPlans(db, userId, billId)` shared by the three.
2. **Calendar data** (`src/lib/server/repo/calendar.ts`): `calendarMonth(db, userId, month)` returns, for `[month-01, nextMonth-01)`: bill occurrences with `{ billId, name, amountMinor, dueDate, accountName, status: 'unplanned' | 'planned' | 'paid', paycheckId? }` (status from the joined `paycheck_line`: none → unplanned, `planned` → planned, `done` → paid), predicted paydays from the schedule (`paydaysBetween`), and actual paychecks (`listPaychecks`) with their status. Totals per month: charges due, of which paid.
3. **Calendar page** `/calendar` (nav item "Calendar" right after "Bills"): `?month=YYYY-MM` with prev/next and "Today". A 7-column month grid (Sun–Sat), each day cell showing the day number, a payday marker, and one dot per charge coloured by status (grey = not in a plan, blue = planned, green = paid); the selected day (default: today, or the 1st when viewing another month) lists its items below the grid with name, amount, account, status pill and links (charge → `/bills/[id]`, plan → `/paychecks/[id]`). "Add a charge on this day" opens `BillForm` prefilled with `startDate` = that day, frequency monthly, `dayOfMonth` = that day; submitting creates the bill (which auto-adds it to any open plan per 1) and returns to the calendar on that day with a "Added to <paycheck date> plan" notice when that happened. Legend under the grid. Must be usable at 390 px: dots not text inside cells; the agenda list carries the detail.
4. Bills page: add a "Calendar" link; `UpcomingBills` on the home page keeps its "Add" button for charges that pre-date the auto-add behaviour.

## Tests
- Repo: creating a bill whose occurrence falls inside an open plan's window adds a planned line (and not to a confirmed plan, and not when the occurrence is outside every window); updating the bill's day moves the line; updating the amount refreshes the planned line but leaves a done line alone; ending the bill removes later planned lines; `calendarMonth` statuses and payday dates; cross-user isolation.
- e2e (`e2e/calendar.test.ts`, runs after `planner`): as the friend, open `/calendar?month=2030-01`, pick Jan 16, add "Gym" $100 monthly from that day → the notice says it was added to the Jan 3 plan; `/paychecks/<id>` shows a Gym line of $100 and left-to-allocate `-$100.00`; the calendar shows Jan 16 with a planned (blue) dot and Jan 9 Netflix as paid (green); Jan 3 and Jan 17 carry payday markers.

## Verification
`npm run check && npm run lint && npm test && npm run test:e2e` green; screenshots of `/calendar` at 390 px and 1200 px; PR against `main`, merged when CI is green (Railway deploys `main`).

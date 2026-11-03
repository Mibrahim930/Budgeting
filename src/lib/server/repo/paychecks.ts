import { addDays, isDate, today } from '$lib/month';
import { nextOccurrences } from '$lib/planner/occurrences';
import { nextPayday, paydayOnOrAfter } from '$lib/planner/payday';
import { planTotals, projectBalances, type PlanTotals } from '$lib/planner/plan-math';
import { and, asc, desc, eq, gte, inArray, lt, max, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { paycheck, paycheckLine, txn, type LineKind } from '../db/schema';
import { newId } from '../id';
import { getAccount, listAccounts, type AccountRow } from './accounts';
import { billsDueBetween, getBill, type BillOccurrence } from './bills';
import { getCategory } from './categories';
import { defaultIncomeCategoryId, getPaySchedule } from './pay-schedule';
import {
	assertCategory,
	createTransaction,
	deleteTransaction,
	getTransaction,
	getTransferPartner,
	updateTransaction,
	ValidationError
} from './transactions';

export type PaycheckRow = typeof paycheck.$inferSelect;
export type LineRow = typeof paycheckLine.$inferSelect;
export type PaycheckStatus = 'planned' | 'partial' | 'confirmed';

const INCOME_PAYEE = 'Paycheck';
const DEFAULT_WINDOW_DAYS = 14;

// ---------------------------------------------------------------------------
// Paychecks
// ---------------------------------------------------------------------------

export interface PaycheckInput {
	date: string;
	/** Net pay, positive cents. */
	amountMinor: number;
	/** Deposit account. */
	accountId: string;
	incomeCategoryId?: string | null;
	/** Expected next payday; defaults from the pay schedule (or +14 days). */
	nextDate?: string | null;
	note?: string | null;
}

/** One bill occurrence to add to a new plan. */
export interface BillPick {
	billId: string;
	dueDate: string;
}

export function getPaycheckRow(db: Db, userId: string, id: string): PaycheckRow | undefined {
	return db
		.select()
		.from(paycheck)
		.where(and(eq(paycheck.id, id), eq(paycheck.userId, userId)))
		.get();
}

function requirePaycheck(db: Db, userId: string, id: string): PaycheckRow {
	const row = getPaycheckRow(db, userId, id);
	if (!row) throw new ValidationError('Paycheck not found');
	return row;
}

/** The end (exclusive) of the bills window a paycheck covers. */
export const windowEnd = (p: { date: string; nextDate: string | null }) =>
	p.nextDate ?? addDays(p.date, DEFAULT_WINDOW_DAYS);

function validatePaycheck(db: Db, userId: string, p: PaycheckInput) {
	if (!isDate(p.date)) throw new ValidationError('Date must be YYYY-MM-DD');
	if (!Number.isSafeInteger(p.amountMinor) || p.amountMinor <= 0) {
		throw new ValidationError('Pay must be more than zero');
	}
	if (!getAccount(db, userId, p.accountId)) throw new ValidationError('Unknown account');
	assertCategory(db, userId, p.incomeCategoryId);
	if (p.nextDate) {
		if (!isDate(p.nextDate)) throw new ValidationError('Next payday must be YYYY-MM-DD');
		if (p.nextDate <= p.date) throw new ValidationError('Next payday must be after this one');
	}
}

/** Create a paycheck plan, optionally with bill lines for the chosen occurrences. */
export function createPaycheck(
	db: Db,
	userId: string,
	input: PaycheckInput,
	{ billOccurrences = [] }: { billOccurrences?: BillPick[] } = {}
): string {
	const schedule = getPaySchedule(db, userId);
	const values = {
		date: input.date,
		amountMinor: input.amountMinor,
		accountId: input.accountId,
		incomeCategoryId:
			input.incomeCategoryId ?? schedule?.incomeCategoryId ?? defaultIncomeCategoryId(db, userId),
		nextDate:
			input.nextDate ||
			(isDate(input.date)
				? schedule
					? nextPayday(schedule, input.date)
					: addDays(input.date, DEFAULT_WINDOW_DAYS)
				: null),
		note: input.note?.trim() || null
	};
	validatePaycheck(db, userId, values);
	return db.transaction((tx) => {
		const t = tx as unknown as Db;
		const id = newId();
		t.insert(paycheck)
			.values({ id, userId, ...values })
			.run();
		for (const b of billOccurrences) {
			addLine(t, userId, id, { kind: 'bill', billId: b.billId, dueDate: b.dueDate });
		}
		return id;
	});
}

/** Edit a paycheck. A recorded income transaction is kept in sync. */
export function updatePaycheck(db: Db, userId: string, id: string, patch: Partial<PaycheckInput>) {
	const existing = requirePaycheck(db, userId, id);
	const next = {
		date: patch.date ?? existing.date,
		amountMinor: patch.amountMinor ?? existing.amountMinor,
		accountId: patch.accountId ?? existing.accountId,
		incomeCategoryId:
			patch.incomeCategoryId !== undefined ? patch.incomeCategoryId : existing.incomeCategoryId,
		nextDate: patch.nextDate !== undefined ? patch.nextDate || null : existing.nextDate,
		note: patch.note !== undefined ? patch.note?.trim() || null : existing.note
	};
	validatePaycheck(db, userId, next);
	const income = existing.incomeTxnId
		? getTransaction(db, userId, existing.incomeTxnId)
		: undefined;
	const incomeChanged =
		!!income &&
		(income.date !== next.date ||
			income.amountMinor !== next.amountMinor ||
			income.accountId !== next.accountId ||
			income.categoryId !== next.incomeCategoryId);
	if (incomeChanged && income.reconciled) {
		throw new ValidationError('This paycheck’s income is reconciled and can’t change');
	}
	db.transaction((tx) => {
		const t = tx as unknown as Db;
		t.update(paycheck)
			.set(next)
			.where(and(eq(paycheck.id, id), eq(paycheck.userId, userId)))
			.run();
		if (income && incomeChanged) {
			updateTransaction(t, userId, income.id, {
				accountId: next.accountId,
				date: next.date,
				amountMinor: next.amountMinor,
				payeeName: INCOME_PAYEE,
				categoryId: next.incomeCategoryId,
				memo: income.memo
			});
		}
	});
}

const hasTicks = (db: Db, userId: string, p: PaycheckRow) =>
	!!p.incomeTxnId ||
	!!db
		.select({ id: paycheckLine.id })
		.from(paycheckLine)
		.where(
			and(
				eq(paycheckLine.userId, userId),
				eq(paycheckLine.paycheckId, p.id),
				eq(paycheckLine.status, 'done')
			)
		)
		.get();

/** Delete a plan. Refused while anything on it is ticked. */
export function deletePaycheck(db: Db, userId: string, id: string) {
	const p = requirePaycheck(db, userId, id);
	if (hasTicks(db, userId, p)) {
		throw new ValidationError('Untick everything on this paycheck before deleting it');
	}
	db.transaction((tx) => {
		tx.delete(paycheckLine)
			.where(and(eq(paycheckLine.userId, userId), eq(paycheckLine.paycheckId, id)))
			.run();
		tx.delete(paycheck)
			.where(and(eq(paycheck.id, id), eq(paycheck.userId, userId)))
			.run();
	});
}

// ---------------------------------------------------------------------------
// Lines
// ---------------------------------------------------------------------------

export interface LineInput {
	kind: LineKind;
	/** Cents, >= 0. Bill lines default to the bill's amount. */
	amountMinor?: number;
	/** Defaults to the target account, category or bill name. */
	label?: string | null;
	/** Null means the paycheck's deposit account. Ignored for bills (snapshot from the bill). */
	fromAccountId?: string | null;
	toAccountId?: string | null;
	categoryId?: string | null;
	billId?: string | null;
	dueDate?: string | null;
}

export function getLine(db: Db, userId: string, id: string): LineRow | undefined {
	return db
		.select()
		.from(paycheckLine)
		.where(and(eq(paycheckLine.id, id), eq(paycheckLine.userId, userId)))
		.get();
}

function requireLine(db: Db, userId: string, id: string): LineRow {
	const line = getLine(db, userId, id);
	if (!line) throw new ValidationError('Line not found');
	return line;
}

function checkAmount(n: number | undefined): number {
	if (n === undefined || !Number.isSafeInteger(n) || n < 0) {
		throw new ValidationError('Enter an amount of zero or more');
	}
	return n;
}

function ownedAccount(db: Db, userId: string, id: string | null | undefined): AccountRow | null {
	if (!id) return null;
	const a = getAccount(db, userId, id);
	if (!a) throw new ValidationError('Unknown account');
	return a;
}

const isDebtAccount = (a: AccountRow) => a.type === 'credit' || a.type === 'loan';

/** Validate a line against the kind's rules and return the columns to store. */
function resolveLine(db: Db, userId: string, p: PaycheckRow, input: LineInput) {
	const label = input.label?.trim() || '';
	if (input.kind === 'bill') return resolveBillLine(db, userId, input, label);

	const amountMinor = checkAmount(input.amountMinor);
	const from = ownedAccount(db, userId, input.fromAccountId);
	const to = ownedAccount(db, userId, input.toAccountId);
	assertCategory(db, userId, input.categoryId);
	const fromId = from?.id ?? p.accountId;
	if (to && to.id === fromId) throw new ValidationError('Choose a different account');

	switch (input.kind) {
		case 'savings':
			if (!to) throw new ValidationError('Choose an account to save into');
			if (isDebtAccount(to)) throw new ValidationError('Use a debt line for cards and loans');
			if (to.id === p.accountId) throw new ValidationError('Choose a different account');
			break;
		case 'debt':
			if (!to) throw new ValidationError('Choose a card or loan to pay');
			if (!isDebtAccount(to)) throw new ValidationError('Debt payments go to a card or loan');
			break;
		case 'spending':
			if (to && to.type !== 'cash') {
				throw new ValidationError('Spending money can only be withdrawn to a cash account');
			}
			break;
		default:
			throw new ValidationError('Unknown kind of line');
	}

	const categoryName = input.categoryId ? getCategory(db, userId, input.categoryId)?.name : null;
	const fallback = input.kind === 'spending' ? categoryName : to?.name;
	if (!label && !fallback) throw new ValidationError('Give this line a name');
	return {
		kind: input.kind,
		label: label || fallback!,
		amountMinor,
		fromAccountId: from?.id ?? null,
		toAccountId: to?.id ?? null,
		categoryId: input.categoryId || null,
		billId: null,
		dueDate: null
	};
}

/** A bill line snapshots the bill; the occurrence can be in only one plan. */
function resolveBillLine(db: Db, userId: string, input: LineInput, label: string) {
	if (!input.billId || !input.dueDate) throw new ValidationError('Choose a bill');
	const bill = getBill(db, userId, input.billId);
	if (!bill) throw new ValidationError('Unknown bill');
	if (
		!isDate(input.dueDate) ||
		!nextOccurrences(bill, input.dueDate, addDays(input.dueDate, 1))[0]
	) {
		throw new ValidationError('That bill isn’t due on that date');
	}
	const taken = db
		.select({ id: paycheckLine.id })
		.from(paycheckLine)
		.where(
			and(
				eq(paycheckLine.userId, userId),
				eq(paycheckLine.billId, bill.id),
				eq(paycheckLine.dueDate, input.dueDate)
			)
		)
		.get();
	if (taken) throw new ValidationError('That bill is already in a plan');
	return {
		kind: 'bill' as const,
		label: label || bill.name,
		amountMinor: checkAmount(input.amountMinor ?? bill.amountMinor),
		fromAccountId: bill.accountId,
		toAccountId: bill.payToAccountId,
		categoryId: bill.categoryId,
		billId: bill.id,
		dueDate: input.dueDate
	};
}

/** Add a planned line to a paycheck. Returns its id. */
export function addLine(db: Db, userId: string, paycheckId: string, input: LineInput): string {
	const p = requirePaycheck(db, userId, paycheckId);
	const values = resolveLine(db, userId, p, input);
	const sort =
		(db
			.select({ m: max(paycheckLine.sort) })
			.from(paycheckLine)
			.where(and(eq(paycheckLine.userId, userId), eq(paycheckLine.paycheckId, paycheckId)))
			.get()?.m ?? -1) + 1;
	const id = newId();
	db.insert(paycheckLine)
		.values({ id, userId, paycheckId, sort, ...values })
		.run();
	return id;
}

export type LinePatch = Omit<Partial<LineInput>, 'kind' | 'billId' | 'dueDate'>;

/** Edit a planned line. Bill lines only change label and amount (the rest is the bill snapshot). */
export function updateLine(db: Db, userId: string, lineId: string, patch: LinePatch) {
	const line = requireLine(db, userId, lineId);
	if (line.status === 'done') throw new ValidationError('Untick this line before editing it');
	let values: Partial<LineRow>;
	if (line.kind === 'bill') {
		const label = patch.label !== undefined ? patch.label?.trim() : line.label;
		if (!label) throw new ValidationError('Give this line a name');
		values = { label, amountMinor: checkAmount(patch.amountMinor ?? line.amountMinor) };
	} else {
		const p = requirePaycheck(db, userId, line.paycheckId);
		const pick = <K extends keyof LinePatch>(k: K, current: LinePatch[K]) =>
			patch[k] !== undefined ? patch[k] : current;
		values = resolveLine(db, userId, p, {
			kind: line.kind,
			label: pick('label', line.label),
			amountMinor: pick('amountMinor', line.amountMinor),
			fromAccountId: pick('fromAccountId', line.fromAccountId),
			toAccountId: pick('toAccountId', line.toAccountId),
			categoryId: pick('categoryId', line.categoryId)
		});
	}
	db.update(paycheckLine)
		.set(values)
		.where(and(eq(paycheckLine.id, lineId), eq(paycheckLine.userId, userId)))
		.run();
}

/** Remove a planned line. */
export function removeLine(db: Db, userId: string, lineId: string) {
	const line = requireLine(db, userId, lineId);
	if (line.status === 'done') throw new ValidationError('Untick this line before removing it');
	db.delete(paycheckLine)
		.where(and(eq(paycheckLine.id, lineId), eq(paycheckLine.userId, userId)))
		.run();
}

function listLineRows(db: Db, userId: string, paycheckId: string): LineRow[] {
	return db
		.select()
		.from(paycheckLine)
		.where(and(eq(paycheckLine.userId, userId), eq(paycheckLine.paycheckId, paycheckId)))
		.orderBy(asc(paycheckLine.sort), asc(paycheckLine.createdAt))
		.all();
}

/** Turn whatever is left to allocate into one spending line. Returns its id. */
export function allocateLeftover(
	db: Db,
	userId: string,
	paycheckId: string,
	label = 'Spending money',
	categoryId: string | null = null
): string {
	const p = requirePaycheck(db, userId, paycheckId);
	const { left } = planTotals(p, listLineRows(db, userId, paycheckId));
	if (left <= 0) throw new ValidationError('Nothing left to allocate');
	return addLine(db, userId, paycheckId, {
		kind: 'spending',
		amountMinor: left,
		label: label.trim() || 'Spending money',
		categoryId
	});
}

// ---------------------------------------------------------------------------
// Confirming (ticking) income and lines
// ---------------------------------------------------------------------------

/** Refuse to remove a transaction (or its transfer partner) that has been reconciled. */
function assertNotReconciled(db: Db, userId: string, row: typeof txn.$inferSelect) {
	const partner = getTransferPartner(db, userId, row);
	if (row.reconciled || partner?.reconciled) {
		throw new ValidationError('That transaction is reconciled, so it can’t be unticked');
	}
}

/** Tick "Paycheck received": record the income on the deposit account. */
export function confirmIncome(db: Db, userId: string, paycheckId: string) {
	const p = requirePaycheck(db, userId, paycheckId);
	if (p.incomeTxnId) return;
	db.transaction((tx) => {
		const t = tx as unknown as Db;
		const txnId = createTransaction(t, userId, {
			accountId: p.accountId,
			date: p.date,
			amountMinor: p.amountMinor,
			payeeName: INCOME_PAYEE,
			categoryId: p.incomeCategoryId
		});
		t.update(paycheck)
			.set({ incomeTxnId: txnId })
			.where(and(eq(paycheck.id, p.id), eq(paycheck.userId, userId)))
			.run();
	});
}

/** Untick "Paycheck received": delete the income transaction. */
export function unconfirmIncome(db: Db, userId: string, paycheckId: string) {
	const p = requirePaycheck(db, userId, paycheckId);
	if (!p.incomeTxnId) return;
	const row = getTransaction(db, userId, p.incomeTxnId);
	if (row) assertNotReconciled(db, userId, row);
	db.transaction((tx) => {
		const t = tx as unknown as Db;
		if (row) deleteTransaction(t, userId, row.id);
		t.update(paycheck)
			.set({ incomeTxnId: null })
			.where(and(eq(paycheck.id, p.id), eq(paycheck.userId, userId)))
			.run();
	});
}

/**
 * Tick a line, creating its ledger transaction. Lines that move money to another account become
 * transfers; a bill without a pay-to account is an expense on its due date; earmarked spending
 * (no cash account) and $0 lines create nothing. `date` is used for everything except bills.
 */
export function confirmLine(db: Db, userId: string, lineId: string, date = today()) {
	const line = requireLine(db, userId, lineId);
	if (line.status === 'done') return;
	if (!isDate(date)) throw new ValidationError('Date must be YYYY-MM-DD');
	const p = requirePaycheck(db, userId, line.paycheckId);
	const from = line.fromAccountId ?? p.accountId;
	const when = line.kind === 'bill' ? (line.dueDate ?? date) : date;
	if ((line.kind === 'savings' || line.kind === 'debt') && !line.toAccountId) {
		throw new ValidationError('This line’s account no longer exists');
	}

	db.transaction((tx) => {
		const t = tx as unknown as Db;
		let txnId: string | null = null;
		const earmarked = line.kind === 'spending' && !line.toAccountId;
		if (!earmarked && line.amountMinor > 0) {
			txnId = createTransaction(
				t,
				userId,
				line.toAccountId
					? {
							accountId: from,
							date: when,
							amountMinor: -line.amountMinor,
							transferAccountId: line.toAccountId,
							categoryId: line.categoryId,
							memo: line.label
						}
					: {
							accountId: from,
							date: when,
							amountMinor: -line.amountMinor,
							payeeName: line.label,
							categoryId: line.categoryId
						}
			);
		}
		t.update(paycheckLine)
			.set({
				status: 'done',
				txnId,
				txnOrigin: txnId ? 'created' : null,
				doneAt: new Date()
			})
			.where(and(eq(paycheckLine.id, line.id), eq(paycheckLine.userId, userId)))
			.run();
	});
}

/**
 * Untick a line. A transaction the app created is deleted (both transfer legs) unless it is
 * reconciled; a linked one is only unlinked; one already deleted from the ledger just resets.
 */
export function unconfirmLine(db: Db, userId: string, lineId: string) {
	const line = requireLine(db, userId, lineId);
	if (line.status === 'planned') return;
	const row =
		line.txnId && line.txnOrigin !== 'linked' ? getTransaction(db, userId, line.txnId) : undefined;
	if (row) assertNotReconciled(db, userId, row);
	db.transaction((tx) => {
		const t = tx as unknown as Db;
		if (row) deleteTransaction(t, userId, row.id);
		t.update(paycheckLine)
			.set({ status: 'planned', txnId: null, txnOrigin: null, doneAt: null })
			.where(and(eq(paycheckLine.id, line.id), eq(paycheckLine.userId, userId)))
			.run();
	});
}

// ---------------------------------------------------------------------------
// Reading plans
// ---------------------------------------------------------------------------

export function paycheckStatus(
	incomeConfirmed: boolean,
	lineCount: number,
	doneCount: number
): PaycheckStatus {
	if (!incomeConfirmed && doneCount === 0) return 'planned';
	return incomeConfirmed && doneCount === lineCount ? 'confirmed' : 'partial';
}

export type LineDetail = LineRow & {
	/** The account money leaves: the line's own, else the deposit account. */
	effectiveFromAccountId: string;
	fromAccountName: string | null;
	toAccountName: string | null;
	categoryName: string | null;
	/** Spending lines with a category: expenses in that category during the paycheck's window. */
	spentMinor: number | null;
};

export interface ProjectedBalance {
	accountId: string;
	name: string;
	type: AccountRow['type'];
	before: number;
	after: number;
}

export type PaycheckDetail = PaycheckRow & {
	accountName: string;
	incomeCategoryName: string | null;
	incomeConfirmed: boolean;
	/** Exclusive end of the window this plan covers. */
	windowEnd: string;
	status: PaycheckStatus;
	lines: LineDetail[];
	totals: PlanTotals;
	/** Deposit account first, then accounts the plan touches, then the rest. */
	projected: ProjectedBalance[];
	/** Planned spending with no cash account: stays in the deposit account until spent. */
	spendingMoneyMinor: number;
	billsDue: BillOccurrence[];
};

/** Expense totals per category in `[from, to)`. */
function spentByCategory(db: Db, userId: string, ids: string[], from: string, to: string) {
	if (ids.length === 0) return new Map<string, number>();
	const rows = db
		.select({
			categoryId: txn.categoryId,
			spent: sql<number>`coalesce(-sum(${txn.amountMinor}), 0)`
		})
		.from(txn)
		.where(
			and(
				eq(txn.userId, userId),
				eq(txn.isParent, false),
				inArray(txn.categoryId, ids),
				lt(txn.amountMinor, 0),
				gte(txn.date, from),
				lt(txn.date, to)
			)
		)
		.groupBy(txn.categoryId)
		.all();
	return new Map(rows.map((r) => [r.categoryId!, r.spent]));
}

/** A plan with names, totals, projected balances, bills due in its window and spending so far. */
export function getPaycheck(db: Db, userId: string, id: string): PaycheckDetail | undefined {
	const p = getPaycheckRow(db, userId, id);
	if (!p) return undefined;
	const end = windowEnd(p);
	const accounts = listAccounts(db, userId, { includeArchived: true });
	const accountById = new Map(accounts.map((a) => [a.id, a]));
	const categoryName = (cid: string | null) =>
		cid ? (getCategory(db, userId, cid)?.name ?? null) : null;
	const rows = listLineRows(db, userId, id);
	const spent = spentByCategory(
		db,
		userId,
		[
			...new Set(
				rows.filter((l) => l.kind === 'spending' && l.categoryId).map((l) => l.categoryId!)
			)
		],
		p.date,
		end
	);

	const lines: LineDetail[] = rows.map((l) => {
		const fromId = l.fromAccountId ?? p.accountId;
		return {
			...l,
			effectiveFromAccountId: fromId,
			fromAccountName: accountById.get(fromId)?.name ?? null,
			toAccountName: l.toAccountId ? (accountById.get(l.toAccountId)?.name ?? null) : null,
			categoryName: categoryName(l.categoryId),
			spentMinor: l.kind === 'spending' && l.categoryId ? (spent.get(l.categoryId) ?? 0) : null
		};
	});

	const incomeConfirmed = !!p.incomeTxnId;
	const totals = planTotals(p, lines);
	const projection = projectBalances(
		{ accountId: p.accountId, amountMinor: p.amountMinor, incomeConfirmed },
		lines,
		new Map(accounts.map((a) => [a.id, a.balanceMinor]))
	);
	const touched = new Set(lines.flatMap((l) => [l.effectiveFromAccountId, l.toAccountId]));
	const rank = (aid: string) => (aid === p.accountId ? 0 : touched.has(aid) ? 1 : 2);
	const projected: ProjectedBalance[] = [];
	for (const [accountId, b] of projection) {
		const a = accountById.get(accountId);
		if (!a || (a.archivedAt && rank(accountId) === 2)) continue;
		projected.push({ accountId, name: a.name, type: a.type, before: b.before, after: b.after });
	}
	projected.sort((x, y) => {
		const ax = accountById.get(x.accountId)!;
		const ay = accountById.get(y.accountId)!;
		return (
			rank(x.accountId) - rank(y.accountId) || ax.sort - ay.sort || x.name.localeCompare(y.name)
		);
	});

	return {
		...p,
		accountName: accountById.get(p.accountId)?.name ?? '',
		incomeCategoryName: categoryName(p.incomeCategoryId),
		incomeConfirmed,
		windowEnd: end,
		status: paycheckStatus(
			incomeConfirmed,
			totals.doneCount + totals.plannedCount,
			totals.doneCount
		),
		lines,
		totals,
		projected,
		spendingMoneyMinor: lines
			.filter((l) => l.kind === 'spending' && !l.toAccountId && l.status === 'planned')
			.reduce((a, l) => a + l.amountMinor, 0),
		billsDue: billsDueBetween(db, userId, p.date, end)
	};
}

export interface PaycheckSummary {
	id: string;
	date: string;
	nextDate: string | null;
	amountMinor: number;
	accountId: string;
	allocatedMinor: number;
	leftMinor: number;
	lineCount: number;
	doneCount: number;
	incomeConfirmed: boolean;
	status: PaycheckStatus;
}

/** Most recent paychecks first, with totals and status. */
export function listPaychecks(
	db: Db,
	userId: string,
	{ limit = 24 }: { limit?: number } = {}
): PaycheckSummary[] {
	const rows = db
		.select({
			p: paycheck,
			allocated: sql<number>`coalesce(sum(${paycheckLine.amountMinor}), 0)`,
			lineCount: sql<number>`count(${paycheckLine.id})`,
			doneCount: sql<number>`coalesce(sum(case when ${paycheckLine.status} = 'done' then 1 else 0 end), 0)`
		})
		.from(paycheck)
		.leftJoin(
			paycheckLine,
			and(eq(paycheckLine.paycheckId, paycheck.id), eq(paycheckLine.userId, userId))
		)
		.where(eq(paycheck.userId, userId))
		.groupBy(paycheck.id)
		.orderBy(desc(paycheck.date), desc(paycheck.createdAt))
		.limit(limit)
		.all();
	return rows.map(({ p, allocated, lineCount, doneCount }) => {
		const incomeConfirmed = !!p.incomeTxnId;
		return {
			id: p.id,
			date: p.date,
			nextDate: p.nextDate,
			amountMinor: p.amountMinor,
			accountId: p.accountId,
			allocatedMinor: allocated,
			leftMinor: p.amountMinor - allocated,
			lineCount,
			doneCount,
			incomeConfirmed,
			status: paycheckStatus(incomeConfirmed, lineCount, doneCount)
		};
	});
}

/**
 * Which plan the home page shows: the earliest one that is unconfirmed or still ahead, else the
 * latest. Pure; `summaries` in any order.
 */
export function pickHomePaycheck<T extends { date: string; status: PaycheckStatus }>(
	summaries: T[],
	todayDate: string
): T | null {
	const byDate = [...summaries].sort((a, b) => a.date.localeCompare(b.date));
	return (
		byDate.find((s) => s.status !== 'confirmed' || s.date >= todayDate) ??
		byDate[byDate.length - 1] ??
		null
	);
}

export interface PaycheckSuggestion {
	date: string;
	nextDate: string;
	/** Null when there is no pay schedule to take a typical amount from. */
	amountMinor: number | null;
	accountId: string | null;
	incomeCategoryId: string | null;
}

/** Defaults for the next new paycheck: the next payday without a plan, per the schedule. */
export function suggestNextPaycheck(
	db: Db,
	userId: string,
	todayDate = today()
): PaycheckSuggestion {
	const schedule = getPaySchedule(db, userId);
	const fallbackAccount =
		listAccounts(db, userId).find((a) => a.type === 'checking') ?? listAccounts(db, userId)[0];
	if (!schedule) {
		return {
			date: todayDate,
			nextDate: addDays(todayDate, DEFAULT_WINDOW_DAYS),
			amountMinor: null,
			accountId: fallbackAccount?.id ?? null,
			incomeCategoryId: defaultIncomeCategoryId(db, userId)
		};
	}
	const planned = new Set(
		db
			.select({ date: paycheck.date })
			.from(paycheck)
			.where(and(eq(paycheck.userId, userId), gte(paycheck.date, todayDate)))
			.all()
			.map((r) => r.date)
	);
	let date = paydayOnOrAfter(schedule, todayDate);
	while (planned.has(date)) date = nextPayday(schedule, date);
	return {
		date,
		nextDate: nextPayday(schedule, date),
		amountMinor: schedule.amountMinor,
		accountId: schedule.depositAccountId ?? fallbackAccount?.id ?? null,
		incomeCategoryId: schedule.incomeCategoryId ?? defaultIncomeCategoryId(db, userId)
	};
}

import { addDays, dayDiff } from '$lib/month';
import { and, eq, gte, inArray, isNotNull, isNull, lte } from 'drizzle-orm';
import type { Db } from '../db/client';
import { category, payee, paycheck, paycheckLine, txn } from '../db/schema';
import { newId } from '../id';
import {
	getTransaction,
	getTransferPartner,
	transferLegCategory,
	ValidationError,
	type TxnRow,
	type TxnSource
} from './transactions';

/**
 * Linking bank-synced transactions to a plan (§5.8): instead of ticking a line (which creates a
 * transaction), the user can point it at a transaction that arrived from an import or bank sync.
 */

/** A synced transaction that looks like a planned line being paid. */
export interface LineMatch {
	lineId: string;
	txnId: string;
	/** For a transfer line matched by two separate synced rows: the deposit on the `to` account. */
	partnerTxnId?: string;
	date: string;
	/** As on the transaction (negative for money leaving the account). */
	amountMinor: number;
	payeeName: string | null;
	description: string | null;
}

/** A synced deposit that looks like the paycheck arriving. */
export interface IncomeMatch {
	txnId: string;
	date: string;
	amountMinor: number;
	payeeName: string | null;
	description: string | null;
}

type PaycheckRow = typeof paycheck.$inferSelect;
type LineRow = typeof paycheckLine.$inferSelect;
type Candidate = TxnRow & { payeeName: string | null };

/** How far (in days) a transaction's date may be from the expected date. */
export const MATCH_WINDOW_DAYS = 3;
const SYNCED: TxnSource[] = ['csv', 'ofx', 'simplefin'];
const isSynced = (t: TxnRow) => SYNCED.includes(t.source);

/** Whether a line would create a transaction when ticked (earmarked spending and $0 lines don't). */
const createsTransaction = (l: LineRow) =>
	l.amountMinor > 0 && !(l.kind === 'spending' && !l.toAccountId);

/** The date a line's money is expected to move: the bill's due date, else payday. */
const expectedDate = (l: LineRow, p: PaycheckRow) => l.dueDate ?? p.date;

const within = (expected: string, date: string) =>
	Math.abs(dayDiff(expected, date)) <= MATCH_WINDOW_DAYS;

/**
 * Transactions already tied to some plan: ids referenced by any line or paycheck of this user,
 * plus the transfer ids of those rows (so the other leg of a linked transfer isn't offered).
 */
function referenced(db: Db, userId: string) {
	const ids = new Set<string>();
	for (const r of db
		.select({ id: paycheckLine.txnId })
		.from(paycheckLine)
		.where(and(eq(paycheckLine.userId, userId), isNotNull(paycheckLine.txnId)))
		.all()) {
		ids.add(r.id!);
	}
	for (const r of db
		.select({ id: paycheck.incomeTxnId })
		.from(paycheck)
		.where(and(eq(paycheck.userId, userId), isNotNull(paycheck.incomeTxnId)))
		.all()) {
		ids.add(r.id!);
	}
	const transferIds = new Set<string>();
	if (ids.size) {
		for (const r of db
			.select({ transferId: txn.transferId })
			.from(txn)
			.where(and(eq(txn.userId, userId), inArray(txn.id, [...ids]), isNotNull(txn.transferId)))
			.all()) {
			transferIds.add(r.transferId!);
		}
	}
	return {
		has: (t: TxnRow) => ids.has(t.id) || (!!t.transferId && transferIds.has(t.transferId))
	};
}

/** Synced, unsplit transactions dated in `[from, to]`, with payee names. */
function candidates(db: Db, userId: string, from: string, to: string): Candidate[] {
	return db
		.select({ t: txn, payeeName: payee.name })
		.from(txn)
		.leftJoin(payee, eq(payee.id, txn.payeeId))
		.where(
			and(
				eq(txn.userId, userId),
				inArray(txn.source, SYNCED),
				isNull(txn.parentId),
				gte(txn.date, from),
				lte(txn.date, to)
			)
		)
		.all()
		.map((r) => ({ ...r.t, payeeName: r.payeeName }));
}

function paycheckRow(db: Db, userId: string, id: string): PaycheckRow | undefined {
	return db
		.select()
		.from(paycheck)
		.where(and(eq(paycheck.id, id), eq(paycheck.userId, userId)))
		.get();
}

function plannedLines(db: Db, userId: string, paycheckId: string): LineRow[] {
	return db
		.select()
		.from(paycheckLine)
		.where(
			and(
				eq(paycheckLine.userId, userId),
				eq(paycheckLine.paycheckId, paycheckId),
				eq(paycheckLine.status, 'planned')
			)
		)
		.all();
}

/**
 * Suggestions for a plan's planned lines and its income. Each transaction is suggested at most
 * once: pairs are assigned closest-date first.
 */
export function suggestMatches(
	db: Db,
	userId: string,
	paycheckId: string
): { lines: Record<string, LineMatch>; income: IncomeMatch | null } {
	const result: { lines: Record<string, LineMatch>; income: IncomeMatch | null } = {
		lines: {},
		income: null
	};
	const p = paycheckRow(db, userId, paycheckId);
	if (!p) return result;
	const lines = plannedLines(db, userId, paycheckId).filter(createsTransaction);
	const dates = [p.date, ...lines.map((l) => expectedDate(l, p))].sort();
	const pool = candidates(
		db,
		userId,
		addDays(dates[0], -MATCH_WINDOW_DAYS),
		addDays(dates[dates.length - 1], MATCH_WINDOW_DAYS)
	);
	if (!pool.length) return result;
	const taken = referenced(db, userId);
	const free = pool.filter((t) => !taken.has(t));

	type Option = { line: LineRow; txn: Candidate; partnerId?: string; dist: number };
	const options: Option[] = [];
	for (const line of lines) {
		const expected = expectedDate(line, p);
		const from = line.fromAccountId ?? p.accountId;
		const outflows = free.filter(
			(t) =>
				t.accountId === from &&
				t.amountMinor === -line.amountMinor &&
				!t.isParent &&
				within(expected, t.date)
		);
		for (const t of outflows) {
			const dist = Math.abs(dayDiff(expected, t.date));
			if (!line.toAccountId) {
				if (!t.transferId) options.push({ line, txn: t, dist });
			} else if (t.transferId) {
				// Already a transfer: its other leg must land on the line's target account.
				if (getTransferPartner(db, userId, t)?.accountId === line.toAccountId) {
					options.push({ line, txn: t, dist });
				}
			} else {
				// Bank sync brings both legs as separate rows: find the matching deposit.
				const deposit = free
					.filter(
						(d) =>
							d.accountId === line.toAccountId &&
							d.amountMinor === line.amountMinor &&
							!d.transferId &&
							!d.isParent &&
							within(expected, d.date)
					)
					.sort((a, b) => Math.abs(dayDiff(t.date, a.date)) - Math.abs(dayDiff(t.date, b.date)))[0];
				if (deposit) options.push({ line, txn: t, partnerId: deposit.id, dist });
			}
		}
	}
	options.sort(
		(a, b) => a.dist - b.dist || a.line.sort - b.line.sort || a.txn.date.localeCompare(b.txn.date)
	);
	const used = new Set<string>();
	for (const o of options) {
		if (result.lines[o.line.id] || used.has(o.txn.id) || (o.partnerId && used.has(o.partnerId))) {
			continue;
		}
		used.add(o.txn.id);
		if (o.partnerId) used.add(o.partnerId);
		result.lines[o.line.id] = {
			lineId: o.line.id,
			txnId: o.txn.id,
			...(o.partnerId ? { partnerTxnId: o.partnerId } : {}),
			date: o.txn.date,
			amountMinor: o.txn.amountMinor,
			payeeName: o.txn.payeeName,
			description: o.txn.description
		};
	}

	if (!p.incomeTxnId) {
		const incomeCats = incomeCategoryIds(db, userId);
		const deposit = free
			.filter(
				(t) =>
					!used.has(t.id) &&
					t.accountId === p.accountId &&
					t.amountMinor === p.amountMinor &&
					!t.transferId &&
					!t.isParent &&
					(!t.categoryId || incomeCats.has(t.categoryId)) &&
					within(p.date, t.date)
			)
			.sort((a, b) => Math.abs(dayDiff(p.date, a.date)) - Math.abs(dayDiff(p.date, b.date)))[0];
		if (deposit) {
			result.income = {
				txnId: deposit.id,
				date: deposit.date,
				amountMinor: deposit.amountMinor,
				payeeName: deposit.payeeName,
				description: deposit.description
			};
		}
	}
	return result;
}

function incomeCategoryIds(db: Db, userId: string) {
	return new Set(
		db
			.select({ id: category.id })
			.from(category)
			.where(and(eq(category.userId, userId), eq(category.isIncome, true)))
			.all()
			.map((c) => c.id)
	);
}

/** At most one suggestion per planned line that looks paid (see `suggestMatches`). */
export function suggestLineMatches(db: Db, userId: string, paycheckId: string): LineMatch[] {
	return Object.values(suggestMatches(db, userId, paycheckId).lines);
}

/** A synced deposit that looks like this paycheck, if it hasn't been received yet. */
export function suggestIncomeMatch(db: Db, userId: string, paycheckId: string): IncomeMatch | null {
	return suggestMatches(db, userId, paycheckId).income;
}

/** Load a transaction for linking and apply the checks every link shares. */
function linkable(db: Db, userId: string, id: string | null | undefined): TxnRow {
	const t = id ? getTransaction(db, userId, id) : undefined;
	if (!t || t.parentId) throw new ValidationError('Transaction not found');
	if (!isSynced(t)) throw new ValidationError('Only imported or synced transactions can be linked');
	if (t.isParent) throw new ValidationError('Split transactions can’t be linked');
	if (referenced(db, userId).has(t)) {
		throw new ValidationError('That transaction is already linked to a plan');
	}
	return t;
}

/**
 * Tick a line by linking an existing synced transaction instead of creating one. For a transfer
 * line, either the transaction is already a transfer to the line's account, or `partnerTxnId`
 * names the separate deposit on that account and the two rows become one transfer.
 */
export function linkLine(
	db: Db,
	userId: string,
	lineId: string,
	txnId: string,
	partnerTxnId?: string | null
) {
	const line = db
		.select()
		.from(paycheckLine)
		.where(and(eq(paycheckLine.id, lineId), eq(paycheckLine.userId, userId)))
		.get();
	if (!line) throw new ValidationError('Line not found');
	if (line.status === 'done') throw new ValidationError('This line is already ticked');
	if (!createsTransaction(line)) throw new ValidationError('This line has nothing to link');
	const p = paycheckRow(db, userId, line.paycheckId)!;
	const from = line.fromAccountId ?? p.accountId;

	const t = linkable(db, userId, txnId);
	if (t.accountId !== from) throw new ValidationError('That transaction is on a different account');
	if (t.amountMinor !== -line.amountMinor) throw new ValidationError('The amounts don’t match');

	let partner: TxnRow | undefined;
	let pairUp = false;
	if (!line.toAccountId) {
		if (t.transferId) throw new ValidationError('That transaction is a transfer');
		if (partnerTxnId) throw new ValidationError('This line isn’t a transfer');
	} else if (t.transferId) {
		partner = getTransferPartner(db, userId, t);
		if (partner?.accountId !== line.toAccountId) {
			throw new ValidationError('That transfer goes to a different account');
		}
		if (partnerTxnId && partnerTxnId !== partner.id) {
			throw new ValidationError('That transfer goes to a different account');
		}
	} else {
		if (!partnerTxnId || partnerTxnId === t.id) {
			throw new ValidationError('Choose the matching deposit');
		}
		partner = linkable(db, userId, partnerTxnId);
		if (partner.accountId !== line.toAccountId) {
			throw new ValidationError('The deposit is on a different account');
		}
		if (partner.amountMinor !== line.amountMinor) {
			throw new ValidationError('The amounts don’t match');
		}
		if (partner.transferId) throw new ValidationError('The deposit is already a transfer');
		pairUp = true;
	}

	db.transaction((tx) => {
		const d = tx as unknown as Db;
		const setCategory = (id: string, categoryId: string | null) =>
			d
				.update(txn)
				.set({ categoryId })
				.where(and(eq(txn.id, id), eq(txn.userId, userId)))
				.run();
		if (pairUp && partner) {
			const transferId = newId();
			for (const [row, other] of [
				[t, partner],
				[partner, t]
			] as const) {
				d.update(txn)
					.set({
						transferId,
						categoryId: transferLegCategory(
							d,
							userId,
							row.accountId,
							other.accountId,
							line.categoryId
						)
					})
					.where(and(eq(txn.id, row.id), eq(txn.userId, userId)))
					.run();
			}
		} else if (!t.categoryId) {
			const categoryId = line.toAccountId
				? transferLegCategory(d, userId, t.accountId, line.toAccountId, line.categoryId)
				: line.categoryId;
			if (categoryId) setCategory(t.id, categoryId);
		}
		d.update(paycheckLine)
			.set({ status: 'done', txnId: t.id, txnOrigin: 'linked', doneAt: new Date() })
			.where(and(eq(paycheckLine.id, line.id), eq(paycheckLine.userId, userId)))
			.run();
	});
}

/** Tick "Paycheck received" by linking a synced deposit instead of recording a new one. */
export function linkIncome(db: Db, userId: string, paycheckId: string, txnId: string) {
	const p = paycheckRow(db, userId, paycheckId);
	if (!p) throw new ValidationError('Paycheck not found');
	if (p.incomeTxnId) throw new ValidationError('This paycheck is already received');
	const t = linkable(db, userId, txnId);
	if (t.accountId !== p.accountId) {
		throw new ValidationError('That transaction is on a different account');
	}
	if (t.amountMinor !== p.amountMinor) throw new ValidationError('The amounts don’t match');
	if (t.transferId) throw new ValidationError('That transaction is a transfer');
	if (t.categoryId && !incomeCategoryIds(db, userId).has(t.categoryId)) {
		throw new ValidationError('That transaction isn’t income');
	}
	db.transaction((tx) => {
		const d = tx as unknown as Db;
		if (!t.categoryId && p.incomeCategoryId) {
			d.update(txn)
				.set({ categoryId: p.incomeCategoryId })
				.where(and(eq(txn.id, t.id), eq(txn.userId, userId)))
				.run();
		}
		d.update(paycheck)
			.set({ incomeTxnId: t.id })
			.where(and(eq(paycheck.id, p.id), eq(paycheck.userId, userId)))
			.run();
	});
}

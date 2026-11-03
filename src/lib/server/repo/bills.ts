import { isDate, today } from '$lib/month';
import { nextOccurrence, nextOccurrences } from '$lib/planner/occurrences';
import { and, asc, eq, gte, inArray, lt } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import type { Db } from '../db/client';
import {
	BILL_FREQUENCIES,
	category,
	finAccount,
	paycheckLine,
	recurringBill,
	type BillFrequency
} from '../db/schema';
import { newId } from '../id';
import { getAccount } from './accounts';
import { assertCategory, ValidationError } from './transactions';

export type BillRow = typeof recurringBill.$inferSelect;

export interface BillInput {
	name: string;
	/** Positive cents. */
	amountMinor: number;
	frequency: BillFrequency;
	dayOfMonth?: number | null;
	monthOfYear?: number | null;
	intervalWeeks?: number | null;
	startDate: string;
	endedAt?: string | null;
	/** Paid from. */
	accountId: string;
	categoryId?: string | null;
	/** Credit card or loan this bill pays down. */
	payToAccountId?: string | null;
}

const inRange = (n: number | null | undefined, lo: number, hi: number): n is number =>
	Number.isInteger(n) && n! >= lo && n! <= hi;

/** Validate and normalise a bill: fields that don't apply to the frequency are stored as null. */
function billValues(db: Db, userId: string, input: BillInput) {
	const name = input.name.trim();
	if (!name) throw new ValidationError('Give the bill a name');
	if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
		throw new ValidationError('Amount must be more than zero');
	}
	if (!BILL_FREQUENCIES.includes(input.frequency)) throw new ValidationError('Choose how often');
	if (!isDate(input.startDate)) throw new ValidationError('First due date must be YYYY-MM-DD');
	const endedAt = input.endedAt || null;
	if (endedAt && !isDate(endedAt)) throw new ValidationError('End date must be YYYY-MM-DD');
	if (endedAt && endedAt < input.startDate) {
		throw new ValidationError('End date cannot be before the first due date');
	}

	const f = input.frequency;
	const monthlyish = f === 'monthly' || f === 'yearly';
	if (monthlyish && !inRange(input.dayOfMonth, 1, 31)) {
		throw new ValidationError('Day of month must be 1 to 31');
	}
	if (f === 'yearly' && !inRange(input.monthOfYear, 1, 12)) {
		throw new ValidationError('Month must be 1 to 12');
	}
	if (f === 'every_n_weeks' && !inRange(input.intervalWeeks, 1, 52)) {
		throw new ValidationError('Weeks must be 1 to 52');
	}

	if (!getAccount(db, userId, input.accountId)) throw new ValidationError('Unknown account');
	assertCategory(db, userId, input.categoryId);
	const payTo = input.payToAccountId || null;
	if (payTo) {
		const target = getAccount(db, userId, payTo);
		if (!target) throw new ValidationError('Unknown account');
		if (target.type !== 'credit' && target.type !== 'loan') {
			throw new ValidationError('A bill can only pay off a credit card or loan');
		}
		if (payTo === input.accountId) {
			throw new ValidationError('A bill cannot pay off the account it is paid from');
		}
	}

	return {
		name,
		amountMinor: input.amountMinor,
		frequency: f,
		dayOfMonth: monthlyish ? input.dayOfMonth! : null,
		monthOfYear: f === 'yearly' ? input.monthOfYear! : null,
		intervalWeeks: f === 'every_n_weeks' ? input.intervalWeeks! : null,
		startDate: input.startDate,
		endedAt,
		accountId: input.accountId,
		categoryId: input.categoryId || null,
		payToAccountId: payTo
	};
}

export function getBill(db: Db, userId: string, id: string): BillRow | undefined {
	return db
		.select()
		.from(recurringBill)
		.where(and(eq(recurringBill.id, id), eq(recurringBill.userId, userId)))
		.get();
}

export function createBill(db: Db, userId: string, input: BillInput): string {
	const values = billValues(db, userId, input);
	const id = newId();
	db.insert(recurringBill)
		.values({ id, userId, ...values })
		.run();
	return id;
}

/** Edit a bill. Lines already in plans keep their snapshot. */
export function updateBill(db: Db, userId: string, id: string, input: BillInput) {
	if (!getBill(db, userId, id)) throw new ValidationError('Bill not found');
	const values = billValues(db, userId, input);
	db.update(recurringBill)
		.set(values)
		.where(and(eq(recurringBill.id, id), eq(recurringBill.userId, userId)))
		.run();
}

/** Stop a bill: `endedAt` is its last due date (inclusive). */
export function endBill(db: Db, userId: string, id: string, endedAt: string) {
	const bill = getBill(db, userId, id);
	if (!bill) throw new ValidationError('Bill not found');
	if (!isDate(endedAt)) throw new ValidationError('End date must be YYYY-MM-DD');
	if (endedAt < bill.startDate) {
		throw new ValidationError('End date cannot be before the first due date');
	}
	db.update(recurringBill)
		.set({ endedAt })
		.where(and(eq(recurringBill.id, id), eq(recurringBill.userId, userId)))
		.run();
}

/** Delete a bill and its still-planned lines; done lines keep their snapshot (bill_id → null). */
export function deleteBill(db: Db, userId: string, id: string) {
	db.transaction((tx) => {
		tx.delete(paycheckLine)
			.where(
				and(
					eq(paycheckLine.userId, userId),
					eq(paycheckLine.billId, id),
					eq(paycheckLine.status, 'planned')
				)
			)
			.run();
		tx.delete(recurringBill)
			.where(and(eq(recurringBill.id, id), eq(recurringBill.userId, userId)))
			.run();
	});
}

const payTo = alias(finAccount, 'pay_to');

/** Bills joined with their account, category and pay-to names. */
function billsWithNames(db: Db, userId: string) {
	return db
		.select({
			bill: recurringBill,
			accountName: finAccount.name,
			categoryName: category.name,
			payToAccountName: payTo.name
		})
		.from(recurringBill)
		.innerJoin(finAccount, eq(finAccount.id, recurringBill.accountId))
		.leftJoin(category, eq(category.id, recurringBill.categoryId))
		.leftJoin(payTo, eq(payTo.id, recurringBill.payToAccountId))
		.where(eq(recurringBill.userId, userId))
		.orderBy(asc(recurringBill.name))
		.all()
		.map((r) => ({
			...r.bill,
			accountName: r.accountName,
			categoryName: r.categoryName,
			payToAccountName: r.payToAccountName
		}));
}

export type BillListItem = ReturnType<typeof billsWithNames>[number] & {
	/** Next due date on or after `asOf`; null once the bill has ended. */
	nextDue: string | null;
	ended: boolean;
};

/** Bills by name with their next due date. Ended bills (no more due dates) only on request. */
export function listBills(
	db: Db,
	userId: string,
	{ includeEnded = false, asOf = today() }: { includeEnded?: boolean; asOf?: string } = {}
): BillListItem[] {
	return billsWithNames(db, userId)
		.map((b) => {
			const nextDue = nextOccurrence(b, asOf);
			return { ...b, nextDue, ended: nextDue === null };
		})
		.filter((b) => includeEnded || !b.ended);
}

export interface BillOccurrence {
	billId: string;
	name: string;
	amountMinor: number;
	dueDate: string;
	accountId: string;
	accountName: string;
	categoryId: string | null;
	categoryName: string | null;
	payToAccountId: string | null;
	payToAccountName: string | null;
	/** Set when this occurrence is already a line in one of the user's plans. */
	plannedLineId: string | null;
	plannedPaycheckId: string | null;
}

/** Every bill occurrence due in `[from, to)`, by due date then name, marked when already planned. */
export function billsDueBetween(
	db: Db,
	userId: string,
	from: string,
	to: string
): BillOccurrence[] {
	const occurrences = billsWithNames(db, userId).flatMap((b) =>
		nextOccurrences(b, from, to).map((dueDate) => ({ b, dueDate }))
	);
	if (occurrences.length === 0) return [];

	const planned = db
		.select({
			id: paycheckLine.id,
			paycheckId: paycheckLine.paycheckId,
			billId: paycheckLine.billId,
			dueDate: paycheckLine.dueDate
		})
		.from(paycheckLine)
		.where(
			and(
				eq(paycheckLine.userId, userId),
				inArray(paycheckLine.billId, [...new Set(occurrences.map((o) => o.b.id))]),
				gte(paycheckLine.dueDate, from),
				lt(paycheckLine.dueDate, to)
			)
		)
		.all();
	const byKey = new Map(planned.map((p) => [`${p.billId}|${p.dueDate}`, p]));

	return occurrences
		.map(({ b, dueDate }) => {
			const line = byKey.get(`${b.id}|${dueDate}`);
			return {
				billId: b.id,
				name: b.name,
				amountMinor: b.amountMinor,
				dueDate,
				accountId: b.accountId,
				accountName: b.accountName,
				categoryId: b.categoryId,
				categoryName: b.categoryName,
				payToAccountId: b.payToAccountId,
				payToAccountName: b.payToAccountName,
				plannedLineId: line?.id ?? null,
				plannedPaycheckId: line?.paycheckId ?? null
			};
		})
		.sort((a, c) => a.dueDate.localeCompare(c.dueDate) || a.name.localeCompare(c.name));
}

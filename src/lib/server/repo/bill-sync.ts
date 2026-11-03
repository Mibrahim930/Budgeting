import { addDays } from '$lib/month';
import { nextOccurrences } from '$lib/planner/occurrences';
import { and, eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { paycheckLine, recurringBill } from '../db/schema';
import { addLine, getPaycheckRow, listPaychecks, windowEnd } from './paychecks';

/** A bill line that `syncBillIntoPlans` added to a plan. */
export interface AddedBillLine {
	paycheckId: string;
	lineId: string;
	dueDate: string;
}

/** Enough paychecks to cover every plan a person could still have open. */
const ALL_PLANS = 100_000;

/**
 * Keep a bill's planned lines in step with the bill, and put its due dates into every open plan
 * (any paycheck not fully confirmed) whose window `[date, windowEnd)` contains them.
 *
 * - Planned lines whose due date is no longer an occurrence, or no longer inside their plan's
 *   window, are removed; the rest are refreshed from the bill (name, amount, accounts, category).
 * - Occurrences that aren't in any plan yet are added through `addLine`, earliest plan first.
 * - Done lines are never touched.
 *
 * Call it inside the transaction that wrote the bill.
 */
export function syncBillIntoPlans(db: Db, userId: string, billId: string): AddedBillLine[] {
	const bill = db
		.select()
		.from(recurringBill)
		.where(and(eq(recurringBill.id, billId), eq(recurringBill.userId, userId)))
		.get();
	if (!bill) return [];

	const isOccurrence = (date: string) => nextOccurrences(bill, date, addDays(date, 1)).length > 0;

	const planned = db
		.select()
		.from(paycheckLine)
		.where(
			and(
				eq(paycheckLine.userId, userId),
				eq(paycheckLine.billId, billId),
				eq(paycheckLine.status, 'planned')
			)
		)
		.all();
	for (const line of planned) {
		const p = getPaycheckRow(db, userId, line.paycheckId);
		const due = line.dueDate;
		const where = and(eq(paycheckLine.id, line.id), eq(paycheckLine.userId, userId));
		if (!p || !due || !isOccurrence(due) || due < p.date || due >= windowEnd(p)) {
			db.delete(paycheckLine).where(where).run();
			continue;
		}
		db.update(paycheckLine)
			.set({
				label: bill.name,
				amountMinor: bill.amountMinor,
				fromAccountId: bill.accountId,
				toAccountId: bill.payToAccountId,
				categoryId: bill.categoryId
			})
			.where(where)
			.run();
	}

	const taken = new Set(
		db
			.select({ dueDate: paycheckLine.dueDate })
			.from(paycheckLine)
			.where(and(eq(paycheckLine.userId, userId), eq(paycheckLine.billId, billId)))
			.all()
			.map((r) => r.dueDate)
	);
	const open = listPaychecks(db, userId, { limit: ALL_PLANS })
		.filter((p) => p.status !== 'confirmed')
		.sort((a, b) => a.date.localeCompare(b.date));

	const added: AddedBillLine[] = [];
	for (const p of open) {
		for (const dueDate of nextOccurrences(bill, p.date, windowEnd(p))) {
			if (taken.has(dueDate)) continue;
			const lineId = addLine(db, userId, p.id, { kind: 'bill', billId, dueDate });
			taken.add(dueDate);
			added.push({ paycheckId: p.id, lineId, dueDate });
		}
	}
	return added;
}

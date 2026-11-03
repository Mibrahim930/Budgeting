import { addMonths, monthsBetween } from '$lib/month';
import { and, desc, eq, gte, inArray, isNotNull, lt, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import {
	category,
	categoryGroup,
	finAccount,
	paycheck,
	paycheckLine,
	txn,
	type LineKind
} from '../db/schema';
import { monthRange } from './transactions';

const budgetRows = (userId: string, from: string, to: string) =>
	and(
		eq(txn.userId, userId),
		eq(finAccount.onBudget, true),
		eq(txn.isParent, false),
		isNotNull(txn.categoryId),
		gte(txn.date, monthRange(from)[0]),
		lt(txn.date, monthRange(to)[1])
	);

/** Net spending per expense category between two months (inclusive), largest first. */
export function spendingByCategory(db: Db, userId: string, from: string, to: string) {
	return db
		.select({
			categoryId: category.id,
			name: category.name,
			groupName: categoryGroup.name,
			spent: sql<number>`-sum(${txn.amountMinor})`
		})
		.from(txn)
		.innerJoin(finAccount, eq(finAccount.id, txn.accountId))
		.innerJoin(category, eq(category.id, txn.categoryId))
		.innerJoin(categoryGroup, eq(categoryGroup.id, category.groupId))
		.where(and(budgetRows(userId, from, to), eq(category.isIncome, false)))
		.groupBy(category.id)
		.all()
		.filter((r) => r.spent > 0)
		.sort((a, b) => b.spent - a.spent);
}

/** Income and spending per month for the months ending at `to`. */
export function incomeVsSpending(db: Db, userId: string, to: string, months: number) {
	const from = addMonths(to, -(months - 1));
	const month = sql<string>`substr(${txn.date}, 1, 7)`;
	const rows = db
		.select({
			month,
			income: sql<number>`coalesce(sum(case when ${category.isIncome} then ${txn.amountMinor} else 0 end), 0)`,
			spending: sql<number>`coalesce(-sum(case when ${category.isIncome} then 0 else ${txn.amountMinor} end), 0)`
		})
		.from(txn)
		.innerJoin(finAccount, eq(finAccount.id, txn.accountId))
		.innerJoin(category, eq(category.id, txn.categoryId))
		.where(budgetRows(userId, from, to))
		.groupBy(month)
		.all();
	return monthsBetween(from, to).map((m) => {
		const r = rows.find((x) => x.month === m);
		return { month: m, income: r?.income ?? 0, spending: r?.spending ?? 0 };
	});
}

/** Cents per line kind (`bill` lines are reported as `bills`). */
export interface KindTotals {
	savings: number;
	debt: number;
	bills: number;
	spending: number;
}

export interface PaycheckBreakdown {
	id: string;
	date: string;
	amountMinor: number;
	/** Every line, ticked or not. */
	planned: KindTotals;
	/** Ticked lines only: the transaction's size when there is one, else the line amount. */
	actual: KindTotals;
	/** Pay minus everything planned; negative when over-allocated. */
	unallocated: number;
}

const KIND_KEY: Record<LineKind, keyof KindTotals> = {
	savings: 'savings',
	debt: 'debt',
	bill: 'bills',
	spending: 'spending'
};

const emptyTotals = (): KindTotals => ({ savings: 0, debt: 0, bills: 0, spending: 0 });

/** Where each of the latest `limit` paychecks went, newest first: planned vs confirmed per kind. */
export function paycheckBreakdown(db: Db, userId: string, limit = 12): PaycheckBreakdown[] {
	const checks = db
		.select({ id: paycheck.id, date: paycheck.date, amountMinor: paycheck.amountMinor })
		.from(paycheck)
		.where(eq(paycheck.userId, userId))
		.orderBy(desc(paycheck.date), desc(paycheck.createdAt))
		.limit(limit)
		.all();
	if (checks.length === 0) return [];

	const sums = db
		.select({
			paycheckId: paycheckLine.paycheckId,
			kind: paycheckLine.kind,
			planned: sql<number>`coalesce(sum(${paycheckLine.amountMinor}), 0)`,
			actual: sql<number>`coalesce(sum(case when ${paycheckLine.status} = 'done' then coalesce(abs(${txn.amountMinor}), ${paycheckLine.amountMinor}) else 0 end), 0)`
		})
		.from(paycheckLine)
		.leftJoin(txn, and(eq(txn.id, paycheckLine.txnId), eq(txn.userId, userId)))
		.where(
			and(
				eq(paycheckLine.userId, userId),
				inArray(
					paycheckLine.paycheckId,
					checks.map((c) => c.id)
				)
			)
		)
		.groupBy(paycheckLine.paycheckId, paycheckLine.kind)
		.all();

	return checks.map((c) => {
		const planned = emptyTotals();
		const actual = emptyTotals();
		for (const r of sums) {
			if (r.paycheckId !== c.id) continue;
			planned[KIND_KEY[r.kind]] += r.planned;
			actual[KIND_KEY[r.kind]] += r.actual;
		}
		const allocated = planned.savings + planned.debt + planned.bills + planned.spending;
		return { ...c, planned, actual, unallocated: c.amountMinor - allocated };
	});
}

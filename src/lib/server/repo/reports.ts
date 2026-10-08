import { addMonths, monthsBetween } from '$lib/month';
import { and, eq, gte, isNotNull, lt, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { category, categoryGroup, finAccount, txn } from '../db/schema';
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

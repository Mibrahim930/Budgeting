import { addMonths } from '$lib/month';
import { and, eq, isNotNull, lt, sql } from 'drizzle-orm';
import { computeMonth, key, type BudgetMode } from '../budget/engine';
import type { Db } from '../db/client';
import { budgetAllocation, finAccount, txn } from '../db/schema';
import { getCategory, listCategories, listCategoryTree } from './categories';
import { monthRange, ValidationError } from './transactions';

function loadMaps(db: Db, userId: string, uptoMonth: string) {
	const [, end] = monthRange(uptoMonth);
	const budgeted = new Map<string, number>();
	for (const r of db
		.select()
		.from(budgetAllocation)
		.where(and(eq(budgetAllocation.userId, userId), sql`${budgetAllocation.month} <= ${uptoMonth}`))
		.all()) {
		budgeted.set(key(r.categoryId, r.month), r.budgetedMinor);
	}

	const month = sql<string>`substr(${txn.date}, 1, 7)`;
	const activity = new Map<string, number>();
	for (const r of db
		.select({
			categoryId: txn.categoryId,
			month,
			total: sql<number>`sum(${txn.amountMinor})`
		})
		.from(txn)
		.innerJoin(finAccount, eq(finAccount.id, txn.accountId))
		.where(
			and(
				eq(txn.userId, userId),
				eq(finAccount.onBudget, true),
				eq(txn.isParent, false),
				isNotNull(txn.categoryId),
				lt(txn.date, end)
			)
		)
		.groupBy(txn.categoryId, month)
		.all()) {
		activity.set(key(r.categoryId!, r.month), r.total);
	}
	return { budgeted, activity };
}

/** Budget numbers for one month, shaped for the budget screen. */
export function getBudgetMonth(db: Db, userId: string, month: string, mode: BudgetMode) {
	const { budgeted, activity } = loadMaps(db, userId, month);
	const allCategories = listCategories(db, userId, true);
	const summary = computeMonth({
		mode,
		month,
		categories: allCategories.map((c) => ({ id: c.id, isIncome: c.isIncome })),
		budgeted,
		activity
	});

	const tree = listCategoryTree(db, userId).map((g) => {
		const categories = g.categories.map((c) => {
			const n = summary.categories.get(c.id) ?? {
				budgeted: 0,
				activity: 0,
				available: 0,
				carryIn: 0
			};
			// Income categories show what came in this month.
			const incomeActivity = c.isIncome ? (activity.get(key(c.id, month)) ?? 0) : 0;
			return {
				id: c.id,
				name: c.name,
				isIncome: c.isIncome,
				...n,
				activity: c.isIncome ? incomeActivity : n.activity
			};
		});
		const sum = (f: 'budgeted' | 'activity' | 'available') =>
			categories.reduce((a, c) => a + c[f], 0);
		return {
			id: g.id,
			name: g.name,
			isIncome: g.isIncome,
			categories,
			budgeted: sum('budgeted'),
			activity: sum('activity'),
			available: sum('available')
		};
	});

	return {
		month,
		mode,
		groups: tree,
		income: summary.income,
		toBudget: summary.toBudget,
		toBudgetCarryIn: summary.toBudgetCarryIn,
		overspentLastMonth: summary.overspentLastMonth,
		totalBudgeted: summary.totalBudgeted,
		totalActivity: summary.totalActivity,
		totalAvailable: summary.totalAvailable
	};
}

export function setBudgeted(
	db: Db,
	userId: string,
	categoryId: string,
	month: string,
	budgetedMinor: number
) {
	const cat = getCategory(db, userId, categoryId);
	if (!cat) throw new ValidationError('Unknown category');
	if (cat.isIncome) throw new ValidationError('Income categories are not budgeted');
	if (!Number.isSafeInteger(budgetedMinor)) throw new ValidationError('Invalid amount');
	db.insert(budgetAllocation)
		.values({ userId, categoryId, month, budgetedMinor })
		.onConflictDoUpdate({
			target: [budgetAllocation.userId, budgetAllocation.categoryId, budgetAllocation.month],
			set: { budgetedMinor }
		})
		.run();
}

/** Copy last month's budgeted amounts into this month (only for categories still at zero). */
export function copyLastMonth(db: Db, userId: string, month: string) {
	const prev = addMonths(month, -1);
	const rows = db
		.select()
		.from(budgetAllocation)
		.where(and(eq(budgetAllocation.userId, userId), eq(budgetAllocation.month, prev)))
		.all();
	const current = new Map(
		db
			.select()
			.from(budgetAllocation)
			.where(and(eq(budgetAllocation.userId, userId), eq(budgetAllocation.month, month)))
			.all()
			.map((r) => [r.categoryId, r.budgetedMinor])
	);
	db.transaction(() => {
		for (const r of rows) {
			if (!current.get(r.categoryId)) {
				setBudgeted(db, userId, r.categoryId, month, r.budgetedMinor);
			}
		}
	});
}

/** Number and total of on-budget transactions that still need a category. */
export function uncategorizedSummary(db: Db, userId: string) {
	const r = db
		.select({ n: sql<number>`count(*)`, total: sql<number>`coalesce(sum(${txn.amountMinor}), 0)` })
		.from(txn)
		.innerJoin(finAccount, eq(finAccount.id, txn.accountId))
		.where(
			and(
				eq(txn.userId, userId),
				eq(finAccount.onBudget, true),
				eq(txn.isParent, false),
				sql`${txn.categoryId} is null`,
				sql`${txn.transferId} is null`
			)
		)
		.get();
	return { count: r?.n ?? 0, total: r?.total ?? 0 };
}

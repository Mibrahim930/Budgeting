import { monthsBetween } from '$lib/month';

// Pure budget math. All amounts are integer cents; spending is negative activity.
//
// Envelope mode follows Actual Budget's rules:
//   available(c, m) = carryover(c, m-1) + budgeted(c, m) + activity(c, m)
//   carryover(c, m) = max(available(c, m), 0)      -- leftovers roll forward
//   overspending in m (negative available) is not carried in the category; instead it is
//   taken out of the next month's "To Budget".
//   toBudget(m) = toBudget(m-1) + income(m) - budgeted(m) + overspent(m-1)
//
// Limits mode has no rollover and no To Budget pool:
//   available(c, m) = budgeted(c, m) + activity(c, m)

export type BudgetMode = 'envelope' | 'limits';

export interface EngineCategory {
	id: string;
	isIncome: boolean;
}

export interface EngineInput {
	mode: BudgetMode;
	month: string;
	categories: EngineCategory[];
	/** Keyed by `${categoryId}|${month}`. */
	budgeted: Map<string, number>;
	/** Keyed by `${categoryId}|${month}`. Only on-budget, categorized, non-split-parent rows. */
	activity: Map<string, number>;
}

export interface CategoryMonth {
	budgeted: number;
	activity: number;
	available: number;
	/** Rolled in from last month (envelope mode only). */
	carryIn: number;
}

export interface MonthSummary {
	month: string;
	categories: Map<string, CategoryMonth>;
	income: number;
	totalBudgeted: number;
	/** Spending (expense-category activity), negative when money went out. */
	totalActivity: number;
	totalAvailable: number;
	/** Envelope mode: money not yet assigned. Negative means you budgeted more than you have. */
	toBudget: number;
	/** Envelope mode: carried from last month's To Budget. */
	toBudgetCarryIn: number;
	/** Envelope mode: last month's overspending (<= 0) deducted from this month. */
	overspentLastMonth: number;
}

export const key = (categoryId: string, month: string) => `${categoryId}|${month}`;

function firstMonth(input: EngineInput): string {
	let first = input.month;
	for (const k of [...input.budgeted.keys(), ...input.activity.keys()]) {
		const m = k.slice(k.indexOf('|') + 1);
		if (m < first) first = m;
	}
	return first;
}

export function computeMonth(input: EngineInput): MonthSummary {
	const expense = input.categories.filter((c) => !c.isIncome);
	const income = input.categories.filter((c) => c.isIncome);
	const get = (map: Map<string, number>, c: string, m: string) => map.get(key(c, m)) ?? 0;

	const months =
		input.mode === 'envelope' ? monthsBetween(firstMonth(input), input.month) : [input.month];

	let carry = new Map<string, number>();
	let toBudget = 0;
	let overspentPrev = 0;
	let summary: MonthSummary | undefined;

	for (const m of months) {
		const cats = new Map<string, CategoryMonth>();
		let totalBudgeted = 0;
		let totalActivity = 0;
		let totalAvailable = 0;
		let overspent = 0;
		for (const c of expense) {
			const budgeted = get(input.budgeted, c.id, m);
			const activity = get(input.activity, c.id, m);
			const carryIn = input.mode === 'envelope' ? (carry.get(c.id) ?? 0) : 0;
			const available = carryIn + budgeted + activity;
			cats.set(c.id, { budgeted, activity, available, carryIn });
			totalBudgeted += budgeted;
			totalActivity += activity;
			totalAvailable += available;
			if (available < 0) overspent += available;
		}
		const monthIncome = income.reduce((sum, c) => sum + get(input.activity, c.id, m), 0);
		const toBudgetCarryIn = toBudget;
		toBudget = toBudgetCarryIn + monthIncome - totalBudgeted + overspentPrev;

		summary = {
			month: m,
			categories: cats,
			income: monthIncome,
			totalBudgeted,
			totalActivity,
			totalAvailable,
			toBudget: input.mode === 'envelope' ? toBudget : 0,
			toBudgetCarryIn: input.mode === 'envelope' ? toBudgetCarryIn : 0,
			overspentLastMonth: input.mode === 'envelope' ? overspentPrev : 0
		};

		carry = new Map([...cats].map(([id, v]) => [id, Math.max(v.available, 0)]));
		overspentPrev = overspent;
	}

	return summary!;
}

import { describe, expect, it } from 'vitest';
import { computeMonth, key, type BudgetMode } from './engine';

const categories = [
	{ id: 'pay', isIncome: true },
	{ id: 'food', isIncome: false },
	{ id: 'fun', isIncome: false }
];

function run(
	month: string,
	budgeted: Record<string, number>,
	activity: Record<string, number>,
	mode: BudgetMode = 'envelope'
) {
	const toMap = (o: Record<string, number>) =>
		new Map(Object.entries(o).map(([k, v]) => [k.replace(':', '|'), v]));
	return computeMonth({
		mode,
		month,
		categories,
		budgeted: toMap(budgeted),
		activity: toMap(activity)
	});
}

describe('envelope mode', () => {
	it('assigns income to To Budget and subtracts what is budgeted', () => {
		const s = run(
			'2026-01',
			{ 'food:2026-01': 40000 },
			{ 'pay:2026-01': 300000, 'food:2026-01': -12000 }
		);
		expect(s.income).toBe(300000);
		expect(s.toBudget).toBe(260000);
		expect(s.categories.get('food')).toEqual({
			budgeted: 40000,
			activity: -12000,
			available: 28000,
			carryIn: 0
		});
	});

	it('rolls leftover category money into the next month', () => {
		const s = run(
			'2026-02',
			{ 'food:2026-01': 40000, 'food:2026-02': 40000 },
			{ 'pay:2026-01': 100000, 'food:2026-01': -30000, 'food:2026-02': -5000 }
		);
		const food = s.categories.get('food')!;
		expect(food.carryIn).toBe(10000);
		expect(food.available).toBe(45000);
		// To Budget carries: 100000 - 40000 in Jan, then -40000 in Feb.
		expect(s.toBudgetCarryIn).toBe(60000);
		expect(s.toBudget).toBe(20000);
	});

	it('takes overspending out of next month To Budget, not the category', () => {
		const s = run(
			'2026-02',
			{ 'fun:2026-01': 5000 },
			{ 'pay:2026-01': 100000, 'fun:2026-01': -8000 }
		);
		expect(s.overspentLastMonth).toBe(-3000);
		expect(s.categories.get('fun')!.carryIn).toBe(0);
		expect(s.categories.get('fun')!.available).toBe(0);
		// Jan: 100000 - 5000 = 95000; Feb: 95000 - 3000 overspend = 92000.
		expect(s.toBudget).toBe(92000);
	});

	it('shows the overspend in the month it happened', () => {
		const s = run(
			'2026-01',
			{ 'fun:2026-01': 5000 },
			{ 'pay:2026-01': 100000, 'fun:2026-01': -8000 }
		);
		expect(s.categories.get('fun')!.available).toBe(-3000);
		expect(s.toBudget).toBe(95000);
	});

	it('allows budgeting ahead into future months', () => {
		const s = run('2026-03', { 'food:2026-03': 20000 }, { 'pay:2026-01': 50000 });
		expect(s.toBudget).toBe(30000);
		expect(s.categories.get('food')!.available).toBe(20000);
	});

	it('goes negative when more is budgeted than available', () => {
		const s = run('2026-01', { 'food:2026-01': 150000 }, { 'pay:2026-01': 100000 });
		expect(s.toBudget).toBe(-50000);
	});

	it('handles refunds (positive activity) in expense categories', () => {
		const s = run('2026-01', {}, { 'food:2026-01': 2500 });
		expect(s.categories.get('food')!.available).toBe(2500);
	});

	it('works for a month with no data', () => {
		const s = run('2026-05', {}, {});
		expect(s.toBudget).toBe(0);
		expect(s.totalAvailable).toBe(0);
	});
});

describe('limits mode', () => {
	it('does not roll over and has no To Budget pool', () => {
		const s = run(
			'2026-02',
			{ 'food:2026-01': 40000, 'food:2026-02': 40000 },
			{ 'pay:2026-02': 100000, 'food:2026-01': -1000, 'food:2026-02': -45000 },
			'limits'
		);
		const food = s.categories.get('food')!;
		expect(food.carryIn).toBe(0);
		expect(food.available).toBe(-5000);
		expect(s.toBudget).toBe(0);
		expect(s.income).toBe(100000);
		expect(s.totalActivity).toBe(-45000);
	});
});

it('key format', () => expect(key('a', '2026-01')).toBe('a|2026-01'));

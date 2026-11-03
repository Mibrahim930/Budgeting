import { describe, expect, it } from 'vitest';
import { planTotals, projectBalances, type PlanLine } from './plan-math';

const line = (l: Partial<PlanLine> & Pick<PlanLine, 'kind' | 'amountMinor'>): PlanLine => ({
	status: 'planned',
	fromAccountId: null,
	toAccountId: null,
	...l
});

// The worked example from docs/plan.md §2.3.
const checking = 'checking';
const emergency = 'emergency';
const visa = 'visa';
const balances = () =>
	new Map([
		[checking, 100000],
		[emergency, 25000],
		[visa, -30000]
	]);
const paycheck = { accountId: checking, amountMinor: 200000, incomeConfirmed: false };
const netflix = line({ kind: 'bill', amountMinor: 1549, fromAccountId: checking });
const savings = line({ kind: 'savings', amountMinor: 10000, toAccountId: emergency });
const debt = line({ kind: 'debt', amountMinor: 15000, toAccountId: visa });
const spending = line({ kind: 'spending', amountMinor: 173451 });

describe('planTotals', () => {
	it('follows the worked example', () => {
		expect(planTotals(paycheck, [netflix]).left).toBe(198451);
		expect(planTotals(paycheck, [netflix, savings]).left).toBe(188451);
		expect(planTotals(paycheck, [netflix, savings, debt]).left).toBe(173451);
		const t = planTotals(paycheck, [netflix, savings, debt, spending]);
		expect(t).toEqual({
			allocated: 200000,
			left: 0,
			doneCount: 0,
			plannedCount: 4,
			byKind: { savings: 10000, debt: 15000, bill: 1549, spending: 173451 }
		});
	});

	it('goes negative when over-allocated', () => {
		const t = planTotals({ amountMinor: 10000 }, [line({ kind: 'spending', amountMinor: 12500 })]);
		expect(t.left).toBe(-2500);
	});

	it('leaves the whole paycheck with no lines', () => {
		expect(planTotals({ amountMinor: 200000 }, [])).toEqual({
			allocated: 0,
			left: 200000,
			doneCount: 0,
			plannedCount: 0,
			byKind: { savings: 0, debt: 0, bill: 0, spending: 0 }
		});
	});

	it('counts done and planned lines', () => {
		const t = planTotals(paycheck, [{ ...netflix, status: 'done' }, savings, debt]);
		expect(t.doneCount).toBe(1);
		expect(t.plannedCount).toBe(2);
		expect(t.allocated).toBe(26549);
	});
});

describe('projectBalances', () => {
	const after = (m: Map<string, { before: number; after: number }>) =>
		Object.fromEntries([...m].map(([id, v]) => [id, v.after]));

	it('follows the worked example (spending money is earmarked, not moved)', () => {
		const p = projectBalances(paycheck, [netflix, savings, debt, spending], balances());
		expect(after(p)).toEqual({ checking: 273451, emergency: 35000, visa: -15000 });
		expect(p.get(checking)!.before).toBe(100000);
	});

	it('changes nothing for confirmed income and done lines', () => {
		// After ticking everything, the real balances already hold the plan.
		const real = new Map([
			[checking, 273451],
			[emergency, 35000],
			[visa, -15000]
		]);
		const done = [netflix, savings, debt, spending].map((l) => ({ ...l, status: 'done' as const }));
		const p = projectBalances({ ...paycheck, incomeConfirmed: true }, done, real);
		for (const v of p.values()) expect(v.after).toBe(v.before);
	});

	it('adds unconfirmed income to the deposit account', () => {
		const p = projectBalances(paycheck, [], balances());
		expect(p.get(checking)).toEqual({ before: 100000, after: 300000 });
	});

	it('moves the card, not checking, for a bill paid by card', () => {
		const gym = line({ kind: 'bill', amountMinor: 10000, fromAccountId: visa });
		const p = projectBalances({ ...paycheck, incomeConfirmed: true }, [gym], balances());
		expect(after(p)).toEqual({ checking: 100000, emergency: 25000, visa: -40000 });
	});

	it('moves checking down and the card up for a card payment', () => {
		const minimum = line({ kind: 'bill', amountMinor: 3500, toAccountId: visa });
		const p = projectBalances({ ...paycheck, incomeConfirmed: true }, [minimum, debt], balances());
		expect(after(p)).toEqual({ checking: 81500, emergency: 25000, visa: -11500 });
	});

	it('moves spending money to a cash account', () => {
		const cash = line({ kind: 'spending', amountMinor: 6000, toAccountId: 'wallet' });
		const p = projectBalances({ ...paycheck, incomeConfirmed: true }, [cash], balances());
		expect(p.get(checking)!.after).toBe(94000);
		expect(p.get('wallet')).toEqual({ before: 0, after: 6000 });
	});

	it('counts accounts missing from balances as zero', () => {
		const p = projectBalances(
			{ accountId: 'new', amountMinor: 5000, incomeConfirmed: false },
			[line({ kind: 'savings', amountMinor: 2000, toAccountId: 'pot' })],
			new Map()
		);
		expect(after(p)).toEqual({ new: 3000, pot: 2000 });
	});
});

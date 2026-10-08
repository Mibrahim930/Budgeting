import { describe, expect, it } from 'vitest';
import { makeUser, setupTest } from '../testing/setup';
import { createAccount, getAccountWithBalance, reconcileAccount } from './accounts';
import { listCategories } from './categories';
import { incomeVsSpending, spendingByCategory } from './reports';
import { createTransaction, listTransactions } from './transactions';

async function setup() {
	const { db, auth } = setupTest();
	const user = await makeUser(db, auth);
	const acct = createAccount(db, user, { name: 'Checking', type: 'checking' });
	const cats = listCategories(db, user);
	const cat = (n: string) => cats.find((c) => c.name === n)!.id;
	const add = (date: string, amountMinor: number, name: string, cleared = true) =>
		createTransaction(db, user, {
			accountId: acct,
			date,
			amountMinor,
			categoryId: cat(name),
			cleared
		});
	return { db, user, acct, add };
}

describe('reports', () => {
	it('sums spending per category net of refunds, and income vs spending per month', async () => {
		const { db, user, add } = await setup();
		add('2026-01-02', 300000, 'Paycheck');
		add('2026-01-05', -10000, 'Groceries');
		add('2026-01-06', 2000, 'Groceries');
		add('2026-02-01', -5000, 'Dining out');
		add('2026-03-01', -999, 'Dining out');
		expect(spendingByCategory(db, user, '2026-01', '2026-02')).toEqual([
			expect.objectContaining({ name: 'Groceries', spent: 8000 }),
			expect.objectContaining({ name: 'Dining out', spent: 5000 })
		]);
		expect(incomeVsSpending(db, user, '2026-02', 3)).toEqual([
			{ month: '2025-12', income: 0, spending: 0 },
			{ month: '2026-01', income: 300000, spending: 8000 },
			{ month: '2026-02', income: 0, spending: 5000 }
		]);
	});
});

describe('reconcileAccount', () => {
	it('locks cleared transactions when they match the statement', async () => {
		const { db, user, acct, add } = await setup();
		add('2026-01-02', 10000, 'Paycheck');
		add('2026-01-05', -2500, 'Groceries', false);
		expect(reconcileAccount(db, user, acct, 9999, { date: '2026-01-31' })).toEqual({
			ok: false,
			differenceMinor: -1
		});
		expect(reconcileAccount(db, user, acct, 10000, { date: '2026-01-31' }).ok).toBe(true);
		const list = listTransactions(db, user);
		expect(list.find((t) => t.amountMinor === 10000)?.reconciled).toBe(true);
		expect(list.find((t) => t.amountMinor === -2500)?.reconciled).toBe(false);
	});

	it('can add an adjustment for the difference', async () => {
		const { db, user, acct, add } = await setup();
		add('2026-01-02', 10000, 'Paycheck');
		reconcileAccount(db, user, acct, 9000, { adjust: true, date: '2026-01-31' });
		expect(getAccountWithBalance(db, user, acct)!.clearedMinor).toBe(9000);
	});
});

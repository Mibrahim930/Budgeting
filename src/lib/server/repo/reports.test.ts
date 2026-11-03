import { describe, expect, it } from 'vitest';
import { makeUser, setupTest } from '../testing/setup';
import { createAccount, getAccountWithBalance, reconcileAccount } from './accounts';
import { createBill } from './bills';
import { listCategories } from './categories';
import { createInvite } from './invites';
import { addLine, confirmLine, createPaycheck, getLine } from './paychecks';
import { incomeVsSpending, paycheckBreakdown, spendingByCategory } from './reports';
import {
	createTransaction,
	getTransaction,
	listTransactions,
	updateTransaction
} from './transactions';

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

describe('paycheckBreakdown', () => {
	it('sums planned lines and ticked lines per kind, newest paycheck first', async () => {
		const { db, auth } = setupTest();
		const user = await makeUser(db, auth);
		const other = await makeUser(db, auth, createInvite(db, user).code);
		const checking = createAccount(db, user, { name: 'Checking', type: 'checking' });
		const savings = createAccount(db, user, { name: 'Savings', type: 'savings' });
		const visa = createAccount(db, user, { name: 'Visa', type: 'credit' });
		const gym = createBill(db, user, {
			name: 'Gym',
			amountMinor: 10000,
			frequency: 'monthly',
			dayOfMonth: 4,
			startDate: '2030-01-04',
			accountId: checking
		});

		const first = createPaycheck(db, user, {
			date: '2030-01-03',
			amountMinor: 100000,
			accountId: checking,
			nextDate: '2030-01-17'
		});
		const save = addLine(db, user, first, {
			kind: 'savings',
			amountMinor: 25000,
			toAccountId: savings
		});
		addLine(db, user, first, { kind: 'debt', amountMinor: 30000, toAccountId: visa });
		const bill = addLine(db, user, first, { kind: 'bill', billId: gym, dueDate: '2030-01-04' });
		const spend = addLine(db, user, first, {
			kind: 'spending',
			amountMinor: 20000,
			label: 'Spending money'
		});
		confirmLine(db, user, save, '2030-01-03');
		confirmLine(db, user, bill, '2030-01-03');
		confirmLine(db, user, spend, '2030-01-03');
		// The gym actually charged $105: "actual" follows the transaction, not the plan.
		const gymTxn = getTransaction(db, user, getLine(db, user, bill)!.txnId!)!;
		updateTransaction(db, user, gymTxn.id, {
			accountId: checking,
			date: gymTxn.date,
			amountMinor: -10500,
			payeeName: 'Gym'
		});

		const second = createPaycheck(db, user, {
			date: '2030-01-17',
			amountMinor: 90000,
			accountId: checking,
			nextDate: '2030-01-31'
		});
		addLine(db, user, second, { kind: 'debt', amountMinor: 100000, toAccountId: visa });

		expect(paycheckBreakdown(db, user)).toEqual([
			{
				id: second,
				date: '2030-01-17',
				amountMinor: 90000,
				planned: { savings: 0, debt: 100000, bills: 0, spending: 0 },
				actual: { savings: 0, debt: 0, bills: 0, spending: 0 },
				unallocated: -10000
			},
			{
				id: first,
				date: '2030-01-03',
				amountMinor: 100000,
				planned: { savings: 25000, debt: 30000, bills: 10000, spending: 20000 },
				actual: { savings: 25000, debt: 0, bills: 10500, spending: 20000 },
				unallocated: 15000
			}
		]);
		expect(paycheckBreakdown(db, user, 1).map((p) => p.id)).toEqual([second]);
		expect(paycheckBreakdown(db, other)).toEqual([]);
	});
});

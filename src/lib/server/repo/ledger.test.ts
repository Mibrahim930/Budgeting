import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/client';
import { createInvite } from './invites';
import { makeUser, setupTest } from '../testing/setup';
import { createAccount, getAccountWithBalance, listAccounts } from './accounts';
import { listCategories } from './categories';
import { copyLastMonth, getBudgetMonth, setBudgeted, uncategorizedSummary } from './budget';
import {
	createTransaction,
	deleteTransaction,
	getTransaction,
	listTransactions,
	updateTransaction,
	ValidationError
} from './transactions';

let db: Db;
let alice: string;
let bob: string;
let checking: string;
let card: string;
let brokerage: string;
let cat: (name: string) => string;

beforeEach(async () => {
	const t = setupTest();
	db = t.db;
	alice = await makeUser(db, t.auth);
	bob = await makeUser(db, t.auth, createInvite(db, alice).code);
	checking = createAccount(db, alice, { name: 'Checking', type: 'checking' });
	card = createAccount(db, alice, { name: 'Visa', type: 'credit' });
	brokerage = createAccount(db, alice, { name: 'Brokerage', type: 'investment' });
	const cats = listCategories(db, alice);
	cat = (name) => cats.find((c) => c.name === name)!.id;
});

const balance = (id: string) => getAccountWithBalance(db, alice, id)!.balanceMinor;

describe('transactions', () => {
	it('records spending and updates the balance', () => {
		createTransaction(db, alice, {
			accountId: checking,
			date: '2026-01-05',
			amountMinor: -4599,
			payeeName: 'Corner Grocer',
			categoryId: cat('Groceries')
		});
		expect(balance(checking)).toBe(-4599);
		const [t] = listTransactions(db, alice);
		expect(t.payeeName).toBe('Corner Grocer');
		expect(t.categoryName).toBe('Groceries');
	});

	it('reuses payees case-insensitively', () => {
		for (const p of ['Coffee Shop', 'coffee  shop']) {
			createTransaction(db, alice, {
				accountId: checking,
				date: '2026-01-05',
				amountMinor: -500,
				payeeName: p
			});
		}
		const [a, b] = listTransactions(db, alice);
		expect(a.payeeId).toBe(b.payeeId);
	});

	it('creates both legs of a transfer and deletes them together', () => {
		const id = createTransaction(db, alice, {
			accountId: checking,
			date: '2026-01-10',
			amountMinor: -20000,
			transferAccountId: card,
			payeeName: 'Card payment'
		});
		expect(balance(checking)).toBe(-20000);
		expect(balance(card)).toBe(20000);
		const [row] = listTransactions(db, alice, { accountId: checking });
		expect(row.transferAccountName).toBe('Visa');
		expect(row.categoryId).toBeNull();
		deleteTransaction(db, alice, id);
		expect(balance(card)).toBe(0);
	});

	it('keeps a category on transfers to off-budget accounts', () => {
		createTransaction(db, alice, {
			accountId: checking,
			date: '2026-01-10',
			amountMinor: -10000,
			transferAccountId: brokerage,
			categoryId: cat('Emergency fund')
		});
		const [leg] = listTransactions(db, alice, { accountId: checking });
		const [other] = listTransactions(db, alice, { accountId: brokerage });
		expect(leg.categoryId).toBe(cat('Emergency fund'));
		expect(other.categoryId).toBeNull();
	});

	it('splits must add up, and balances count the parent once', () => {
		expect(() =>
			createTransaction(db, alice, {
				accountId: checking,
				date: '2026-01-10',
				amountMinor: -10000,
				splits: [
					{ amountMinor: -6000, categoryId: cat('Groceries') },
					{ amountMinor: -3000, categoryId: cat('Household') }
				]
			})
		).toThrow(ValidationError);

		createTransaction(db, alice, {
			accountId: checking,
			date: '2026-01-10',
			amountMinor: -10000,
			payeeName: 'Big box store',
			splits: [
				{ amountMinor: -6000, categoryId: cat('Groceries') },
				{ amountMinor: -4000, categoryId: cat('Household') }
			]
		});
		expect(balance(checking)).toBe(-10000);
		const [row] = listTransactions(db, alice);
		expect(row.isParent).toBe(true);
		expect(row.splits.map((s) => s.categoryName)).toEqual(['Groceries', 'Household']);
		expect(listTransactions(db, alice, { categoryId: cat('Household') })).toHaveLength(1);
	});

	it('updates a plain transaction into a split and back', () => {
		const id = createTransaction(db, alice, {
			accountId: checking,
			date: '2026-01-10',
			amountMinor: -10000,
			categoryId: cat('Groceries')
		});
		updateTransaction(db, alice, id, {
			accountId: checking,
			date: '2026-01-10',
			amountMinor: -10000,
			splits: [
				{ amountMinor: -7000, categoryId: cat('Groceries') },
				{ amountMinor: -3000, categoryId: cat('Dining out') }
			]
		});
		expect(listTransactions(db, alice)[0].splits).toHaveLength(2);
		updateTransaction(db, alice, id, {
			accountId: checking,
			date: '2026-01-10',
			amountMinor: -10000,
			categoryId: cat('Groceries')
		});
		const [row] = listTransactions(db, alice);
		expect(row.isParent).toBe(false);
		expect(row.splits).toHaveLength(0);
	});

	it('updates a transfer to point at a different account', () => {
		const id = createTransaction(db, alice, {
			accountId: checking,
			date: '2026-01-10',
			amountMinor: -5000,
			transferAccountId: card
		});
		const savings = createAccount(db, alice, { name: 'Savings', type: 'savings' });
		updateTransaction(db, alice, id, {
			accountId: checking,
			date: '2026-01-10',
			amountMinor: -7000,
			transferAccountId: savings
		});
		expect(balance(card)).toBe(0);
		expect(balance(savings)).toBe(7000);
		expect(balance(checking)).toBe(-7000);
	});
});

describe('user isolation', () => {
	it("cannot read or modify another user's data", () => {
		const id = createTransaction(db, alice, {
			accountId: checking,
			date: '2026-01-05',
			amountMinor: -100,
			categoryId: cat('Groceries')
		});
		expect(listAccounts(db, bob)).toHaveLength(0);
		expect(listTransactions(db, bob)).toHaveLength(0);
		expect(getTransaction(db, bob, id)).toBeUndefined();
		deleteTransaction(db, bob, id);
		expect(getTransaction(db, alice, id)).toBeDefined();
	});

	it("cannot post into another user's account or category", () => {
		const bobAccount = createAccount(db, bob, { name: 'Bob checking', type: 'checking' });
		expect(() =>
			createTransaction(db, alice, { accountId: bobAccount, date: '2026-01-01', amountMinor: 1 })
		).toThrow(ValidationError);
		expect(() =>
			createTransaction(db, bob, {
				accountId: bobAccount,
				date: '2026-01-01',
				amountMinor: 1,
				categoryId: cat('Groceries')
			})
		).toThrow(ValidationError);
		expect(() => setBudgeted(db, bob, cat('Groceries'), '2026-01', 100)).toThrow(ValidationError);
		expect(() =>
			updateTransaction(db, bob, 'nope', {
				accountId: bobAccount,
				date: '2026-01-01',
				amountMinor: 1
			})
		).toThrow(ValidationError);
	});
});

describe('budget month', () => {
	it('combines income, budgets, spending, transfers and off-budget accounts', () => {
		createTransaction(db, alice, {
			accountId: checking,
			date: '2026-01-01',
			amountMinor: 300000,
			categoryId: cat('Paycheck')
		});
		setBudgeted(db, alice, cat('Groceries'), '2026-01', 50000);
		createTransaction(db, alice, {
			accountId: card,
			date: '2026-01-03',
			amountMinor: -12000,
			categoryId: cat('Groceries')
		});
		// Paying the card is a transfer between budget accounts: no budget effect.
		createTransaction(db, alice, {
			accountId: checking,
			date: '2026-01-20',
			amountMinor: -12000,
			transferAccountId: card
		});
		// Off-budget activity is ignored.
		createTransaction(db, alice, {
			accountId: brokerage,
			date: '2026-01-04',
			amountMinor: 999999,
			categoryId: cat('Paycheck')
		});
		const m = getBudgetMonth(db, alice, '2026-01', 'envelope');
		expect(m.income).toBe(300000);
		expect(m.toBudget).toBe(250000);
		const groceries = m.groups.flatMap((g) => g.categories).find((c) => c.name === 'Groceries')!;
		expect(groceries.activity).toBe(-12000);
		expect(groceries.available).toBe(38000);

		const feb = getBudgetMonth(db, alice, '2026-02', 'envelope');
		const febGroceries = feb.groups
			.flatMap((g) => g.categories)
			.find((c) => c.name === 'Groceries')!;
		expect(febGroceries.available).toBe(38000);
		expect(uncategorizedSummary(db, alice).count).toBe(0);
	});

	it('copies last month budget into empty categories', () => {
		setBudgeted(db, alice, cat('Groceries'), '2026-01', 50000);
		setBudgeted(db, alice, cat('Utilities'), '2026-01', 9000);
		setBudgeted(db, alice, cat('Utilities'), '2026-02', 12000);
		copyLastMonth(db, alice, '2026-02');
		const feb = getBudgetMonth(db, alice, '2026-02', 'limits');
		const by = (n: string) => feb.groups.flatMap((g) => g.categories).find((c) => c.name === n)!;
		expect(by('Groceries').budgeted).toBe(50000);
		expect(by('Utilities').budgeted).toBe(12000);
	});

	it('refuses to budget income categories', () => {
		expect(() => setBudgeted(db, alice, cat('Paycheck'), '2026-01', 100)).toThrow(ValidationError);
	});
});

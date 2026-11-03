import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/client';
import { paycheckLine, txn } from '../db/schema';
import { completeOnboarding } from '../onboarding';
import { makeUser, setupTest } from '../testing/setup';
import { createAccount, getAccountWithBalance, listAccounts, reconcileAccount } from './accounts';
import { billsDueBetween, createBill, getBill, listBills } from './bills';
import { listCategories } from './categories';
import { createInvite } from './invites';
import { upsertPaySchedule } from './pay-schedule';
import {
	addLine,
	allocateLeftover,
	confirmIncome,
	confirmLine,
	createPaycheck,
	deletePaycheck,
	getLine,
	getPaycheck,
	listPaychecks,
	pickHomePaycheck,
	removeLine,
	suggestNextPaycheck,
	unconfirmIncome,
	unconfirmLine,
	updateLine,
	updatePaycheck,
	type PaycheckStatus
} from './paychecks';
import {
	createTransaction,
	deleteTransaction,
	getTransaction,
	listTransactions,
	ValidationError
} from './transactions';

let db: Db;
let alice: string;
let bob: string;
let checking: string;
let emergency: string;
let visa: string;
let cat: (name: string) => string;
let acct: (name: string) => string;

/** §2.3: onboarding, then Rent and Netflix bills. */
beforeEach(async () => {
	const t = setupTest();
	db = t.db;
	alice = await makeUser(db, t.auth);
	bob = await makeUser(db, t.auth, createInvite(db, alice).code);
	({ checkingId: checking } = completeOnboarding(
		db,
		alice,
		{
			checking: { name: 'Main checking', balanceMinor: 100000 },
			savings: [{ name: 'Emergency', balanceMinor: 25000 }],
			debts: [{ name: 'Visa', type: 'credit', owedMinor: 30000 }],
			pay: { frequency: 'biweekly', amountMinor: 200000, anchorDate: '2030-01-03' }
		},
		'2029-12-01'
	));
	const accounts = listAccounts(db, alice);
	acct = (name) => accounts.find((a) => a.name === name)!.id;
	emergency = acct('Emergency');
	visa = acct('Visa');
	const cats = listCategories(db, alice);
	cat = (name) => cats.find((c) => c.name === name)!.id;
	createBill(db, alice, {
		name: 'Rent',
		amountMinor: 120000,
		frequency: 'monthly',
		dayOfMonth: 1,
		startDate: '2030-01-01',
		accountId: checking,
		categoryId: cat('Rent / Mortgage')
	});
	createBill(db, alice, {
		name: 'Netflix',
		amountMinor: 1549,
		frequency: 'monthly',
		dayOfMonth: 9,
		startDate: '2029-12-09',
		accountId: checking,
		categoryId: cat('Subscriptions')
	});
});

const balance = (id: string) => getAccountWithBalance(db, alice, id)!.balanceMinor;
const projected = (pid: string) =>
	Object.fromEntries(getPaycheck(db, alice, pid)!.projected.map((r) => [r.name, r.after]));

/** Create the §2.3 paycheck with the bills the window offers, as the "new paycheck" page does. */
function newExamplePaycheck() {
	const s = suggestNextPaycheck(db, alice, '2029-12-21');
	expect(s).toMatchObject({ date: '2030-01-03', nextDate: '2030-01-17', amountMinor: 200000 });
	const offered = billsDueBetween(db, alice, s.date, s.nextDate);
	expect(offered.map((o) => [o.name, o.dueDate])).toEqual([['Netflix', '2030-01-09']]);
	return createPaycheck(
		db,
		alice,
		{ date: s.date, amountMinor: s.amountMinor!, accountId: s.accountId! },
		{ billOccurrences: offered.map((o) => ({ billId: o.billId, dueDate: o.dueDate })) }
	);
}

/** Add the §2.3 savings, debt and leftover lines (to a new example paycheck by default). */
function planExample(p = newExamplePaycheck()) {
	const savings = addLine(db, alice, p, {
		kind: 'savings',
		amountMinor: 10000,
		toAccountId: emergency
	});
	const debt = addLine(db, alice, p, { kind: 'debt', amountMinor: 15000, toAccountId: visa });
	const spending = allocateLeftover(db, alice, p);
	const netflix = getPaycheck(db, alice, p)!.lines.find((l) => l.kind === 'bill')!.id;
	return { p, savings, debt, spending, netflix };
}

describe('§2.3 worked example', () => {
	it('plans, projects, confirms and unticks with the exact numbers', () => {
		const p = newExamplePaycheck();
		let d = getPaycheck(db, alice, p)!;
		expect(d).toMatchObject({ nextDate: '2030-01-17', accountName: 'Main checking' });
		expect(d.incomeCategoryName).toBe('Paycheck');
		expect(d.lines).toHaveLength(1);
		expect(d.lines[0]).toMatchObject({
			kind: 'bill',
			label: 'Netflix',
			amountMinor: 1549,
			dueDate: '2030-01-09',
			categoryName: 'Subscriptions',
			fromAccountName: 'Main checking'
		});
		expect(d.totals.left).toBe(198451);
		expect(d.billsDue).toHaveLength(1);
		expect(d.billsDue[0].plannedLineId).toBe(d.lines[0].id);

		const savings = addLine(db, alice, p, {
			kind: 'savings',
			amountMinor: 10000,
			toAccountId: emergency
		});
		expect(getPaycheck(db, alice, p)!.totals.left).toBe(188451);
		const debt = addLine(db, alice, p, { kind: 'debt', amountMinor: 15000, toAccountId: visa });
		expect(getPaycheck(db, alice, p)!.totals.left).toBe(173451);
		const spending = allocateLeftover(db, alice, p);
		d = getPaycheck(db, alice, p)!;
		expect(d.totals.left).toBe(0);
		expect(d.lines.find((l) => l.id === spending)).toMatchObject({
			kind: 'spending',
			label: 'Spending money',
			amountMinor: 173451,
			spentMinor: null
		});
		expect(d.lines.find((l) => l.id === savings)?.label).toBe('Emergency');
		expect(d.lines.find((l) => l.id === debt)?.toAccountName).toBe('Visa');
		expect(d.spendingMoneyMinor).toBe(173451);
		expect(() => allocateLeftover(db, alice, p)).toThrow('Nothing left');

		// Projected after plan; deposit account first, then touched accounts.
		expect(d.projected.map((r) => [r.name, r.before, r.after])).toEqual([
			['Main checking', 100000, 273451],
			['Emergency', 25000, 35000],
			['Visa', -30000, -15000]
		]);
		expect(d.status).toBe('planned');
		expect(listPaychecks(db, alice)[0].status).toBe('planned');

		confirmIncome(db, alice, p);
		expect(balance(checking)).toBe(300000);
		expect(getPaycheck(db, alice, p)!.status).toBe('partial');
		expect(listPaychecks(db, alice)[0].status).toBe('partial');
		// Projection doesn't move once income is real.
		expect(projected(p)['Main checking']).toBe(273451);

		const netflix = d.lines.find((l) => l.kind === 'bill')!.id;
		for (const id of [netflix, savings, debt]) confirmLine(db, alice, id, '2030-01-04');
		expect(balance(checking)).toBe(273451);
		expect(balance(emergency)).toBe(35000);
		expect(balance(visa)).toBe(-15000);
		expect(projected(p)).toMatchObject({
			'Main checking': 273451,
			Emergency: 35000,
			Visa: -15000
		});

		const nf = listTransactions(db, alice, { search: 'netflix' });
		expect(nf).toHaveLength(1);
		expect(nf[0]).toMatchObject({
			amountMinor: -1549,
			date: '2030-01-09',
			categoryName: 'Subscriptions',
			accountId: checking
		});
		const savingsTxn = getTransaction(db, alice, getLine(db, alice, savings)!.txnId!)!;
		expect(savingsTxn).toMatchObject({
			date: '2030-01-04',
			memo: 'Emergency',
			amountMinor: -10000
		});
		expect(listTransactions(db, alice, { accountId: emergency })[0].transferAccountId).toBe(
			checking
		);

		// The earmarked spending line creates no transaction and doesn't move checking.
		const before = listTransactions(db, alice).length;
		confirmLine(db, alice, spending, '2030-01-04');
		expect(listTransactions(db, alice)).toHaveLength(before);
		expect(getLine(db, alice, spending)).toMatchObject({ status: 'done', txnId: null });
		expect(balance(checking)).toBe(273451);
		expect(getPaycheck(db, alice, p)!.status).toBe('confirmed');
		expect(listPaychecks(db, alice)[0]).toMatchObject({
			status: 'confirmed',
			lineCount: 4,
			doneCount: 4,
			leftMinor: 0
		});

		// Untick savings: Emergency back to $250, both legs gone, status partly confirmed.
		unconfirmLine(db, alice, savings);
		expect(balance(emergency)).toBe(25000);
		expect(balance(checking)).toBe(283451);
		expect(getTransaction(db, alice, savingsTxn.id)).toBeUndefined();
		expect(listTransactions(db, alice, { accountId: emergency })).toHaveLength(1);
		expect(getLine(db, alice, savings)).toMatchObject({
			status: 'planned',
			txnId: null,
			txnOrigin: null,
			doneAt: null
		});
		expect(getPaycheck(db, alice, p)!.status).toBe('partial');
		expect(projected(p)).toMatchObject({ 'Main checking': 273451, Emergency: 35000 });

		// Untick income: checking loses the $2,000 again.
		unconfirmIncome(db, alice, p);
		expect(balance(checking)).toBe(83451);
		expect(getPaycheck(db, alice, p)!.incomeTxnId).toBeNull();
	});

	it('records income as a Paycheck transaction on the paycheck date, once', () => {
		const p = newExamplePaycheck();
		confirmIncome(db, alice, p);
		confirmIncome(db, alice, p);
		const rows = listTransactions(db, alice, { search: 'paycheck' });
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			payeeName: 'Paycheck',
			date: '2030-01-03',
			amountMinor: 200000,
			categoryName: 'Paycheck',
			accountId: checking
		});
	});
});

describe('paychecks', () => {
	it('defaults the next payday from the schedule, or +14 days without one', () => {
		const p = createPaycheck(db, alice, {
			date: '2030-01-10',
			amountMinor: 1,
			accountId: checking
		});
		expect(getPaycheck(db, alice, p)!.nextDate).toBe('2030-01-17');
		const bobChecking = createAccount(db, bob, { name: 'Checking', type: 'checking' });
		const q = createPaycheck(db, bob, {
			date: '2030-01-10',
			amountMinor: 1,
			accountId: bobChecking
		});
		expect(getPaycheck(db, bob, q)).toMatchObject({
			nextDate: '2030-01-24',
			windowEnd: '2030-01-24'
		});
	});

	it('validates paychecks', () => {
		const base = { date: '2030-01-03', amountMinor: 1000, accountId: checking };
		const cases: [object, string][] = [
			[{ date: '2030-1-3' }, 'YYYY-MM-DD'],
			[{ amountMinor: 0 }, 'more than zero'],
			[{ accountId: 'nope' }, 'Unknown account'],
			[{ incomeCategoryId: 'nope' }, 'Unknown category'],
			[{ nextDate: '2030-01-03' }, 'after this one'],
			[{ nextDate: 'later' }, 'YYYY-MM-DD']
		];
		for (const [patch, message] of cases) {
			expect(() => createPaycheck(db, alice, { ...base, ...patch })).toThrow(message);
		}
		expect(listPaychecks(db, alice)).toHaveLength(0);
	});

	it('allows two paychecks on one date but a bill occurrence in only one plan', () => {
		const a = newExamplePaycheck();
		const b = createPaycheck(db, alice, {
			date: '2030-01-03',
			amountMinor: 5000,
			accountId: checking
		});
		const netflix = listBills(db, alice).find((x) => x.name === 'Netflix')!.id;
		expect(() =>
			addLine(db, alice, b, { kind: 'bill', billId: netflix, dueDate: '2030-01-09' })
		).toThrow('already in a plan');
		expect(() =>
			addLine(db, alice, b, { kind: 'bill', billId: netflix, dueDate: '2030-01-10' })
		).toThrow('isn’t due');
		expect(
			listPaychecks(db, alice)
				.map((s) => s.id)
				.sort()
		).toEqual([a, b].sort());
	});

	it('suggests the next payday without a plan', () => {
		newExamplePaycheck();
		expect(suggestNextPaycheck(db, alice, '2029-12-21')).toMatchObject({
			date: '2030-01-17',
			nextDate: '2030-01-31',
			accountId: checking,
			incomeCategoryId: cat('Paycheck')
		});
		expect(suggestNextPaycheck(db, alice, '2030-01-03').date).toBe('2030-01-17');
		expect(suggestNextPaycheck(db, bob, '2030-01-05')).toMatchObject({
			date: '2030-01-05',
			nextDate: '2030-01-19',
			amountMinor: null,
			accountId: null
		});
	});

	it('updatePaycheck keeps the income transaction in sync', () => {
		const p = newExamplePaycheck();
		updatePaycheck(db, alice, p, { amountMinor: 210000 });
		expect(getPaycheck(db, alice, p)!.totals.left).toBe(208451);

		confirmIncome(db, alice, p);
		updatePaycheck(db, alice, p, { amountMinor: 205050, date: '2030-01-02', note: ' bonus ' });
		const d = getPaycheck(db, alice, p)!;
		expect(d).toMatchObject({ amountMinor: 205050, date: '2030-01-02', note: 'bonus' });
		expect(getTransaction(db, alice, d.incomeTxnId!)).toMatchObject({
			amountMinor: 205050,
			date: '2030-01-02',
			categoryId: cat('Paycheck')
		});
		expect(balance(checking)).toBe(100000 + 205050);

		const other = createAccount(db, alice, { name: 'Second checking', type: 'checking' });
		updatePaycheck(db, alice, p, { accountId: other });
		expect(balance(checking)).toBe(100000);
		expect(balance(other)).toBe(205050);
		expect(() => updatePaycheck(db, alice, p, { nextDate: '2030-01-01' })).toThrow('after');
	});

	it('refuses to change reconciled income', () => {
		const p = newExamplePaycheck();
		confirmIncome(db, alice, p);
		db.update(txn).set({ cleared: true }).run();
		reconcileAccount(db, alice, checking, 300000, { date: '2030-01-05' });
		expect(() => updatePaycheck(db, alice, p, { amountMinor: 1 })).toThrow('reconciled');
		updatePaycheck(db, alice, p, { note: 'fine' });
		expect(() => unconfirmIncome(db, alice, p)).toThrow('reconciled');
		expect(balance(checking)).toBe(300000);
	});

	it('refuses to delete a paycheck while anything is ticked', () => {
		const { p, savings } = planExample();
		confirmLine(db, alice, savings, '2030-01-03');
		expect(() => deletePaycheck(db, alice, p)).toThrow('Untick everything');
		unconfirmLine(db, alice, savings);
		confirmIncome(db, alice, p);
		expect(() => deletePaycheck(db, alice, p)).toThrow('Untick everything');
		unconfirmIncome(db, alice, p);
		deletePaycheck(db, alice, p);
		expect(getPaycheck(db, alice, p)).toBeUndefined();
		expect(db.select().from(paycheckLine).all()).toHaveLength(0);
		// The bill occurrence is free again.
		expect(billsDueBetween(db, alice, '2030-01-03', '2030-01-17')[0].plannedLineId).toBeNull();
	});

	it('picks the home paycheck', () => {
		const s = (date: string, status: PaycheckStatus) => ({ date, status });
		expect(pickHomePaycheck([], '2030-01-10')).toBeNull();
		const all = [
			s('2030-01-17', 'planned'),
			s('2030-01-03', 'confirmed'),
			s('2029-12-20', 'confirmed')
		];
		expect(pickHomePaycheck(all, '2030-01-10')?.date).toBe('2030-01-17');
		expect(pickHomePaycheck([...all, s('2029-12-20', 'partial')], '2030-01-10')?.date).toBe(
			'2029-12-20'
		);
		expect(pickHomePaycheck(all.slice(1), '2030-01-10')?.date).toBe('2030-01-03');
		expect(pickHomePaycheck(all.slice(1), '2030-01-03')?.date).toBe('2030-01-03');
	});
});

describe('lines', () => {
	let p: string;
	let cash: string;
	let loan: string;
	beforeEach(() => {
		p = newExamplePaycheck();
		cash = createAccount(db, alice, { name: 'Wallet', type: 'cash' });
		loan = createAccount(db, alice, { name: 'Car loan', type: 'loan' });
	});

	it('enforces the per-kind rules', () => {
		const cases: [Parameters<typeof addLine>[3], string][] = [
			[{ kind: 'savings', amountMinor: 100 }, 'save into'],
			[{ kind: 'savings', amountMinor: 100, toAccountId: visa }, 'debt line'],
			[{ kind: 'savings', amountMinor: 100, toAccountId: checking }, 'different account'],
			[{ kind: 'debt', amountMinor: 100 }, 'card or loan'],
			[{ kind: 'debt', amountMinor: 100, toAccountId: emergency }, 'card or loan'],
			[{ kind: 'spending', amountMinor: 100 }, 'name'],
			[{ kind: 'spending', amountMinor: 100, label: 'x', toAccountId: emergency }, 'cash'],
			[{ kind: 'spending', amountMinor: -1, label: 'x' }, 'zero or more'],
			[{ kind: 'spending', amountMinor: 1.5, label: 'x' }, 'zero or more'],
			[{ kind: 'spending', label: 'x' }, 'zero or more'],
			[{ kind: 'spending', amountMinor: 1, label: 'x', categoryId: 'nope' }, 'Unknown category'],
			[{ kind: 'savings', amountMinor: 1, toAccountId: 'nope' }, 'Unknown account'],
			[
				{ kind: 'savings', amountMinor: 1, toAccountId: emergency, fromAccountId: emergency },
				'different'
			],
			[{ kind: 'bill', amountMinor: 1 }, 'Choose a bill'],
			[{ kind: 'bill', billId: 'nope', dueDate: '2030-01-09' }, 'Unknown bill'],
			[{ kind: 'nope' as 'savings', amountMinor: 1, label: 'x' }, 'Unknown kind']
		];
		for (const [input, message] of cases) {
			expect(() => addLine(db, alice, p, input), message).toThrow(message);
		}
		expect(() =>
			addLine(db, alice, 'nope', { kind: 'spending', amountMinor: 1, label: 'x' })
		).toThrow('Paycheck not found');
	});

	it('labels, sorts and snapshots lines', () => {
		const groceries = addLine(db, alice, p, {
			kind: 'spending',
			amountMinor: 30000,
			categoryId: cat('Groceries')
		});
		const loanPay = addLine(db, alice, p, { kind: 'debt', amountMinor: 0, toAccountId: loan });
		const lines = getPaycheck(db, alice, p)!.lines;
		expect(lines.map((l) => [l.label, l.sort])).toEqual([
			['Netflix', 0],
			['Groceries', 1],
			['Car loan', 2]
		]);
		expect(getLine(db, alice, groceries)?.categoryId).toBe(cat('Groceries'));
		// $0 lines tick without a transaction.
		confirmLine(db, alice, loanPay, '2030-01-04');
		expect(getLine(db, alice, loanPay)).toMatchObject({ status: 'done', txnId: null });

		// Rent (Feb 1) can be added with an edited amount; the bill keeps its own.
		const rentId = listBills(db, alice).find((b) => b.name === 'Rent')!.id;
		const rentLine = addLine(db, alice, p, {
			kind: 'bill',
			billId: rentId,
			dueDate: '2030-02-01',
			amountMinor: 60000
		});
		expect(getLine(db, alice, rentLine)).toMatchObject({
			label: 'Rent',
			amountMinor: 60000,
			fromAccountId: checking,
			categoryId: cat('Rent / Mortgage')
		});
		expect(getBill(db, alice, rentId)?.amountMinor).toBe(120000);
	});

	it('edits and removes planned lines only', () => {
		const { savings, netflix } = planExample(p);
		updateLine(db, alice, savings, { amountMinor: 12000, label: 'Rainy day' });
		expect(getLine(db, alice, savings)).toMatchObject({ amountMinor: 12000, label: 'Rainy day' });
		expect(() => updateLine(db, alice, savings, { toAccountId: visa })).toThrow('debt line');
		updateLine(db, alice, netflix, { amountMinor: 1699 });
		expect(getLine(db, alice, netflix)).toMatchObject({ amountMinor: 1699, label: 'Netflix' });
		expect(() => updateLine(db, alice, netflix, { label: ' ' })).toThrow('name');

		confirmLine(db, alice, savings, '2030-01-03');
		expect(() => updateLine(db, alice, savings, { amountMinor: 1 })).toThrow('Untick');
		expect(() => removeLine(db, alice, savings)).toThrow('Untick');
		unconfirmLine(db, alice, savings);
		removeLine(db, alice, savings);
		expect(getLine(db, alice, savings)).toBeUndefined();
		expect(() => removeLine(db, alice, savings)).toThrow('Line not found');
	});

	it('pays a bill from the credit card: the card moves, checking does not', () => {
		const bill = createBill(db, alice, {
			name: 'Gym',
			amountMinor: 10000,
			frequency: 'monthly',
			dayOfMonth: 4,
			startDate: '2030-01-01',
			accountId: visa,
			categoryId: cat('Personal care')
		});
		// The open plan covers Jan 4, so creating the bill put it in the plan.
		const line = getPaycheck(db, alice, p)!.lines.find((l) => l.billId === bill)!.id;
		expect(getLine(db, alice, line)).toMatchObject({ dueDate: '2030-01-04', status: 'planned' });
		expect(projected(p)).toMatchObject({ Visa: -40000, 'Main checking': 298451 });
		confirmLine(db, alice, line, '2030-01-10');
		expect(balance(visa)).toBe(-40000);
		expect(balance(checking)).toBe(100000);
		expect(getTransaction(db, alice, getLine(db, alice, line)!.txnId!)).toMatchObject({
			accountId: visa,
			date: '2030-01-04',
			amountMinor: -10000,
			categoryId: cat('Personal care')
		});
	});

	it('a bill with a pay-to account is a transfer on its due date', () => {
		const bill = createBill(db, alice, {
			name: 'Visa minimum',
			amountMinor: 3500,
			frequency: 'monthly',
			dayOfMonth: 12,
			startDate: '2030-01-01',
			accountId: checking,
			payToAccountId: visa
		});
		// The open plan covers Jan 12, so creating the bill put it in the plan.
		const line = getPaycheck(db, alice, p)!.lines.find((l) => l.billId === bill)!.id;
		expect(getLine(db, alice, line)).toMatchObject({
			dueDate: '2030-01-12',
			toAccountId: visa,
			status: 'planned'
		});
		confirmLine(db, alice, line, '2030-01-03');
		expect(balance(visa)).toBe(-26500);
		expect(balance(checking)).toBe(96500);
		const t = getTransaction(db, alice, getLine(db, alice, line)!.txnId!)!;
		expect(t).toMatchObject({ date: '2030-01-12', categoryId: null });
		expect(t.transferId).toBeTruthy();
		unconfirmLine(db, alice, line);
		expect(balance(visa)).toBe(-30000);
		expect(balance(checking)).toBe(100000);
	});

	it('debt into an off-budget loan keeps the category on the checking leg', () => {
		const line = addLine(db, alice, p, {
			kind: 'debt',
			amountMinor: 20000,
			toAccountId: loan,
			categoryId: cat('Transportation')
		});
		confirmLine(db, alice, line, '2030-01-05');
		const t = getTransaction(db, alice, getLine(db, alice, line)!.txnId!)!;
		expect(t).toMatchObject({ accountId: checking, categoryId: cat('Transportation') });
		expect(balance(loan)).toBe(20000);
	});

	it('withdraws spending money to cash and tracks category spending', () => {
		const wallet = addLine(db, alice, p, {
			kind: 'spending',
			amountMinor: 5000,
			label: 'Pocket money',
			toAccountId: cash
		});
		expect(projected(p)).toMatchObject({ Wallet: 5000 });
		confirmLine(db, alice, wallet, '2030-01-03');
		expect(balance(cash)).toBe(5000);

		const groceries = addLine(db, alice, p, {
			kind: 'spending',
			amountMinor: 30000,
			categoryId: cat('Groceries')
		});
		const spend = (date: string, amountMinor: number) =>
			createTransaction(db, alice, {
				accountId: checking,
				date,
				amountMinor,
				categoryId: cat('Groceries')
			});
		spend('2030-01-02', -1000); // before the window
		spend('2030-01-03', -4220);
		spend('2030-01-16', -4200);
		spend('2030-01-10', 500); // a refund isn't spending
		spend('2030-01-17', -9999); // next paycheck's window
		const line = getPaycheck(db, alice, p)!.lines.find((l) => l.id === groceries)!;
		expect(line.spentMinor).toBe(8420);
		expect(getPaycheck(db, alice, p)!.spendingMoneyMinor).toBe(30000);
	});

	it('refuses to untick a reconciled transaction; a deleted one just resets', () => {
		const { savings, debt } = planExample(p);
		confirmLine(db, alice, savings, '2030-01-03');
		confirmLine(db, alice, debt, '2030-01-03');
		// Reconcile only the savings side of the transfer.
		db.update(txn).set({ cleared: true }).where(eq(txn.accountId, emergency)).run();
		reconcileAccount(db, alice, emergency, 35000, { date: '2030-01-05' });
		expect(() => unconfirmLine(db, alice, savings)).toThrow('reconciled');
		expect(balance(emergency)).toBe(35000);
		expect(getLine(db, alice, savings)?.status).toBe('done');

		deleteTransaction(db, alice, getLine(db, alice, debt)!.txnId!);
		expect(getLine(db, alice, debt)).toMatchObject({ status: 'done', txnId: null });
		unconfirmLine(db, alice, debt);
		expect(getLine(db, alice, debt)?.status).toBe('planned');
		expect(balance(visa)).toBe(-30000);
	});

	it('unlinks a linked transaction without deleting it', () => {
		const { netflix } = planExample(p);
		const synced = createTransaction(db, alice, {
			accountId: checking,
			date: '2030-01-09',
			amountMinor: -1549,
			payeeName: 'NETFLIX.COM',
			source: 'simplefin'
		});
		db.update(paycheckLine)
			.set({ status: 'done', txnId: synced, txnOrigin: 'linked', doneAt: new Date() })
			.where(eq(paycheckLine.id, netflix))
			.run();
		unconfirmLine(db, alice, netflix);
		expect(getTransaction(db, alice, synced)).toBeDefined();
		expect(getLine(db, alice, netflix)).toMatchObject({ status: 'planned', txnId: null });
	});

	it('confirming twice is a no-op', () => {
		const { savings } = planExample(p);
		confirmLine(db, alice, savings, '2030-01-03');
		confirmLine(db, alice, savings, '2030-01-03');
		expect(balance(emergency)).toBe(35000);
		expect(() => confirmLine(db, alice, savings, 'today')).not.toThrow();
		unconfirmLine(db, alice, savings);
		expect(() => confirmLine(db, alice, savings, 'today')).toThrow('YYYY-MM-DD');
	});
});

describe('isolation', () => {
	it('a second user cannot read, change, confirm or target the first user’s data', () => {
		const { p, savings, netflix } = planExample();
		const bobChecking = createAccount(db, bob, { name: 'Bob checking', type: 'checking' });
		const bobPay = createPaycheck(db, bob, {
			date: '2030-01-03',
			amountMinor: 1000,
			accountId: bobChecking
		});
		const netflixBill = listBills(db, alice).find((b) => b.name === 'Netflix')!.id;

		// Reading.
		expect(getPaycheck(db, bob, p)).toBeUndefined();
		expect(getLine(db, bob, savings)).toBeUndefined();
		expect(getBill(db, bob, netflixBill)).toBeUndefined();
		expect(listPaychecks(db, bob).map((s) => s.id)).toEqual([bobPay]);
		expect(listBills(db, bob, { includeEnded: true })).toEqual([]);
		expect(billsDueBetween(db, bob, '2030-01-01', '2031-01-01')).toEqual([]);
		expect(getPaycheck(db, bob, bobPay)!.projected.map((r) => r.name)).toEqual(['Bob checking']);
		expect(getPaycheck(db, bob, bobPay)!.billsDue).toEqual([]);

		// Changing and confirming.
		const refuse = (fn: () => unknown) => expect(fn).toThrow(ValidationError);
		refuse(() => updatePaycheck(db, bob, p, { amountMinor: 1 }));
		refuse(() => deletePaycheck(db, bob, p));
		refuse(() => confirmIncome(db, bob, p));
		refuse(() => unconfirmIncome(db, bob, p));
		refuse(() => addLine(db, bob, p, { kind: 'spending', amountMinor: 1, label: 'x' }));
		refuse(() => allocateLeftover(db, bob, p));
		refuse(() => updateLine(db, bob, savings, { amountMinor: 1 }));
		refuse(() => removeLine(db, bob, savings));
		refuse(() => confirmLine(db, bob, savings, '2030-01-03'));
		refuse(() => unconfirmLine(db, bob, savings));
		expect(getPaycheck(db, alice, p)!.lines).toHaveLength(4);
		expect(getPaycheck(db, alice, p)!.incomeTxnId).toBeNull();
		expect(balance(emergency)).toBe(25000);

		// Pointing Bob's data at Alice's accounts, categories and bills.
		refuse(() =>
			createPaycheck(db, bob, { date: '2030-01-03', amountMinor: 1, accountId: checking })
		);
		refuse(() =>
			createPaycheck(db, bob, {
				date: '2030-01-03',
				amountMinor: 1,
				accountId: bobChecking,
				incomeCategoryId: cat('Paycheck')
			})
		);
		refuse(() => updatePaycheck(db, bob, bobPay, { accountId: checking }));
		refuse(() =>
			addLine(db, bob, bobPay, { kind: 'savings', amountMinor: 1, toAccountId: emergency })
		);
		refuse(() => addLine(db, bob, bobPay, { kind: 'debt', amountMinor: 1, toAccountId: visa }));
		refuse(() =>
			addLine(db, bob, bobPay, {
				kind: 'spending',
				amountMinor: 1,
				label: 'x',
				fromAccountId: checking
			})
		);
		refuse(() =>
			addLine(db, bob, bobPay, {
				kind: 'spending',
				amountMinor: 1,
				categoryId: cat('Groceries')
			})
		);
		refuse(() =>
			addLine(db, bob, bobPay, { kind: 'bill', billId: netflixBill, dueDate: '2030-02-09' })
		);
		refuse(() =>
			createPaycheck(
				db,
				bob,
				{ date: '2030-01-03', amountMinor: 1, accountId: bobChecking },
				{ billOccurrences: [{ billId: netflixBill, dueDate: '2030-02-09' }] }
			)
		);
		refuse(() =>
			createBill(db, bob, {
				name: 'Sneaky',
				amountMinor: 1,
				frequency: 'once',
				startDate: '2030-01-01',
				accountId: checking
			})
		);
		refuse(() =>
			createBill(db, bob, {
				name: 'Sneaky',
				amountMinor: 1,
				frequency: 'once',
				startDate: '2030-01-01',
				accountId: bobChecking,
				payToAccountId: visa
			})
		);
		refuse(() =>
			upsertPaySchedule(db, bob, {
				frequency: 'weekly',
				amountMinor: 1,
				anchorDate: '2030-01-03',
				depositAccountId: checking
			})
		);
		expect(listPaychecks(db, bob)).toHaveLength(1);
		expect(getPaycheck(db, bob, bobPay)!.lines).toHaveLength(0);

		// Alice's plan still works and Bob's suggestions ignore her paychecks and schedule.
		confirmLine(db, alice, netflix, '2030-01-09');
		expect(balance(checking)).toBe(98451);
		expect(suggestNextPaycheck(db, bob, '2030-01-03').amountMinor).toBeNull();
	});
});

import { and, count, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/client';
import { paycheckLine, txn } from '../db/schema';
import { importTransactions } from '../import/importer';
import { completeOnboarding } from '../onboarding';
import { makeUser, setupTest } from '../testing/setup';
import { createAccount, getAccountWithBalance, listAccounts } from './accounts';
import { createBill } from './bills';
import { listCategories } from './categories';
import { createInvite } from './invites';
import {
	addLine,
	confirmLine,
	createPaycheck,
	getLine,
	getPaycheck,
	linkIncome,
	linkLine,
	suggestIncomeMatch,
	suggestLineMatches,
	unconfirmIncome,
	unconfirmLine
} from './paychecks';
import {
	createTransaction,
	getTransaction,
	getTransferPartner,
	ValidationError,
	type TxnInput
} from './transactions';

let db: Db;
let alice: string;
let bob: string;
let checking: string;
let emergency: string;
let visa: string;
let cat: (name: string) => string;
/** The 2030-01-03 paycheck with Netflix (due Jan 9), $100 to Emergency and $150 to Visa. */
let p: string;
let netflix: string;
let savings: string;
let debt: string;

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
	emergency = accounts.find((a) => a.name === 'Emergency')!.id;
	visa = accounts.find((a) => a.name === 'Visa')!.id;
	const cats = listCategories(db, alice);
	cat = (name) => cats.find((c) => c.name === name)!.id;
	const bill = createBill(db, alice, {
		name: 'Netflix',
		amountMinor: 1549,
		frequency: 'monthly',
		dayOfMonth: 9,
		startDate: '2029-12-09',
		accountId: checking,
		categoryId: cat('Subscriptions')
	});
	p = createPaycheck(
		db,
		alice,
		{ date: '2030-01-03', amountMinor: 200000, accountId: checking },
		{ billOccurrences: [{ billId: bill, dueDate: '2030-01-09' }] }
	);
	netflix = getPaycheck(db, alice, p)!.lines[0].id;
	savings = addLine(db, alice, p, { kind: 'savings', amountMinor: 10000, toAccountId: emergency });
	debt = addLine(db, alice, p, { kind: 'debt', amountMinor: 15000, toAccountId: visa });
});

const synced = (input: Omit<TxnInput, 'source'>, userId = alice) =>
	createTransaction(db, userId, { source: 'simplefin', ...input });
const txnCount = () => db.select({ n: count() }).from(txn).where(eq(txn.userId, alice)).get()!.n;
const matchFor = (lineId: string) =>
	suggestLineMatches(db, alice, p).find((m) => m.lineId === lineId);
const refuse = (fn: () => unknown, message?: string) => {
	expect(fn).toThrow(ValidationError);
	if (message) expect(fn).toThrow(message);
};

describe('suggestLineMatches', () => {
	it('suggests a synced bill payment within 3 days of the due date, for that line only', () => {
		const id = synced({
			accountId: checking,
			date: '2030-01-10',
			amountMinor: -1549,
			payeeName: 'Netflix.com',
			description: 'NETFLIX.COM'
		});
		expect(suggestLineMatches(db, alice, p)).toEqual([
			{
				lineId: netflix,
				txnId: id,
				date: '2030-01-10',
				amountMinor: -1549,
				payeeName: 'Netflix.com',
				description: 'NETFLIX.COM'
			}
		]);
		expect(getPaycheck(db, alice, p)!.matches).toEqual({
			lines: { [netflix]: expect.objectContaining({ txnId: id }) },
			income: null
		});
	});

	it('picks the closest date and ignores rows outside the window or on other accounts', () => {
		synced({ accountId: checking, date: '2030-01-13', amountMinor: -1549 }); // 4 days late
		synced({ accountId: visa, date: '2030-01-09', amountMinor: -1549 }); // paid from the card
		synced({ accountId: checking, date: '2030-01-09', amountMinor: -1550 }); // wrong amount
		expect(suggestLineMatches(db, alice, p)).toEqual([]);
		synced({ accountId: checking, date: '2030-01-06', amountMinor: -1549 });
		const near = synced({ accountId: checking, date: '2030-01-08', amountMinor: -1549 });
		expect(matchFor(netflix)?.txnId).toBe(near);
	});

	it('ignores manual transactions and ones already linked', () => {
		createTransaction(db, alice, { accountId: checking, date: '2030-01-09', amountMinor: -1549 });
		expect(suggestLineMatches(db, alice, p)).toEqual([]);

		const id = synced({ accountId: checking, date: '2030-01-09', amountMinor: -1549 });
		linkLine(db, alice, netflix, id);
		unconfirmLine(db, alice, netflix);
		// Unlinked again, so offered again; then referenced by another plan's line, so not.
		expect(matchFor(netflix)?.txnId).toBe(id);
		const other = createPaycheck(db, alice, {
			date: '2030-01-03',
			amountMinor: 1000,
			accountId: checking
		});
		const line = addLine(db, alice, other, { kind: 'spending', amountMinor: 1549, label: 'x' });
		db.update(paycheckLine)
			.set({ status: 'done', txnId: id, txnOrigin: 'linked' })
			.where(eq(paycheckLine.id, line))
			.run();
		expect(suggestLineMatches(db, alice, p)).toEqual([]);
	});

	it('never suggests the same transaction for two lines', () => {
		addLine(db, alice, p, { kind: 'debt', amountMinor: 1549, toAccountId: visa });
		synced({ accountId: checking, date: '2030-01-09', amountMinor: -1549 });
		// The second line is a transfer and the row isn't one, so only Netflix matches.
		expect(suggestLineMatches(db, alice, p).map((m) => m.lineId)).toEqual([netflix]);
	});

	it('matches a two-row savings transfer from bank sync', () => {
		const out = synced({ accountId: checking, date: '2030-01-03', amountMinor: -10000 });
		expect(matchFor(savings)).toBeUndefined(); // no deposit on the savings side yet
		const into = synced({ accountId: emergency, date: '2030-01-04', amountMinor: 10000 });
		expect(matchFor(savings)).toMatchObject({ txnId: out, partnerTxnId: into });
	});

	it('matches an existing transfer whose other leg is on the target account', () => {
		const id = synced({
			accountId: checking,
			date: '2030-01-03',
			amountMinor: -15000,
			transferAccountId: visa
		});
		expect(matchFor(debt)).toMatchObject({ txnId: id });
		expect(matchFor(debt)?.partnerTxnId).toBeUndefined();
		// A transfer to the card doesn't pay the savings line, even with the right amount.
		synced({
			accountId: checking,
			date: '2030-01-03',
			amountMinor: -10000,
			transferAccountId: visa
		});
		expect(matchFor(savings)).toBeUndefined();
	});

	it('gives another user no suggestions', () => {
		synced({ accountId: checking, date: '2030-01-09', amountMinor: -1549 });
		synced({ accountId: checking, date: '2030-01-03', amountMinor: 200000 });
		expect(suggestLineMatches(db, bob, p)).toEqual([]);
		expect(suggestIncomeMatch(db, bob, p)).toBeNull();
		const bobChecking = createAccount(db, bob, { name: 'Bob checking', type: 'checking' });
		const bobPay = createPaycheck(db, bob, {
			date: '2030-01-03',
			amountMinor: 200000,
			accountId: bobChecking
		});
		addLine(db, bob, bobPay, { kind: 'spending', amountMinor: 1549, label: 'x' });
		expect(suggestIncomeMatch(db, bob, bobPay)).toBeNull();
		expect(getPaycheck(db, bob, bobPay)!.matches).toEqual({ lines: {}, income: null });
	});
});

describe('linkLine', () => {
	it('ticks the line without creating a transaction and sets the category', () => {
		importTransactions(
			db,
			alice,
			checking,
			[{ date: '2030-01-10', amountMinor: -1549, description: 'NETFLIX.COM' }],
			{ source: 'csv' }
		);
		const m = matchFor(netflix)!;
		const before = txnCount();
		linkLine(db, alice, netflix, m.txnId);
		expect(txnCount()).toBe(before);
		expect(getLine(db, alice, netflix)).toMatchObject({
			status: 'done',
			txnId: m.txnId,
			txnOrigin: 'linked'
		});
		expect(getLine(db, alice, netflix)!.doneAt).toBeInstanceOf(Date);
		expect(getTransaction(db, alice, m.txnId)?.categoryId).toBe(cat('Subscriptions'));
		expect(suggestLineMatches(db, alice, p)).toEqual([]);
		refuse(() => linkLine(db, alice, netflix, m.txnId), 'already ticked');

		// Unticking unlinks: the transaction stays, the line is planned again.
		unconfirmLine(db, alice, netflix);
		expect(txnCount()).toBe(before);
		expect(getTransaction(db, alice, m.txnId)).toBeDefined();
		expect(getLine(db, alice, netflix)).toMatchObject({
			status: 'planned',
			txnId: null,
			txnOrigin: null,
			doneAt: null
		});
	});

	it('keeps a category the transaction already has', () => {
		const id = synced({
			accountId: checking,
			date: '2030-01-09',
			amountMinor: -1549,
			categoryId: cat('Groceries')
		});
		linkLine(db, alice, netflix, id);
		expect(getTransaction(db, alice, id)?.categoryId).toBe(cat('Groceries'));
	});

	it('turns a two-row savings transfer into one transfer', () => {
		const out = synced({
			accountId: checking,
			date: '2030-01-03',
			amountMinor: -10000,
			categoryId: cat('Groceries')
		});
		const into = synced({ accountId: emergency, date: '2030-01-04', amountMinor: 10000 });
		const m = matchFor(savings)!;
		const before = txnCount();
		const balances = [checking, emergency].map(
			(id) => getAccountWithBalance(db, alice, id)!.balanceMinor
		);
		linkLine(db, alice, savings, m.txnId, m.partnerTxnId);
		expect(txnCount()).toBe(before);
		const a = getTransaction(db, alice, out)!;
		const b = getTransaction(db, alice, into)!;
		expect(a.transferId).toBeTruthy();
		expect(b.transferId).toBe(a.transferId);
		expect([a.categoryId, b.categoryId]).toEqual([null, null]);
		expect(getTransferPartner(db, alice, a)?.id).toBe(into);
		expect(
			[checking, emergency].map((id) => getAccountWithBalance(db, alice, id)!.balanceMinor)
		).toEqual(balances);
		expect(getLine(db, alice, savings)).toMatchObject({ status: 'done', txnId: out });
		expect(suggestLineMatches(db, alice, p)).toEqual([]);

		unconfirmLine(db, alice, savings);
		expect(txnCount()).toBe(before);
		expect(getTransaction(db, alice, into)).toBeDefined();
	});

	it('re-checks what the client sends', () => {
		const ok = synced({ accountId: checking, date: '2030-01-09', amountMinor: -1549 });
		const wrongAmount = synced({ accountId: checking, date: '2030-01-09', amountMinor: -1500 });
		const manual = createTransaction(db, alice, {
			accountId: checking,
			date: '2030-01-09',
			amountMinor: -1549
		});
		const onCard = synced({ accountId: visa, date: '2030-01-09', amountMinor: -1549 });
		const bobChecking = createAccount(db, bob, { name: 'Bob checking', type: 'checking' });
		const bobs = synced({ accountId: bobChecking, date: '2030-01-09', amountMinor: -1549 }, bob);

		refuse(() => linkLine(db, alice, netflix, wrongAmount), 'amounts');
		refuse(() => linkLine(db, alice, netflix, manual), 'synced');
		refuse(() => linkLine(db, alice, netflix, onCard), 'different account');
		refuse(() => linkLine(db, alice, netflix, bobs), 'not found');
		refuse(() => linkLine(db, alice, netflix, 'nope'), 'not found');
		refuse(() => linkLine(db, alice, netflix, ok, ok), 'isn’t a transfer');
		refuse(() => linkLine(db, bob, netflix, ok), 'Line not found');

		// Transfer lines need the matching deposit on the target account.
		const out = synced({ accountId: checking, date: '2030-01-03', amountMinor: -10000 });
		const wrongDeposit = synced({ accountId: emergency, date: '2030-01-03', amountMinor: 9999 });
		const elsewhere = synced({ accountId: visa, date: '2030-01-03', amountMinor: 10000 });
		refuse(() => linkLine(db, alice, savings, out), 'matching deposit');
		refuse(() => linkLine(db, alice, savings, out, wrongDeposit), 'amounts');
		refuse(() => linkLine(db, alice, savings, out, elsewhere), 'different account');

		// Spending earmarked in checking creates no transaction, so there is nothing to link.
		const envelope = addLine(db, alice, p, { kind: 'spending', amountMinor: 1549, label: 'Fun' });
		refuse(() => linkLine(db, alice, envelope, ok), 'nothing to link');

		// A transaction ticked by another line can't be linked again.
		linkLine(db, alice, netflix, ok);
		const gym = createBill(db, alice, {
			name: 'Gym',
			amountMinor: 1549,
			frequency: 'once',
			startDate: '2030-01-09',
			accountId: checking
		});
		const again = addLine(db, alice, p, { kind: 'bill', billId: gym, dueDate: '2030-01-09' });
		db.update(txn).set({ categoryId: null }).where(eq(txn.id, ok)).run();
		refuse(() => linkLine(db, alice, again, ok), 'already linked');

		expect(getLine(db, alice, savings)?.status).toBe('planned');
		expect(getTransaction(db, bob, bobs)?.categoryId).toBeNull();
	});

	it('does not offer a transaction the app created by ticking', () => {
		confirmLine(db, alice, savings, '2030-01-03');
		const created = getLine(db, alice, savings)!.txnId!;
		db.update(txn)
			.set({ source: 'simplefin' })
			.where(and(eq(txn.userId, alice), eq(txn.id, created)))
			.run();
		unconfirmLine(db, alice, debt);
		expect(suggestLineMatches(db, alice, p)).toEqual([]);
	});
});

describe('income', () => {
	it('suggests and links a synced deposit, and unticking keeps it', () => {
		synced({ accountId: checking, date: '2030-01-03', amountMinor: 200000 });
		const groceriesRefund = synced({
			accountId: checking,
			date: '2030-01-03',
			amountMinor: 200000,
			categoryId: cat('Groceries')
		});
		const pay = synced({
			accountId: checking,
			date: '2030-01-02',
			amountMinor: 200000,
			description: 'ACME PAYROLL'
		});
		// The first row (same date) wins over the earlier one; the categorized refund never does.
		const first = suggestIncomeMatch(db, alice, p)!;
		expect(first.date).toBe('2030-01-03');
		expect(first.txnId).not.toBe(groceriesRefund);
		refuse(() => linkIncome(db, alice, p, groceriesRefund), 'isn’t income');

		const before = txnCount();
		linkIncome(db, alice, p, pay);
		expect(txnCount()).toBe(before);
		const detail = getPaycheck(db, alice, p)!;
		expect(detail).toMatchObject({ incomeTxnId: pay, incomeConfirmed: true });
		expect(detail.matches.income).toBeNull();
		expect(getTransaction(db, alice, pay)?.categoryId).toBe(cat('Paycheck'));
		refuse(() => linkIncome(db, alice, p, first.txnId), 'already received');

		unconfirmIncome(db, alice, p);
		expect(txnCount()).toBe(before);
		expect(getTransaction(db, alice, pay)).toBeDefined();
		expect(getPaycheck(db, alice, p)!.incomeTxnId).toBeNull();
	});

	it('refuses mismatches and other users', () => {
		const wrong = synced({ accountId: checking, date: '2030-01-03', amountMinor: 199999 });
		const onSavings = synced({ accountId: emergency, date: '2030-01-03', amountMinor: 200000 });
		const bobChecking = createAccount(db, bob, { name: 'Bob checking', type: 'checking' });
		const bobs = synced({ accountId: bobChecking, date: '2030-01-03', amountMinor: 200000 }, bob);
		const ok = synced({ accountId: checking, date: '2030-01-03', amountMinor: 200000 });
		refuse(() => linkIncome(db, alice, p, wrong), 'amounts');
		refuse(() => linkIncome(db, alice, p, onSavings), 'different account');
		refuse(() => linkIncome(db, alice, p, bobs), 'not found');
		refuse(() => linkIncome(db, bob, p, ok), 'Paycheck not found');
		expect(getPaycheck(db, alice, p)!.incomeTxnId).toBeNull();
	});
});

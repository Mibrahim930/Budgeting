import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/client';
import { completeOnboarding } from '../onboarding';
import { makeUser, setupTest } from '../testing/setup';
import { createAccount, listAccounts } from './accounts';
import {
	createBill,
	createBillAndPlan,
	endBill,
	getBill,
	updateBill,
	type BillInput
} from './bills';
import { syncBillIntoPlans } from './bill-sync';
import { listCategories } from './categories';
import { createInvite } from './invites';
import {
	confirmIncome,
	confirmLine,
	createPaycheck,
	getLine,
	getPaycheck,
	listPaychecks,
	removeLine
} from './paychecks';

let db: Db;
let alice: string;
let bob: string;
let checking: string;
let visa: string;
let cat: (name: string) => string;
/** Alice's open 2030-01-03 → 2030-01-17 plan. */
let p: string;

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
			savings: [],
			debts: [{ name: 'Visa', type: 'credit', owedMinor: 30000 }],
			pay: { frequency: 'biweekly', amountMinor: 200000, anchorDate: '2030-01-03' }
		},
		'2029-12-01'
	));
	visa = listAccounts(db, alice).find((a) => a.name === 'Visa')!.id;
	const cats = listCategories(db, alice);
	cat = (name) => cats.find((c) => c.name === name)!.id;
	p = createPaycheck(db, alice, {
		date: '2030-01-03',
		amountMinor: 200000,
		accountId: checking,
		nextDate: '2030-01-17'
	});
});

const gym = (patch: Partial<BillInput> = {}): BillInput => ({
	name: 'Gym',
	amountMinor: 10000,
	frequency: 'monthly',
	dayOfMonth: 16,
	startDate: '2030-01-16',
	accountId: checking,
	categoryId: cat('Personal care'),
	...patch
});

const billLines = (paycheckId: string, billId: string) =>
	getPaycheck(db, alice, paycheckId)!.lines.filter((l) => l.billId === billId);

describe('creating a bill', () => {
	it('adds a planned line to an open plan whose window holds the due date', () => {
		const { id, added } = createBillAndPlan(db, alice, gym());
		expect(added).toEqual([{ paycheckId: p, lineId: expect.any(String), dueDate: '2030-01-16' }]);
		expect(billLines(p, id)).toEqual([
			expect.objectContaining({
				kind: 'bill',
				label: 'Gym',
				amountMinor: 10000,
				dueDate: '2030-01-16',
				status: 'planned',
				fromAccountId: checking,
				categoryId: cat('Personal care')
			})
		]);
		expect(getPaycheck(db, alice, p)!.totals.left).toBe(190000);
	});

	it('does not add to a confirmed plan', () => {
		confirmIncome(db, alice, p);
		expect(listPaychecks(db, alice)[0].status).toBe('confirmed');
		const { id, added } = createBillAndPlan(db, alice, gym());
		expect(added).toEqual([]);
		expect(billLines(p, id)).toEqual([]);
	});

	it('does not add a due date outside every window', () => {
		const { id, added } = createBillAndPlan(
			db,
			alice,
			gym({ dayOfMonth: 20, startDate: '2030-01-20' })
		);
		expect(added).toEqual([]);
		expect(billLines(p, id)).toEqual([]);
		// A due date on the next payday belongs to the next paycheck (half-open window).
		expect(
			createBillAndPlan(db, alice, gym({ dayOfMonth: 17, startDate: '2030-01-17' })).added
		).toEqual([]);
	});

	it('adds to every open plan covering a due date, and skips dates already planned', () => {
		const q = createPaycheck(db, alice, {
			date: '2030-01-17',
			amountMinor: 200000,
			accountId: checking,
			nextDate: '2030-01-31'
		});
		const weekly = createBill(db, alice, {
			...gym(),
			name: 'Lunch club',
			frequency: 'every_n_weeks',
			intervalWeeks: 1,
			startDate: '2030-01-06'
		});
		expect(billLines(p, weekly).map((l) => l.dueDate)).toEqual(['2030-01-06', '2030-01-13']);
		expect(billLines(q, weekly).map((l) => l.dueDate)).toEqual(['2030-01-20', '2030-01-27']);
		// Syncing again adds nothing new.
		expect(syncBillIntoPlans(db, alice, weekly)).toEqual([]);
	});
});

describe('updating a bill', () => {
	it('moves a planned line when the day changes', () => {
		const id = createBill(db, alice, gym());
		const [before] = billLines(p, id);
		updateBill(db, alice, id, gym({ dayOfMonth: 10, startDate: '2030-01-10' }));
		const after = billLines(p, id);
		expect(after.map((l) => l.dueDate)).toEqual(['2030-01-10']);
		expect(getLine(db, alice, before.id)).toBeUndefined();
	});

	it('drops a planned line that leaves every window', () => {
		const id = createBill(db, alice, gym());
		updateBill(db, alice, id, gym({ dayOfMonth: 25, startDate: '2030-01-25' }));
		expect(billLines(p, id)).toEqual([]);
	});

	it('refreshes planned lines from the bill but leaves done lines alone', () => {
		const q = createPaycheck(db, alice, {
			date: '2029-12-01',
			amountMinor: 200000,
			accountId: checking,
			nextDate: '2030-01-03'
		});
		const id = createBill(db, alice, gym({ dayOfMonth: 16, startDate: '2029-12-16' }));
		const [done] = billLines(q, id);
		const [planned] = billLines(p, id);
		confirmLine(db, alice, done.id, '2029-12-16');

		updateBill(
			db,
			alice,
			id,
			gym({
				name: 'Gym membership',
				amountMinor: 12000,
				startDate: '2029-12-16',
				accountId: visa,
				categoryId: cat('Subscriptions')
			})
		);
		expect(getLine(db, alice, planned.id)).toMatchObject({
			label: 'Gym membership',
			amountMinor: 12000,
			fromAccountId: visa,
			categoryId: cat('Subscriptions'),
			status: 'planned'
		});
		expect(getLine(db, alice, done.id)).toMatchObject({
			label: 'Gym',
			amountMinor: 10000,
			fromAccountId: checking,
			categoryId: cat('Personal care'),
			status: 'done'
		});
	});

	it('puts a removed occurrence back on the next change', () => {
		const id = createBill(db, alice, gym());
		removeLine(db, alice, billLines(p, id)[0].id);
		expect(billLines(p, id)).toEqual([]);
		updateBill(db, alice, id, gym({ amountMinor: 11000 }));
		expect(billLines(p, id).map((l) => [l.dueDate, l.amountMinor])).toEqual([
			['2030-01-16', 11000]
		]);
	});
});

describe('ending a bill', () => {
	it('removes planned lines after the end date and keeps earlier ones', () => {
		const weekly = createBill(db, alice, {
			...gym(),
			name: 'Lunch club',
			frequency: 'every_n_weeks',
			intervalWeeks: 1,
			startDate: '2030-01-06'
		});
		const [first] = billLines(p, weekly);
		confirmLine(db, alice, first.id, '2030-01-06');
		expect(billLines(p, weekly).map((l) => l.dueDate)).toEqual(['2030-01-06', '2030-01-13']);
		endBill(db, alice, weekly, '2030-01-10');
		expect(billLines(p, weekly).map((l) => [l.dueDate, l.status])).toEqual([
			['2030-01-06', 'done']
		]);
		expect(getBill(db, alice, weekly)?.endedAt).toBe('2030-01-10');
	});
});

describe('isolation', () => {
	it("a bill never lands in another user's plan", () => {
		const bobChecking = createAccount(db, bob, { name: 'Bob checking', type: 'checking' });
		const bobPay = createPaycheck(db, bob, {
			date: '2030-01-03',
			amountMinor: 1000,
			accountId: bobChecking,
			nextDate: '2030-01-17'
		});
		const { id, added } = createBillAndPlan(
			db,
			bob,
			gym({ accountId: bobChecking, categoryId: null })
		);
		expect(added).toEqual([
			{ paycheckId: bobPay, lineId: expect.any(String), dueDate: '2030-01-16' }
		]);
		expect(getPaycheck(db, alice, p)!.lines).toEqual([]);

		// Alice's bill syncs into Alice's plan only; syncing Alice's bill as Bob does nothing.
		const aliceGym = createBill(db, alice, gym());
		expect(syncBillIntoPlans(db, bob, aliceGym)).toEqual([]);
		expect(getPaycheck(db, bob, bobPay)!.lines.map((l) => l.billId)).toEqual([id]);
		expect(billLines(p, aliceGym)).toHaveLength(1);
		expect(() => updateBill(db, bob, aliceGym, gym({ accountId: bobChecking }))).toThrow(
			'Bill not found'
		);
		expect(billLines(p, aliceGym)[0].amountMinor).toBe(10000);
	});
});

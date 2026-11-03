import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/client';
import { makeUser, setupTest } from '../testing/setup';
import { createAccount } from './accounts';
import {
	billsDueBetween,
	createBill,
	deleteBill,
	endBill,
	getBill,
	listBills,
	updateBill,
	type BillInput
} from './bills';
import { listCategories } from './categories';
import { addLine, confirmLine, createPaycheck, getLine, getPaycheck } from './paychecks';
import { ValidationError } from './transactions';

let db: Db;
let user: string;
let checking: string;
let savings: string;
let card: string;
let loan: string;
let cat: (name: string) => string;

beforeEach(async () => {
	const t = setupTest();
	db = t.db;
	user = await makeUser(db, t.auth);
	checking = createAccount(db, user, { name: 'Checking', type: 'checking' });
	savings = createAccount(db, user, { name: 'Savings', type: 'savings' });
	card = createAccount(db, user, { name: 'Visa', type: 'credit' });
	loan = createAccount(db, user, { name: 'Car loan', type: 'loan' });
	const cats = listCategories(db, user);
	cat = (name) => cats.find((c) => c.name === name)!.id;
});

const rent = (): BillInput => ({
	name: 'Rent',
	amountMinor: 120000,
	frequency: 'monthly',
	dayOfMonth: 1,
	startDate: '2030-01-01',
	accountId: checking,
	categoryId: cat('Rent / Mortgage')
});

describe('bill validation', () => {
	const cases: [string, Partial<BillInput>, string][] = [
		['blank name', { name: '  ' }, 'name'],
		['zero amount', { amountMinor: 0 }, 'more than zero'],
		['fractional amount', { amountMinor: 1.5 }, 'more than zero'],
		['unknown frequency', { frequency: 'daily' as 'once' }, 'how often'],
		['bad start date', { startDate: '2030/01/01' }, 'YYYY-MM-DD'],
		['bad end date', { endedAt: 'soon' }, 'YYYY-MM-DD'],
		['end before start', { endedAt: '2029-12-31' }, 'before the first due date'],
		['monthly without a day', { dayOfMonth: null }, 'Day of month'],
		['monthly day 32', { dayOfMonth: 32 }, 'Day of month'],
		['monthly day 0', { dayOfMonth: 0 }, 'Day of month'],
		['yearly without a month', { frequency: 'yearly', monthOfYear: null }, 'Month must'],
		['yearly month 13', { frequency: 'yearly', monthOfYear: 13 }, 'Month must'],
		['weekly without interval', { frequency: 'every_n_weeks' }, 'Weeks'],
		['weekly interval 53', { frequency: 'every_n_weeks', intervalWeeks: 53 }, 'Weeks'],
		['unknown paid-from', { accountId: 'nope' }, 'Unknown account'],
		['unknown category', { categoryId: 'nope' }, 'Unknown category'],
		['unknown pay-to', { payToAccountId: 'nope' }, 'Unknown account'],
		['pay-to savings', { payToAccountId: 'SAVINGS' }, 'credit card or loan'],
		['pay-to itself', { accountId: 'CARD', payToAccountId: 'CARD' }, 'paid from']
	];
	for (const [name, patch, message] of cases) {
		it(`rejects ${name}`, () => {
			const ids: Record<string, string> = { SAVINGS: savings, CARD: card };
			const fix = (v: unknown) => (typeof v === 'string' && ids[v]) || v;
			const input = Object.fromEntries(
				Object.entries({ ...rent(), ...patch }).map(([k, v]) => [k, fix(v)])
			) as unknown as BillInput;
			expect(() => createBill(db, user, input)).toThrow(ValidationError);
			expect(() => createBill(db, user, input)).toThrow(message);
		});
	}

	it('accepts every cadence and drops fields that do not apply', () => {
		const id = createBill(db, user, {
			...rent(),
			name: 'Insurance',
			frequency: 'yearly',
			dayOfMonth: 29,
			monthOfYear: 2,
			intervalWeeks: 4
		});
		expect(getBill(db, user, id)).toMatchObject({
			dayOfMonth: 29,
			monthOfYear: 2,
			intervalWeeks: null
		});
		const weekly = createBill(db, user, {
			...rent(),
			name: 'Cleaner',
			frequency: 'every_n_weeks',
			intervalWeeks: 2
		});
		expect(getBill(db, user, weekly)).toMatchObject({ dayOfMonth: null, intervalWeeks: 2 });
		const once = createBill(db, user, { ...rent(), name: 'Repair', frequency: 'once' });
		expect(getBill(db, user, once)).toMatchObject({ dayOfMonth: null, frequency: 'once' });
		const payment = createBill(db, user, { ...rent(), name: 'Car', payToAccountId: loan });
		expect(getBill(db, user, payment)?.payToAccountId).toBe(loan);
	});
});

describe('bills', () => {
	it('lists bills with names and next due date, hiding ended ones', () => {
		createBill(db, user, rent());
		createBill(db, user, {
			...rent(),
			name: 'Visa minimum',
			amountMinor: 3500,
			dayOfMonth: 20,
			categoryId: null,
			payToAccountId: card
		});
		createBill(db, user, { ...rent(), name: 'Old gym', endedAt: '2030-02-01' });

		const list = listBills(db, user, { asOf: '2030-02-10' });
		expect(list.map((b) => [b.name, b.nextDue])).toEqual([
			['Rent', '2030-03-01'],
			['Visa minimum', '2030-02-20']
		]);
		expect(list[0]).toMatchObject({ accountName: 'Checking', categoryName: 'Rent / Mortgage' });
		expect(list[1]).toMatchObject({ payToAccountName: 'Visa', categoryName: null });
		const all = listBills(db, user, { asOf: '2030-02-10', includeEnded: true });
		expect(all.find((b) => b.name === 'Old gym')).toMatchObject({ ended: true, nextDue: null });
	});

	it('updates and ends a bill', () => {
		const id = createBill(db, user, rent());
		updateBill(db, user, id, { ...rent(), amountMinor: 125000, dayOfMonth: 3 });
		expect(getBill(db, user, id)).toMatchObject({ amountMinor: 125000, dayOfMonth: 3 });
		expect(() => endBill(db, user, id, '2029-01-01')).toThrow('before the first due date');
		endBill(db, user, id, '2030-03-03');
		expect(listBills(db, user, { asOf: '2030-03-04' })).toHaveLength(0);
		expect(() => updateBill(db, user, 'nope', rent())).toThrow('Bill not found');
	});

	it('expands occurrences in a window and marks the ones already planned', () => {
		const rentId = createBill(db, user, rent());
		const netflix = createBill(db, user, {
			...rent(),
			name: 'Netflix',
			amountMinor: 1549,
			dayOfMonth: 9,
			startDate: '2029-12-09',
			categoryId: cat('Subscriptions')
		});
		const due = billsDueBetween(db, user, '2030-01-01', '2030-03-01');
		expect(due.map((o) => [o.name, o.dueDate])).toEqual([
			['Rent', '2030-01-01'],
			['Netflix', '2030-01-09'],
			['Rent', '2030-02-01'],
			['Netflix', '2030-02-09']
		]);
		expect(due.every((o) => o.plannedLineId === null)).toBe(true);

		const p = createPaycheck(
			db,
			user,
			{ date: '2030-01-03', amountMinor: 200000, accountId: checking },
			{ billOccurrences: [{ billId: netflix, dueDate: '2030-01-09' }] }
		);
		const marked = billsDueBetween(db, user, '2030-01-01', '2030-03-01');
		const jan9 = marked.find((o) => o.dueDate === '2030-01-09')!;
		expect(jan9).toMatchObject({
			billId: netflix,
			plannedPaycheckId: p,
			categoryName: 'Subscriptions',
			accountName: 'Checking'
		});
		expect(jan9.plannedLineId).toBe(getPaycheck(db, user, p)!.lines[0].id);
		expect(marked.filter((o) => o.plannedLineId)).toHaveLength(1);
		expect(marked.find((o) => o.billId === rentId)?.plannedLineId).toBeNull();
		expect(billsDueBetween(db, user, '2030-01-10', '2030-01-10')).toEqual([]);
	});

	it('deleting a bill drops planned lines but keeps done ones', () => {
		const id = createBill(db, user, rent());
		const p = createPaycheck(db, user, {
			date: '2030-01-01',
			amountMinor: 300000,
			accountId: checking,
			nextDate: '2030-03-01'
		});
		const done = addLine(db, user, p, { kind: 'bill', billId: id, dueDate: '2030-01-01' });
		const planned = addLine(db, user, p, { kind: 'bill', billId: id, dueDate: '2030-02-01' });
		confirmLine(db, user, done, '2030-01-01');

		deleteBill(db, user, id);
		expect(getBill(db, user, id)).toBeUndefined();
		expect(getLine(db, user, planned)).toBeUndefined();
		expect(getLine(db, user, done)).toMatchObject({
			billId: null,
			label: 'Rent',
			amountMinor: 120000,
			status: 'done'
		});
	});
});

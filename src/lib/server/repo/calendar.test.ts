import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/client';
import { completeOnboarding } from '../onboarding';
import { makeUser, setupTest } from '../testing/setup';
import { createBill } from './bills';
import { calendarMonth } from './calendar';
import { createInvite } from './invites';
import { confirmLine, createPaycheck, getPaycheck } from './paychecks';
import { ValidationError } from './transactions';

let db: Db;
let alice: string;
let bob: string;
let checking: string;

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
			debts: [],
			pay: { frequency: 'biweekly', amountMinor: 200000, anchorDate: '2030-01-03' }
		},
		'2029-12-01'
	));
});

const monthly = (name: string, amountMinor: number, day: number) =>
	createBill(db, alice, {
		name,
		amountMinor,
		frequency: 'monthly',
		dayOfMonth: day,
		startDate: `2029-12-${String(day).padStart(2, '0')}`,
		accountId: checking
	});

describe('calendarMonth', () => {
	it('lists charges with their plan status, paydays and paychecks', () => {
		const rent = monthly('Rent', 120000, 1);
		const netflix = monthly('Netflix', 1549, 9);
		const p = createPaycheck(
			db,
			alice,
			{ date: '2030-01-03', amountMinor: 200000, accountId: checking, nextDate: '2030-01-17' },
			{ billOccurrences: [{ billId: netflix, dueDate: '2030-01-09' }] }
		);
		const gym = monthly('Gym', 10000, 16); // auto-added to the open plan
		confirmLine(
			db,
			alice,
			getPaycheck(db, alice, p)!.lines.find((l) => l.billId === netflix)!.id,
			'2030-01-09'
		);

		const cal = calendarMonth(db, alice, '2030-01');
		expect(cal).toMatchObject({ month: '2030-01', from: '2030-01-01', to: '2030-02-01' });
		expect(cal.charges).toEqual([
			{
				billId: rent,
				name: 'Rent',
				amountMinor: 120000,
				dueDate: '2030-01-01',
				accountName: 'Main checking',
				status: 'unplanned',
				paycheckId: null
			},
			expect.objectContaining({
				billId: netflix,
				dueDate: '2030-01-09',
				status: 'paid',
				paycheckId: p
			}),
			expect.objectContaining({
				billId: gym,
				dueDate: '2030-01-16',
				status: 'planned',
				paycheckId: p
			})
		]);
		expect(cal.paydays).toEqual(['2030-01-03', '2030-01-17', '2030-01-31']);
		expect(cal.paychecks).toEqual([
			{ id: p, date: '2030-01-03', amountMinor: 200000, status: 'partial' }
		]);
		expect(cal.totals).toEqual({ dueMinor: 131549, paidMinor: 1549, count: 3, paidCount: 1 });

		// February: nothing planned yet; paydays continue the cycle.
		const feb = calendarMonth(db, alice, '2030-02');
		expect(feb.charges.map((c) => [c.name, c.dueDate, c.status])).toEqual([
			['Rent', '2030-02-01', 'unplanned'],
			['Netflix', '2030-02-09', 'unplanned'],
			['Gym', '2030-02-16', 'unplanned']
		]);
		expect(feb.paydays).toEqual(['2030-02-14', '2030-02-28']);
		expect(feb.paychecks).toEqual([]);
	});

	it('rejects a bad month', () => {
		expect(() => calendarMonth(db, alice, '2030-13')).toThrow(ValidationError);
	});

	it("shows nothing of another user's data", () => {
		monthly('Rent', 120000, 1);
		createPaycheck(db, alice, { date: '2030-01-03', amountMinor: 200000, accountId: checking });
		expect(calendarMonth(db, bob, '2030-01')).toMatchObject({
			charges: [],
			paydays: [],
			paychecks: [],
			totals: { dueMinor: 0, paidMinor: 0, count: 0, paidCount: 0 }
		});
	});
});

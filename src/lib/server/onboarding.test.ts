import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from './db/client';
import { completeOnboarding, needsOnboarding, type OnboardingInput } from './onboarding';
import { createAccount, listAccounts, setAccountArchived } from './repo/accounts';
import { listCategories } from './repo/categories';
import { createInvite } from './repo/invites';
import {
	defaultIncomeCategoryId,
	getPaySchedule,
	upsertPaySchedule,
	type PayScheduleInput
} from './repo/pay-schedule';
import { listTransactions, ValidationError } from './repo/transactions';
import { makeUser, setupTest } from './testing/setup';

let db: Db;
let alice: string;
let bob: string;

beforeEach(async () => {
	const t = setupTest();
	db = t.db;
	alice = await makeUser(db, t.auth);
	bob = await makeUser(db, t.auth, createInvite(db, alice).code);
});

const example: OnboardingInput = {
	checking: { name: 'Main checking', balanceMinor: 100000 },
	savings: [{ name: 'Emergency', balanceMinor: 25000 }],
	debts: [
		{ name: 'Visa', type: 'credit', owedMinor: 30000 },
		{ name: 'Car loan', type: 'loan', owedMinor: 500000 }
	],
	pay: { frequency: 'biweekly', amountMinor: 200000, anchorDate: '2030-01-03' }
};

describe('onboarding', () => {
	it('creates accounts with opening balances and the pay schedule', () => {
		expect(needsOnboarding(db, alice)).toBe(true);
		const { checkingId } = completeOnboarding(db, alice, example, '2029-12-30');
		expect(needsOnboarding(db, alice)).toBe(false);

		const accounts = listAccounts(db, alice);
		const by = (name: string) => accounts.find((a) => a.name === name)!;
		expect(by('Main checking')).toMatchObject({ id: checkingId, type: 'checking' });
		expect(by('Main checking').balanceMinor).toBe(100000);
		expect(by('Emergency')).toMatchObject({ type: 'savings', balanceMinor: 25000 });
		expect(by('Visa')).toMatchObject({ type: 'credit', balanceMinor: -30000, onBudget: true });
		expect(by('Car loan')).toMatchObject({ type: 'loan', balanceMinor: -500000, onBudget: false });
		expect(listTransactions(db, alice).every((t) => t.date === '2029-12-30')).toBe(true);

		const schedule = getPaySchedule(db, alice)!;
		expect(schedule).toMatchObject({
			frequency: 'biweekly',
			amountMinor: 200000,
			anchorDate: '2030-01-03',
			depositAccountId: checkingId,
			incomeCategoryId: defaultIncomeCategoryId(db, alice)
		});
		expect(needsOnboarding(db, bob)).toBe(true);
	});

	it('runs only once', () => {
		completeOnboarding(db, alice, example);
		expect(() => completeOnboarding(db, alice, example)).toThrow('already set up');
		expect(listAccounts(db, alice)).toHaveLength(4);
	});

	it('is not needed once there are accounts (even archived) or a schedule', () => {
		const id = createAccount(db, alice, { name: 'Old', type: 'checking' });
		setAccountArchived(db, alice, id, true);
		expect(needsOnboarding(db, alice)).toBe(false);
		upsertPaySchedule(db, bob, { frequency: 'weekly', amountMinor: 1, anchorDate: '2030-01-03' });
		expect(needsOnboarding(db, bob)).toBe(false);
	});

	it('rejects bad input without creating anything', () => {
		const bad: OnboardingInput[] = [
			{ ...example, checking: { name: ' ', balanceMinor: 0 } },
			{ ...example, savings: [{ name: '', balanceMinor: 1 }] },
			{ ...example, debts: [{ name: 'Visa', type: 'credit', owedMinor: -5 }] },
			{ ...example, debts: [{ name: 'Visa', type: 'savings' as 'credit', owedMinor: 5 }] },
			{ ...example, pay: { ...example.pay, amountMinor: 0 } },
			{ ...example, pay: { ...example.pay, anchorDate: '01/03/2030' } }
		];
		for (const input of bad) {
			expect(() => completeOnboarding(db, alice, input)).toThrow(ValidationError);
		}
		expect(listAccounts(db, alice)).toHaveLength(0);
		expect(getPaySchedule(db, alice)).toBeUndefined();
	});
});

describe('pay schedule', () => {
	const base: PayScheduleInput = {
		frequency: 'semimonthly',
		amountMinor: 150000,
		anchorDate: '2030-01-15',
		semiDay1: 15,
		semiDay2: 30
	};

	it('upserts one schedule per user', () => {
		const id = upsertPaySchedule(db, alice, base);
		expect(upsertPaySchedule(db, alice, { ...base, amountMinor: 160000 })).toBe(id);
		expect(getPaySchedule(db, alice)).toMatchObject({ amountMinor: 160000, semiDay2: 30 });
		upsertPaySchedule(db, alice, { ...base, frequency: 'monthly' });
		// Semimonthly days reset to defaults for other frequencies.
		expect(getPaySchedule(db, alice)).toMatchObject({ semiDay1: 1, semiDay2: 15 });
	});

	it('validates', () => {
		const cases: [Partial<PayScheduleInput>, string][] = [
			[{ frequency: 'daily' as 'weekly' }, 'frequency'],
			[{ amountMinor: -1 }, 'more than zero'],
			[{ amountMinor: 1.5 }, 'more than zero'],
			[{ anchorDate: '2030-1-1' }, 'YYYY-MM-DD'],
			[{ semiDay1: 0 }, '1 to 31'],
			[{ semiDay2: 32 }, '1 to 31'],
			[{ semiDay2: null }, '1 to 31'],
			[{ semiDay1: 15, semiDay2: 15 }, 'different'],
			[{ incomeCategoryId: 'nope' }, 'Unknown category']
		];
		for (const [patch, message] of cases) {
			expect(() => upsertPaySchedule(db, alice, { ...base, ...patch })).toThrow(message);
		}
	});

	it('only accepts the user’s own deposit account and category', () => {
		const theirs = createAccount(db, alice, { name: 'Checking', type: 'checking' });
		const theirCategory = listCategories(db, alice)[0].id;
		expect(() => upsertPaySchedule(db, bob, { ...base, depositAccountId: theirs })).toThrow(
			'Unknown account'
		);
		expect(() => upsertPaySchedule(db, bob, { ...base, incomeCategoryId: theirCategory })).toThrow(
			'Unknown category'
		);
	});

	it('defaults the income category to Paycheck', () => {
		const id = defaultIncomeCategoryId(db, alice)!;
		expect(listCategories(db, alice).find((c) => c.id === id)?.name).toBe('Paycheck');
	});
});

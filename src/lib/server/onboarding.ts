import { today } from '$lib/month';
import { count, eq } from 'drizzle-orm';
import type { Db } from './db/client';
import { finAccount, type PayFrequency } from './db/schema';
import { createAccountWithOpeningBalance } from './repo/accounts';
import {
	defaultIncomeCategoryId,
	getPaySchedule,
	upsertPaySchedule,
	validatePayRhythm
} from './repo/pay-schedule';
import { ValidationError } from './repo/transactions';

export interface OnboardingInput {
	checking: { name: string; balanceMinor: number };
	savings: { name: string; balanceMinor: number }[];
	/** Amount owed, entered positive. */
	debts: { name: string; type: 'credit' | 'loan'; owedMinor: number }[];
	pay: {
		frequency: PayFrequency;
		amountMinor: number;
		/** The next payday. */
		anchorDate: string;
		semiDay1?: number | null;
		semiDay2?: number | null;
	};
}

/** True for a brand-new user: no pay schedule and no accounts (archived ones count). */
export function needsOnboarding(db: Db, userId: string): boolean {
	if (getPaySchedule(db, userId)) return false;
	const n = db.select({ n: count() }).from(finAccount).where(eq(finAccount.userId, userId)).get();
	return (n?.n ?? 0) === 0;
}

const checkName = (name: string, what: string) => {
	if (!name.trim()) throw new ValidationError(`Give the ${what} a name`);
	return name.trim();
};

const checkAmount = (n: number) => {
	if (!Number.isSafeInteger(n)) throw new ValidationError('Invalid amount');
	return n;
};

function validate(input: OnboardingInput) {
	checkName(input.checking.name, 'checking account');
	checkAmount(input.checking.balanceMinor);
	for (const s of input.savings) {
		checkName(s.name, 'savings account');
		checkAmount(s.balanceMinor);
	}
	for (const d of input.debts) {
		checkName(d.name, 'debt');
		if (d.type !== 'credit' && d.type !== 'loan') throw new ValidationError('Choose a debt type');
		if (checkAmount(d.owedMinor) < 0) throw new ValidationError('Amount owed cannot be negative');
	}
	validatePayRhythm(input.pay);
}

/**
 * Create the user's starting accounts (with opening balances dated `date`) and their pay schedule,
 * depositing into the new checking account.
 */
export function completeOnboarding(
	db: Db,
	userId: string,
	input: OnboardingInput,
	date = today()
): { checkingId: string } {
	if (!needsOnboarding(db, userId)) throw new ValidationError('You are already set up');
	validate(input);
	return db.transaction((tx) => {
		const t = tx as unknown as Db;
		const open = (name: string, type: 'checking' | 'savings' | 'credit' | 'loan', n: number) =>
			createAccountWithOpeningBalance(t, userId, { name: name.trim(), type }, n, date);
		const checkingId = open(input.checking.name, 'checking', input.checking.balanceMinor);
		for (const s of input.savings) open(s.name, 'savings', s.balanceMinor);
		for (const d of input.debts) open(d.name, d.type, d.owedMinor);
		upsertPaySchedule(t, userId, {
			...input.pay,
			depositAccountId: checkingId,
			incomeCategoryId: defaultIncomeCategoryId(t, userId)
		});
		return { checkingId };
	});
}

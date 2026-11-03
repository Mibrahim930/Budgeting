import { isDate } from '$lib/month';
import { eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { PAY_FREQUENCIES, paySchedule, type PayFrequency } from '../db/schema';
import { newId } from '../id';
import { getAccount } from './accounts';
import { listCategories } from './categories';
import { assertCategory, ValidationError } from './transactions';

export type PayScheduleRow = typeof paySchedule.$inferSelect;

export interface PayScheduleInput {
	frequency: PayFrequency;
	/** Typical net pay, positive cents. */
	amountMinor: number;
	/** A known payday. */
	anchorDate: string;
	semiDay1?: number | null;
	semiDay2?: number | null;
	depositAccountId?: string | null;
	incomeCategoryId?: string | null;
}

export function getPaySchedule(db: Db, userId: string): PayScheduleRow | undefined {
	return db.select().from(paySchedule).where(eq(paySchedule.userId, userId)).get();
}

const isDay = (n: number | null | undefined): n is number =>
	Number.isInteger(n) && n! >= 1 && n! <= 31;

/** Checks the schedule fields that don't need the database (shared with onboarding). */
export function validatePayRhythm(input: PayScheduleInput) {
	if (!PAY_FREQUENCIES.includes(input.frequency)) {
		throw new ValidationError('Choose a pay frequency');
	}
	if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
		throw new ValidationError('Take-home pay must be more than zero');
	}
	if (!isDate(input.anchorDate)) throw new ValidationError('Payday must be YYYY-MM-DD');
	if (input.frequency === 'semimonthly') {
		if (!isDay(input.semiDay1) || !isDay(input.semiDay2)) {
			throw new ValidationError('Paydays must be days 1 to 31');
		}
		if (input.semiDay1 === input.semiDay2) {
			throw new ValidationError('The two paydays must be different days');
		}
	}
}

/** Create or replace the user's pay schedule. Returns its id. */
export function upsertPaySchedule(db: Db, userId: string, input: PayScheduleInput): string {
	validatePayRhythm(input);
	if (input.depositAccountId && !getAccount(db, userId, input.depositAccountId)) {
		throw new ValidationError('Unknown account');
	}
	assertCategory(db, userId, input.incomeCategoryId);
	const semi = input.frequency === 'semimonthly';
	const values = {
		frequency: input.frequency,
		amountMinor: input.amountMinor,
		anchorDate: input.anchorDate,
		semiDay1: semi ? input.semiDay1! : 1,
		semiDay2: semi ? input.semiDay2! : 15,
		depositAccountId: input.depositAccountId ?? null,
		incomeCategoryId: input.incomeCategoryId ?? null
	};
	const existing = getPaySchedule(db, userId);
	if (existing) {
		db.update(paySchedule).set(values).where(eq(paySchedule.id, existing.id)).run();
		return existing.id;
	}
	const id = newId();
	db.insert(paySchedule)
		.values({ id, userId, ...values })
		.run();
	return id;
}

/** The seeded "Paycheck" income category, else any income category. */
export function defaultIncomeCategoryId(db: Db, userId: string): string | null {
	const income = listCategories(db, userId).filter((c) => c.isIncome);
	return (income.find((c) => c.name === 'Paycheck') ?? income[0])?.id ?? null;
}

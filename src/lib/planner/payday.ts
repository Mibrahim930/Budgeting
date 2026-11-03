import { addDays, dateParts, dayDiff, makeDate } from '$lib/month';

// Pure date logic, safe to import from the browser. Mirrors PAY_FREQUENCIES in the schema.
export type PayFrequency = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly';

export interface PayScheduleInput {
	frequency: PayFrequency;
	/** A known payday: the cycle anchor, and the day-of-month for monthly pay. May be in the future. */
	anchorDate: string;
	/** Semimonthly only (defaults 1 and 15). */
	semiDay1?: number | null;
	semiDay2?: number | null;
}

/** The first payday strictly after `after`. */
export function nextPayday(s: PayScheduleInput, after: string): string {
	if (s.frequency === 'weekly' || s.frequency === 'biweekly') {
		const step = s.frequency === 'weekly' ? 7 : 14;
		const k = Math.floor(dayDiff(s.anchorDate, after) / step) + 1;
		return addDays(s.anchorDate, k * step);
	}
	const days =
		s.frequency === 'semimonthly'
			? [s.semiDay1 ?? 1, s.semiDay2 ?? 15]
			: [dateParts(s.anchorDate).d];
	const { y, m } = dateParts(after);
	const candidates = [m, m + 1]
		.flatMap((month) => days.map((d) => makeDate(y, month, d)))
		.filter((d) => d > after)
		.sort();
	return candidates[0];
}

/** `date` itself when it is a payday, else the next one. */
export const paydayOnOrAfter = (s: PayScheduleInput, date: string): string =>
	nextPayday(s, addDays(date, -1));

/** Paydays `d` with `from <= d < to`, ascending. */
export function paydaysBetween(s: PayScheduleInput, from: string, to: string): string[] {
	const out: string[] = [];
	for (let d = paydayOnOrAfter(s, from); d < to; d = nextPayday(s, d)) out.push(d);
	return out;
}

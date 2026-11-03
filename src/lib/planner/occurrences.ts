import { addDays, dateParts, dayDiff, makeDate } from '$lib/month';

// Pure date logic, safe to import from the browser. Mirrors BILL_FREQUENCIES in the schema.
export type BillFrequency = 'monthly' | 'every_n_weeks' | 'yearly' | 'once';

export interface BillSchedule {
	frequency: BillFrequency;
	/** First possible due date; the weekday anchor for every_n_weeks; the date for once. */
	startDate: string;
	/** Monthly/yearly: 1..31, clamped to the month's length. Defaults to startDate's day. */
	dayOfMonth?: number | null;
	/** Yearly: 1..12. Defaults to startDate's month. */
	monthOfYear?: number | null;
	/** Every N weeks: 1..52. */
	intervalWeeks?: number | null;
	/** Inclusive last due date. */
	endedAt?: string | null;
}

/** Due dates `d` with `from <= d < to`, ascending, within `[startDate, endedAt]`. */
export function nextOccurrences(bill: BillSchedule, from: string, to: string): string[] {
	if (from >= to) return [];
	const keep = (d: string) =>
		d >= from && d < to && d >= bill.startDate && (!bill.endedAt || d <= bill.endedAt);
	const start = dateParts(bill.startDate);
	const out: string[] = [];

	switch (bill.frequency) {
		case 'monthly': {
			const day = bill.dayOfMonth ?? start.d;
			const f = dateParts(from);
			const t = dateParts(to);
			const last = t.y * 12 + t.m;
			for (let i = f.y * 12 + f.m - 1; i <= last; i++) {
				const d = makeDate(0, i, day);
				if (keep(d)) out.push(d);
			}
			break;
		}
		case 'yearly': {
			const day = bill.dayOfMonth ?? start.d;
			const month = bill.monthOfYear ?? start.m;
			for (let y = dateParts(from).y - 1; y <= dateParts(to).y; y++) {
				const d = makeDate(y, month, day);
				if (keep(d)) out.push(d);
			}
			break;
		}
		case 'every_n_weeks': {
			const step = 7 * Math.max(1, bill.intervalWeeks ?? 1);
			const k = Math.max(0, Math.ceil(dayDiff(bill.startDate, from) / step));
			for (let d = addDays(bill.startDate, k * step); d < to; d = addDays(d, step)) {
				if (bill.endedAt && d > bill.endedAt) break;
				if (keep(d)) out.push(d);
			}
			break;
		}
		case 'once':
			if (keep(bill.startDate)) out.push(bill.startDate);
			break;
	}
	return out;
}

/** The first due date on or after `onOrAfter`, or null when the bill has no more. */
export function nextOccurrence(bill: BillSchedule, onOrAfter: string): string | null {
	const from = onOrAfter > bill.startDate ? onOrAfter : bill.startDate;
	if (bill.endedAt && bill.endedAt < from) return null;
	// Every cadence repeats within a year (yearly Feb 29 clamps to Feb 28), so 400 days is enough.
	return nextOccurrences(bill, from, addDays(from, 400))[0] ?? null;
}

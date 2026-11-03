import { dateParts, weekdayOf } from '$lib/month';
import type { BillSchedule } from './occurrences';

// Pure text helpers for bills, safe to import from the browser. No Intl, so output is the same
// on every server and phone.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** 1 → "1st", 2 → "2nd", 11 → "11th", 22 → "22nd". */
export function ordinal(n: number): string {
	const teen = n % 100 >= 11 && n % 100 <= 13;
	const suffix = teen ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th');
	return `${n}${suffix}`;
}

/** Short month name for 1..12. */
export const monthName = (m: number): string => MONTHS[m - 1];

/** "Fri, Jan 3" */
export function dayLabel(date: string): string {
	const { m, d } = dateParts(date);
	return `${WEEKDAYS[weekdayOf(date)]}, ${MONTHS[m - 1]} ${d}`;
}

/** "May 5, 2030" */
export function dateLabel(date: string): string {
	const { y, m, d } = dateParts(date);
	return `${MONTHS[m - 1]} ${d}, ${y}`;
}

/** One sentence for a bill's cadence: "Monthly on the 16th", "Every 2 weeks from Fri, Jan 3". */
export function describeBill(bill: BillSchedule): string {
	const start = dateParts(bill.startDate);
	switch (bill.frequency) {
		case 'monthly':
			return `Monthly on the ${ordinal(bill.dayOfMonth ?? start.d)}`;
		case 'yearly':
			return `Yearly on ${monthName(bill.monthOfYear ?? start.m)} ${bill.dayOfMonth ?? start.d}`;
		case 'every_n_weeks': {
			const n = bill.intervalWeeks ?? 1;
			const every = n === 1 ? 'Every week' : `Every ${n} weeks`;
			return `${every} from ${dayLabel(bill.startDate)}`;
		}
		case 'once':
			return `Once on ${dateLabel(bill.startDate)}`;
	}
}

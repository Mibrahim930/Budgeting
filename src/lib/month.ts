// Months are 'YYYY-MM' strings; dates are 'YYYY-MM-DD'.

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export const isMonth = (s: string | null | undefined): s is string => !!s && MONTH_RE.test(s);

export function addMonths(month: string, n: number): string {
	const [y, m] = month.split('-').map(Number);
	const total = y * 12 + (m - 1) + n;
	return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/** Inclusive list of months from `from` to `to`. Empty if from > to. */
export function monthsBetween(from: string, to: string): string[] {
	const out: string[] = [];
	for (let m = from; m <= to; m = addMonths(m, 1)) out.push(m);
	return out;
}

export const monthOf = (date: string): string => date.slice(0, 7);

export function currentMonth(now = new Date()): string {
	return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function today(now = new Date()): string {
	return `${currentMonth(now)}-${String(now.getDate()).padStart(2, '0')}`;
}

export function monthLabel(month: string): string {
	const [y, m] = month.split('-').map(Number);
	return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

// Date arithmetic on 'YYYY-MM-DD' strings. Everything goes through Date.UTC so local time zones
// and daylight saving never shift a date.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

export const isDate = (s: string | null | undefined): s is string => !!s && DATE_RE.test(s);

export function dateParts(date: string): { y: number; m: number; d: number } {
	const [y, m, d] = date.split('-').map(Number);
	return { y, m, d };
}

const toUtc = (date: string) => {
	const { y, m, d } = dateParts(date);
	return Date.UTC(y, m - 1, d);
};

const fromUtc = (ms: number) => {
	const t = new Date(ms);
	return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
};

export const addDays = (date: string, n: number): string => fromUtc(toUtc(date) + n * DAY_MS);

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export const dayDiff = (from: string, to: string): number =>
	Math.round((toUtc(to) - toUtc(from)) / DAY_MS);

/** `m` is 1..12. */
export const daysInMonth = (y: number, m: number): number =>
	new Date(Date.UTC(y, m, 0)).getUTCDate();

/**
 * Build a date, clamping the day to the month's length (31 → Feb 28/29). Months outside 1..12
 * roll into the neighbouring years, so callers can loop `m - 1 .. m + 1` freely.
 */
export function makeDate(y: number, m: number, d: number): string {
	const total = y * 12 + (m - 1);
	const year = Math.floor(total / 12);
	const month = total - year * 12 + 1;
	const day = Math.min(Math.max(1, d), daysInMonth(year, month));
	return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** 0 = Sunday. */
export const weekdayOf = (date: string): number => new Date(toUtc(date)).getUTCDay();

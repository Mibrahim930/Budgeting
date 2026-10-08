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

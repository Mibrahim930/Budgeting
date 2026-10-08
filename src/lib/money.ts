// Amounts are integer cents everywhere. Convert only at the UI boundary.

/**
 * Parse a user- or bank-supplied amount into integer cents.
 * Accepts "1,234.56", "$12", "-5.5", "(12.34)" (accounting negative), "12.34-". Returns null if invalid.
 */
export function parseMoney(input: string | number | null | undefined): number | null {
	if (input === null || input === undefined) return null;
	if (typeof input === 'number') {
		return Number.isFinite(input) ? Math.round(input * 100) : null;
	}
	let s = input.trim();
	if (!s) return null;
	let negative = false;
	if (s.startsWith('(') && s.endsWith(')')) {
		negative = true;
		s = s.slice(1, -1);
	}
	if (s.endsWith('-')) {
		negative = !negative;
		s = s.slice(0, -1);
	}
	s = s.replace(/[$\s,]/g, '');
	if (s.startsWith('-')) {
		negative = !negative;
		s = s.slice(1);
	} else if (s.startsWith('+')) {
		s = s.slice(1);
	}
	s = s.replace(/^\$/, '');
	const m = /^(\d*)(?:\.(\d*))?$/.exec(s);
	if (!m || (m[1] === '' && (m[2] ?? '') === '')) return null;
	const whole = m[1] ? Number(m[1]) : 0;
	const fracStr = (m[2] ?? '').padEnd(3, '0');
	// Round half away from zero on the third decimal.
	let cents = whole * 100 + Number(fracStr.slice(0, 2));
	if (Number(fracStr[2]) >= 5) cents += 1;
	if (!Number.isSafeInteger(cents)) return null;
	return negative && cents !== 0 ? -cents : cents;
}

const formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

/** Format cents as "$1,234.56" / "-$5.00". */
export function formatMoney(cents: number): string {
	return formatter.format(cents / 100);
}

/** Plain decimal string for form inputs, e.g. -1234 -> "-12.34". */
export function centsToInput(cents: number): string {
	const sign = cents < 0 ? '-' : '';
	const abs = Math.abs(cents);
	return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

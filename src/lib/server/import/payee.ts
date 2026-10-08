// Turn noisy bank descriptions into readable payee names, e.g.
// "SQ *BLUE BOTTLE COFFEE 0423 OAKLAND CA" -> "Blue Bottle Coffee".

const PREFIXES = [
	/^(pos|debit card|debit|check card|visa|purchase|card purchase|recurring payment|ach|ach debit|ach credit)( purchase)?\s+/i,
	/^(sq|tst|sp|pp|paypal|py|ckc|dd|in|par)\s?\*\s*/i,
	/^\d{2}\/\d{2}\s+/
];

const US_STATES =
	'AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC'.split(
		' '
	);

const SMALL_WORDS = new Set(['and', 'of', 'the', 'at', 'on', 'for', 'to']);

function titleCase(s: string): string {
	return s
		.toLowerCase()
		.split(' ')
		.map((w, i) =>
			i > 0 && SMALL_WORDS.has(w)
				? w
				: w.replace(/(^|[-'&/])([a-z])/g, (_, p: string, c: string) => p + c.toUpperCase())
		)
		.join(' ');
}

export function cleanPayee(description: string): string {
	let s = description.replace(/\s+/g, ' ').trim();
	if (!s) return s;
	for (let pass = 0; pass < 2; pass++) for (const re of PREFIXES) s = s.replace(re, '');
	let words = s.split(' ');
	// Drop trailing state codes and reference numbers.
	let sawState = false;
	while (words.length > 1) {
		const w = words[words.length - 1];
		if (US_STATES.includes(w) && w === w.toUpperCase()) {
			words.pop();
			sawState = true;
		} else if (/^#?\*?[\d-]{3,}$/.test(w) || /^x{2,}\d+$/i.test(w)) {
			words.pop();
		} else break;
	}
	// A store number ("#12", "0423") or "NAME*REF" token ends the merchant name; the rest is location.
	const cut = words.findIndex(
		(w, i) => i > 0 && (/^#\w+$/.test(w) || /^\d{3,}$/.test(w) || w.includes('*'))
	);
	if (cut !== -1) {
		const star = words[cut].indexOf('*');
		words = [...words.slice(0, cut), ...(star > 0 ? [words[cut].slice(0, star)] : [])];
	} else if (sawState && words.length > 2) {
		words.pop(); // the city before the state
	}
	s = words
		.join(' ')
		.replace(/[*#]+$/, '')
		.trim();
	const isShouty = s === s.toUpperCase();
	return isShouty ? titleCase(s) : s;
}

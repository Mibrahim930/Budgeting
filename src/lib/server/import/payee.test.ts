import { describe, expect, it } from 'vitest';
import { cleanPayee } from './payee';

describe('cleanPayee', () => {
	it.each([
		['SQ *BLUE BOTTLE COFFEE 0423 OAKLAND CA', 'Blue Bottle Coffee'],
		['TST* JOES PIZZA #12 NEW YORK NY', 'Joes Pizza'],
		['POS PURCHASE TRADER JOE S #552 PORTLAND OR', 'Trader Joe S'],
		['NETFLIX.COM', 'Netflix.com'],
		['AMAZON MKTPL*2K4L09 AMZN.COM/BILL WA', 'Amazon Mktpl'],
		['Spotify USA', 'Spotify USA'],
		['PAYROLL', 'Payroll'],
		['   ', '']
	])('%s -> %s', (input, out) => expect(cleanPayee(input)).toBe(out));
});

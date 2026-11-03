import { describe, expect, it } from 'vitest';
import { dateLabel, dayLabel, describeBill, ordinal } from './describe';

describe('ordinal', () => {
	it.each([
		[1, '1st'],
		[2, '2nd'],
		[3, '3rd'],
		[4, '4th'],
		[11, '11th'],
		[12, '12th'],
		[13, '13th'],
		[21, '21st'],
		[22, '22nd'],
		[23, '23rd'],
		[30, '30th'],
		[31, '31st']
	])('%i → %s', (n, s) => expect(ordinal(n)).toBe(s));
});

describe('date labels', () => {
	it('formats without time-zone drift', () => {
		expect(dayLabel('2030-01-03')).toBe('Thu, Jan 3');
		expect(dayLabel('2025-01-03')).toBe('Fri, Jan 3');
		expect(dateLabel('2030-05-05')).toBe('May 5, 2030');
	});
});

describe('describeBill', () => {
	it.each([
		[{ frequency: 'monthly', startDate: '2026-01-01', dayOfMonth: 16 }, 'Monthly on the 16th'],
		[{ frequency: 'monthly', startDate: '2026-01-01', dayOfMonth: 1 }, 'Monthly on the 1st'],
		[{ frequency: 'monthly', startDate: '2026-01-09' }, 'Monthly on the 9th'],
		[
			{ frequency: 'every_n_weeks', startDate: '2025-01-03', intervalWeeks: 2 },
			'Every 2 weeks from Fri, Jan 3'
		],
		[
			{ frequency: 'every_n_weeks', startDate: '2025-01-03', intervalWeeks: 1 },
			'Every week from Fri, Jan 3'
		],
		[
			{ frequency: 'yearly', startDate: '2026-01-01', monthOfYear: 4, dayOfMonth: 15 },
			'Yearly on Apr 15'
		],
		[{ frequency: 'yearly', startDate: '2028-02-29' }, 'Yearly on Feb 29'],
		[{ frequency: 'once', startDate: '2030-05-05' }, 'Once on May 5, 2030']
	] as const)('%o → %s', (bill, text) => expect(describeBill(bill)).toBe(text));
});

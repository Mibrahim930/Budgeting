import { describe, expect, it } from 'vitest';
import { nextOccurrence, nextOccurrences, type BillSchedule } from './occurrences';

const monthly = (dayOfMonth: number, extra: Partial<BillSchedule> = {}): BillSchedule => ({
	frequency: 'monthly',
	startDate: '2020-01-01',
	dayOfMonth,
	...extra
});

describe('nextOccurrences', () => {
	it.each<[string, BillSchedule, string, string, string[]]>([
		['day 31 in Feb clamps', monthly(31), '2026-02-01', '2026-03-01', ['2026-02-28']],
		['day 31 in Mar', monthly(31), '2026-03-01', '2026-04-01', ['2026-03-31']],
		['day 30 in a leap Feb', monthly(30), '2028-02-01', '2028-03-01', ['2028-02-29']],
		['due on `to` is excluded', monthly(16), '2026-01-01', '2026-01-16', []],
		['due on `from` is included', monthly(16), '2026-01-16', '2026-01-17', ['2026-01-16']],
		['empty window', monthly(5), '2026-01-06', '2026-01-06', []],
		['from > to', monthly(5), '2026-02-01', '2026-01-01', []],
		['December to January', monthly(1), '2026-12-15', '2027-01-15', ['2027-01-01']],
		[
			'December to January, late day',
			monthly(20),
			'2026-12-15',
			'2027-01-25',
			['2026-12-20', '2027-01-20']
		],
		[
			'startDate after the window start skips the first month',
			monthly(10, { startDate: '2026-02-01' }),
			'2026-01-01',
			'2026-04-01',
			['2026-02-10', '2026-03-10']
		],
		[
			'endedAt cuts later ones (inclusive)',
			monthly(10, { endedAt: '2026-02-10' }),
			'2026-01-01',
			'2026-05-01',
			['2026-01-10', '2026-02-10']
		],
		['two months, two dates', monthly(9), '2026-01-01', '2026-03-01', ['2026-01-09', '2026-02-09']],
		[
			'every 2 weeks',
			{ frequency: 'every_n_weeks', startDate: '2026-01-02', intervalWeeks: 2 },
			'2026-01-10',
			'2026-02-10',
			['2026-01-16', '2026-01-30']
		],
		[
			'weekly, starting before the window',
			{ frequency: 'every_n_weeks', startDate: '2025-12-05', intervalWeeks: 1 },
			'2026-01-01',
			'2026-01-20',
			['2026-01-02', '2026-01-09', '2026-01-16']
		],
		[
			'every n weeks, starting inside the window',
			{ frequency: 'every_n_weeks', startDate: '2026-01-14', intervalWeeks: 4 },
			'2026-01-01',
			'2026-03-01',
			['2026-01-14', '2026-02-11']
		],
		[
			'every n weeks honours endedAt',
			{
				frequency: 'every_n_weeks',
				startDate: '2026-01-02',
				intervalWeeks: 1,
				endedAt: '2026-01-16'
			},
			'2026-01-01',
			'2026-02-01',
			['2026-01-02', '2026-01-09', '2026-01-16']
		],
		[
			'yearly',
			{ frequency: 'yearly', startDate: '2020-01-01', monthOfYear: 3, dayOfMonth: 15 },
			'2026-01-01',
			'2028-01-01',
			['2026-03-15', '2027-03-15']
		],
		[
			'yearly across a year boundary',
			{ frequency: 'yearly', startDate: '2020-01-01', monthOfYear: 1, dayOfMonth: 2 },
			'2026-12-20',
			'2027-01-10',
			['2027-01-02']
		],
		[
			'yearly Feb 29 in a non-leap year',
			{ frequency: 'yearly', startDate: '2024-02-29', monthOfYear: 2, dayOfMonth: 29 },
			'2026-01-01',
			'2027-01-01',
			['2026-02-28']
		],
		[
			'yearly Feb 29 in a leap year',
			{ frequency: 'yearly', startDate: '2024-02-29', monthOfYear: 2, dayOfMonth: 29 },
			'2028-01-01',
			'2029-01-01',
			['2028-02-29']
		],
		[
			'once, inside the window',
			{ frequency: 'once', startDate: '2026-01-20' },
			'2026-01-01',
			'2026-02-01',
			['2026-01-20']
		],
		[
			'once, outside the window',
			{ frequency: 'once', startDate: '2026-02-20' },
			'2026-01-01',
			'2026-02-01',
			[]
		],
		[
			'monthly defaults to the start date day',
			{ frequency: 'monthly', startDate: '2026-01-16' },
			'2026-01-01',
			'2026-03-01',
			['2026-01-16', '2026-02-16']
		]
	])('%s', (_, bill, from, to, expected) => {
		expect(nextOccurrences(bill, from, to)).toEqual(expected);
	});
});

describe('nextOccurrence', () => {
	it.each<[string, BillSchedule, string, string | null]>([
		['monthly, later this month', monthly(16), '2026-01-03', '2026-01-16'],
		['monthly, on the day', monthly(16), '2026-01-16', '2026-01-16'],
		['monthly, next month', monthly(1), '2026-01-03', '2026-02-01'],
		['before the start date', monthly(5, { startDate: '2027-06-01' }), '2026-01-01', '2027-06-05'],
		['after it ended', monthly(5, { endedAt: '2026-01-05' }), '2026-01-06', null],
		[
			'upcoming one-off',
			{ frequency: 'once', startDate: '2026-04-01' },
			'2026-01-01',
			'2026-04-01'
		],
		['passed one-off', { frequency: 'once', startDate: '2026-01-01' }, '2026-01-02', null],
		[
			'yearly, almost a year away',
			{ frequency: 'yearly', startDate: '2020-01-01', monthOfYear: 1, dayOfMonth: 1 },
			'2026-01-02',
			'2027-01-01'
		],
		[
			'every 52 weeks',
			{ frequency: 'every_n_weeks', startDate: '2026-01-02', intervalWeeks: 52 },
			'2026-01-03',
			'2027-01-01'
		]
	])('%s', (_, bill, onOrAfter, expected) => {
		expect(nextOccurrence(bill, onOrAfter)).toBe(expected);
	});
});

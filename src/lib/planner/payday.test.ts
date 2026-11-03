import { describe, expect, it } from 'vitest';
import { nextPayday, paydayOnOrAfter, paydaysBetween, type PayScheduleInput } from './payday';

const weekly: PayScheduleInput = { frequency: 'weekly', anchorDate: '2026-01-02' };
const biweekly: PayScheduleInput = { frequency: 'biweekly', anchorDate: '2026-01-02' };
const semi: PayScheduleInput = { frequency: 'semimonthly', anchorDate: '2026-01-01' };
const semi1530: PayScheduleInput = {
	frequency: 'semimonthly',
	anchorDate: '2026-01-15',
	semiDay1: 15,
	semiDay2: 30
};
const monthly31: PayScheduleInput = { frequency: 'monthly', anchorDate: '2026-01-31' };

describe('nextPayday', () => {
	it.each<[string, PayScheduleInput, string, string]>([
		['weekly, on a payday', weekly, '2026-01-02', '2026-01-09'],
		['weekly, mid-cycle', weekly, '2026-01-05', '2026-01-09'],
		['weekly, before the anchor', weekly, '2025-12-29', '2026-01-02'],
		['weekly, backwards a cycle', weekly, '2025-12-25', '2025-12-26'],
		[
			'biweekly, backwards from a future anchor',
			{ frequency: 'biweekly', anchorDate: '2026-01-16' },
			'2025-12-31',
			'2026-01-02'
		],
		['biweekly, mid-cycle', biweekly, '2026-01-15', '2026-01-16'],
		['biweekly, on a payday', biweekly, '2026-01-16', '2026-01-30'],
		[
			'biweekly, far-future anchor',
			{ frequency: 'biweekly', anchorDate: '2030-01-03' },
			'2026-01-01',
			'2026-01-08'
		],
		[
			'biweekly, far-past anchor',
			{ frequency: 'biweekly', anchorDate: '2020-01-03' },
			'2026-01-01',
			'2026-01-09'
		],
		['semimonthly 1/15, before the 15th', semi, '2026-01-01', '2026-01-15'],
		['semimonthly 1/15, on the 15th', semi, '2026-01-15', '2026-02-01'],
		['semimonthly 1/15, end of month', semi, '2026-01-31', '2026-02-01'],
		['semimonthly 1/15, year end', semi, '2026-12-20', '2027-01-01'],
		['semimonthly 15/30, February clamps', semi1530, '2026-02-15', '2026-02-28'],
		['semimonthly 15/30, after Feb 28', semi1530, '2026-02-28', '2026-03-15'],
		['semimonthly 15/30, on the 30th', semi1530, '2026-03-30', '2026-04-15'],
		['semimonthly 15/30, on the 31st', semi1530, '2026-03-31', '2026-04-15'],
		['monthly 31st into February', monthly31, '2026-01-31', '2026-02-28'],
		['monthly 31st after February', monthly31, '2026-02-28', '2026-03-31'],
		['monthly 31st into April', monthly31, '2026-03-31', '2026-04-30'],
		[
			'monthly 31st, anchor in the future',
			{ frequency: 'monthly', anchorDate: '2026-03-31' },
			'2026-02-01',
			'2026-02-28'
		],
		[
			'monthly 31st, backwards across a year',
			{ frequency: 'monthly', anchorDate: '2026-03-31' },
			'2025-12-31',
			'2026-01-31'
		],
		[
			'monthly mid-month',
			{ frequency: 'monthly', anchorDate: '2026-01-10' },
			'2026-01-10',
			'2026-02-10'
		]
	])('%s', (_, s, after, expected) => {
		expect(nextPayday(s, after)).toBe(expected);
	});
});

describe('paydayOnOrAfter', () => {
	it('returns the date itself when it is a payday', () => {
		expect(paydayOnOrAfter(biweekly, '2026-01-16')).toBe('2026-01-16');
		expect(paydayOnOrAfter(semi, '2026-02-01')).toBe('2026-02-01');
		expect(paydayOnOrAfter(monthly31, '2026-02-28')).toBe('2026-02-28');
	});
	it('otherwise returns the next payday', () => {
		expect(paydayOnOrAfter(biweekly, '2026-01-17')).toBe('2026-01-30');
		expect(paydayOnOrAfter(semi, '2026-02-02')).toBe('2026-02-15');
	});
});

describe('paydaysBetween', () => {
	it.each<[string, PayScheduleInput, string, string, string[]]>([
		['biweekly, half-open', biweekly, '2026-01-02', '2026-01-30', ['2026-01-02', '2026-01-16']],
		[
			'weekly',
			weekly,
			'2026-01-01',
			'2026-01-24',
			['2026-01-02', '2026-01-09', '2026-01-16', '2026-01-23']
		],
		[
			'semimonthly 15/30 through February',
			semi1530,
			'2026-02-01',
			'2026-03-31',
			['2026-02-15', '2026-02-28', '2026-03-15', '2026-03-30']
		],
		[
			'monthly 31st',
			monthly31,
			'2026-01-01',
			'2026-05-01',
			['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']
		],
		['empty window', biweekly, '2026-01-03', '2026-01-16', []],
		['from > to', biweekly, '2026-02-01', '2026-01-01', []]
	])('%s', (_, s, from, to, expected) => {
		expect(paydaysBetween(s, from, to)).toEqual(expected);
	});
});

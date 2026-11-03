import { describe, expect, it } from 'vitest';
import {
	addDays,
	addMonths,
	dateParts,
	dayDiff,
	daysInMonth,
	isDate,
	makeDate,
	monthsBetween,
	weekdayOf
} from './month';

describe('month helpers', () => {
	it('adds months across years', () => {
		expect(addMonths('2026-12', 1)).toBe('2027-01');
		expect(addMonths('2026-01', -1)).toBe('2025-12');
	});
	it('lists months inclusively', () =>
		expect(monthsBetween('2026-11', '2027-01')).toEqual(['2026-11', '2026-12', '2027-01']));
});

describe('date helpers', () => {
	it.each([
		['2026-01-05', true],
		['2026-1-5', false],
		['', false],
		[null, false],
		['2026-01-05T00:00', false]
	])('isDate(%j) -> %s', (s, ok) => expect(isDate(s)).toBe(ok));

	it.each([
		['2026-01-31', 1, '2026-02-01'],
		['2026-03-01', -1, '2026-02-28'],
		['2028-02-28', 1, '2028-02-29'],
		['2026-12-31', 1, '2027-01-01'],
		['2026-01-01', -1, '2025-12-31'],
		// Spans a US daylight-saving change without drifting.
		['2026-03-07', 2, '2026-03-09'],
		['2026-01-02', 0, '2026-01-02'],
		['2026-01-02', 364, '2027-01-01']
	])('addDays(%s, %i) -> %s', (d, n, out) => expect(addDays(d, n)).toBe(out));

	it.each([
		['2026-01-01', '2026-01-31', 30],
		['2026-01-31', '2026-01-01', -30],
		['2026-02-01', '2026-03-01', 28],
		['2028-02-01', '2028-03-01', 29],
		['2026-03-01', '2026-11-01', 245],
		['2026-01-01', '2027-01-01', 365],
		['2026-05-05', '2026-05-05', 0]
	])('dayDiff(%s, %s) -> %i', (a, b, n) => expect(dayDiff(a, b)).toBe(n));

	it.each([
		[2026, 1, 31],
		[2026, 2, 28],
		[2028, 2, 29],
		[2100, 2, 28],
		[2000, 2, 29],
		[2026, 4, 30],
		[2026, 12, 31]
	])('daysInMonth(%i, %i) -> %i', (y, m, n) => expect(daysInMonth(y, m)).toBe(n));

	it.each([
		[2026, 2, 31, '2026-02-28'],
		[2028, 2, 30, '2028-02-29'],
		[2026, 3, 31, '2026-03-31'],
		[2026, 4, 31, '2026-04-30'],
		[2026, 1, 5, '2026-01-05'],
		[2026, 13, 1, '2027-01-01'],
		[2026, 0, 15, '2025-12-15']
	])('makeDate(%i, %i, %i) -> %s', (y, m, d, out) => expect(makeDate(y, m, d)).toBe(out));

	it.each([
		['2026-01-02', 5],
		['2026-01-04', 0],
		['2026-01-03', 6],
		['2030-01-03', 4]
	])('weekdayOf(%s) -> %i', (d, w) => expect(weekdayOf(d)).toBe(w));

	it('splits a date into numbers', () =>
		expect(dateParts('2026-03-09')).toEqual({ y: 2026, m: 3, d: 9 }));
});

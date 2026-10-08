import { describe, expect, it } from 'vitest';
import { centsToInput, formatMoney, parseMoney } from './money';

describe('parseMoney', () => {
	it.each([
		['12.34', 1234],
		['12', 1200],
		['12.3', 1230],
		['.5', 50],
		['$1,234.56', 123456],
		['-5.50', -550],
		['- $5.50', -550],
		['+7', 700],
		['(12.34)', -1234],
		['12.34-', -1234],
		['0.005', 1],
		['-0.004', 0],
		['0.1', 10],
		[' 3 ', 300]
	])('%s -> %i', (input, cents) => expect(parseMoney(input)).toBe(cents));

	it.each(['', 'abc', '1.2.3', '.', '-', '12a'])('rejects %j', (input) =>
		expect(parseMoney(input)).toBeNull()
	);

	it('accepts numbers without float drift', () => {
		expect(parseMoney(0.1 + 0.2)).toBe(30);
		expect(parseMoney(19.99)).toBe(1999);
	});
});

describe('formatting', () => {
	it('formats cents as dollars', () => {
		expect(formatMoney(123456)).toBe('$1,234.56');
		expect(formatMoney(-500)).toBe('-$5.00');
	});

	it('round-trips through the input format', () => {
		for (const c of [0, 5, -5, 1234, -123456]) expect(parseMoney(centsToInput(c))).toBe(c);
	});
});

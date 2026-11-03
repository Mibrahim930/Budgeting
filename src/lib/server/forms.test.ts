import { describe, expect, it } from 'vitest';
import {
	parseBillForm,
	parseLineForm,
	parseLinePatch,
	parseOnboardingForm,
	parsePaycheckForm,
	parsePayScheduleForm
} from './forms';
import { ValidationError } from './repo/transactions';

const form = (fields: Record<string, string | string[]>) => {
	const f = new FormData();
	for (const [k, v] of Object.entries(fields)) {
		for (const x of Array.isArray(v) ? v : [v]) f.append(k, x);
	}
	return f;
};

describe('planner forms', () => {
	it('parses a bill', () => {
		expect(
			parseBillForm(
				form({
					name: ' Netflix ',
					amount: '15.49',
					frequency: 'monthly',
					dayOfMonth: '9',
					monthOfYear: '',
					startDate: '2030-01-09',
					endedAt: '',
					accountId: 'a1',
					categoryId: 'c1',
					payToAccountId: ''
				})
			)
		).toEqual({
			name: 'Netflix',
			amountMinor: 1549,
			frequency: 'monthly',
			dayOfMonth: 9,
			monthOfYear: null,
			intervalWeeks: null,
			startDate: '2030-01-09',
			endedAt: null,
			accountId: 'a1',
			categoryId: 'c1',
			payToAccountId: null
		});
		expect(() => parseBillForm(form({ amount: 'lots' }))).toThrow(ValidationError);
		expect(() => parseBillForm(form({ amount: '1', dayOfMonth: '1.5' }))).toThrow('whole number');
	});

	it('parses a paycheck with its bill checkboxes', () => {
		const { input, billOccurrences } = parsePaycheckForm(
			form({
				date: '2030-01-03',
				amount: '$2,000.00',
				accountId: 'a1',
				nextDate: '',
				note: '',
				bills: ['b1|2030-01-09', 'b2|2030-01-12', 'junk']
			})
		);
		expect(input).toEqual({
			date: '2030-01-03',
			amountMinor: 200000,
			accountId: 'a1',
			incomeCategoryId: null,
			nextDate: undefined,
			note: null
		});
		expect(billOccurrences).toEqual([
			{ billId: 'b1', dueDate: '2030-01-09' },
			{ billId: 'b2', dueDate: '2030-01-12' }
		]);
		expect(() => parsePaycheckForm(form({ amount: '' }))).toThrow('pay amount');
	});

	it('parses lines and line edits', () => {
		expect(parseLineForm(form({ kind: 'savings', amount: '100', toAccountId: 's1' }))).toEqual({
			kind: 'savings',
			amountMinor: 10000,
			label: null,
			fromAccountId: null,
			toAccountId: 's1',
			categoryId: null,
			billId: null,
			dueDate: null
		});
		// A bill line without an amount takes the bill's.
		expect(
			parseLineForm(form({ kind: 'bill', billId: 'b1', dueDate: '2030-01-09' })).amountMinor
		).toBeUndefined();
		expect(() => parseLineForm(form({ kind: 'spending' }))).toThrow('Enter an amount');
		expect(parseLinePatch(form({ amount: '12.5' }))).toEqual({ amountMinor: 1250 });
		expect(parseLinePatch(form({ label: 'Food', categoryId: '' }))).toEqual({
			label: 'Food',
			categoryId: null
		});
	});

	it('parses the pay schedule', () => {
		expect(
			parsePayScheduleForm(
				form({
					frequency: 'semimonthly',
					amount: '1500',
					anchorDate: '2030-01-15',
					semiDay1: '15',
					semiDay2: '30',
					depositAccountId: 'a1'
				})
			)
		).toEqual({
			frequency: 'semimonthly',
			amountMinor: 150000,
			anchorDate: '2030-01-15',
			semiDay1: 15,
			semiDay2: 30,
			depositAccountId: 'a1',
			incomeCategoryId: null
		});
	});

	it('parses onboarding with JSON rows', () => {
		const input = parseOnboardingForm(
			form({
				checkingName: 'Main checking',
				checkingBalance: '1,000',
				savings: JSON.stringify([
					{ name: 'Emergency', balance: '250' },
					{ name: '', balance: '5' }
				]),
				debts: JSON.stringify([
					{ name: 'Visa', type: 'credit', owed: '300' },
					{ name: 'Car', type: 'loan', owed: '-50' }
				]),
				frequency: 'biweekly',
				amount: '2000',
				anchorDate: '2030-01-03'
			})
		);
		expect(input).toEqual({
			checking: { name: 'Main checking', balanceMinor: 100000 },
			savings: [{ name: 'Emergency', balanceMinor: 25000 }],
			debts: [
				{ name: 'Visa', type: 'credit', owedMinor: 30000 },
				{ name: 'Car', type: 'loan', owedMinor: 5000 }
			],
			pay: {
				frequency: 'biweekly',
				amountMinor: 200000,
				anchorDate: '2030-01-03',
				semiDay1: null,
				semiDay2: null
			}
		});
		const minimal = parseOnboardingForm(
			form({ frequency: 'weekly', amount: '1', anchorDate: 'x' })
		);
		expect(minimal.checking).toEqual({ name: 'Checking', balanceMinor: 0 });
		expect(minimal.savings).toEqual([]);
		expect(() =>
			parseOnboardingForm(form({ savings: '{nope', amount: '1', frequency: 'weekly' }))
		).toThrow('Invalid form data');
		expect(() =>
			parseOnboardingForm(form({ checkingBalance: 'abc', amount: '1', frequency: 'weekly' }))
		).toThrow('valid balance');
	});
});

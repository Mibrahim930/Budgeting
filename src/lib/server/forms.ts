import { parseMoney } from '$lib/money';
import type { BillFrequency, LineKind, PayFrequency } from './db/schema';
import type { OnboardingInput } from './onboarding';
import type { BillInput } from './repo/bills';
import type { PayScheduleInput } from './repo/pay-schedule';
import type { BillPick, LineInput, LinePatch, PaycheckInput } from './repo/paychecks';
import { ValidationError, type TxnInput } from './repo/transactions';

const str = (f: FormData, k: string) => {
	const v = f.get(k);
	return typeof v === 'string' ? v.trim() : '';
};

/**
 * Parse the transaction form (see TransactionForm.svelte). Amounts are entered as positive numbers
 * with a separate direction ('out' | 'in'); split amounts follow the parent's direction.
 * The category select also carries transfers as `transfer:<accountId>`.
 */
export function parseTxnForm(f: FormData): TxnInput {
	const sign = str(f, 'direction') === 'in' ? 1 : -1;
	const amount = parseMoney(str(f, 'amount'));
	if (amount === null) throw new ValidationError('Enter an amount');
	const target = str(f, 'category');
	const input: TxnInput = {
		accountId: str(f, 'accountId'),
		date: str(f, 'date'),
		amountMinor: sign * Math.abs(amount),
		payeeName: str(f, 'payee') || null,
		memo: str(f, 'memo') || null,
		cleared: f.get('cleared') === 'on'
	};

	if (target.startsWith('transfer:')) {
		input.transferAccountId = target.slice('transfer:'.length);
		input.categoryId = str(f, 'transferCategory') || null;
	} else if (target === 'split') {
		let raw: { amount: string; categoryId: string; memo?: string }[];
		try {
			raw = JSON.parse(str(f, 'splits') || '[]');
		} catch {
			throw new ValidationError('Invalid split data');
		}
		input.splits = raw.map((s) => {
			const a = parseMoney(s.amount);
			if (a === null) throw new ValidationError('Enter an amount for every split');
			return { amountMinor: sign * a, categoryId: s.categoryId || null, memo: s.memo || null };
		});
	} else {
		input.categoryId = target || null;
	}
	return input;
}

/** An optional whole number field; empty gives null. */
const int = (f: FormData, k: string, label: string) => {
	const s = str(f, k);
	if (!s) return null;
	const n = Number(s);
	if (!Number.isInteger(n)) throw new ValidationError(`${label} must be a whole number`);
	return n;
};

/** A required amount, entered positive (a stray minus sign is ignored). */
const amount = (raw: string, message = 'Enter an amount') => {
	const a = parseMoney(raw);
	if (a === null) throw new ValidationError(message);
	return Math.abs(a);
};

/** Parse the bill form (see BillForm.svelte). */
export function parseBillForm(f: FormData): BillInput {
	return {
		name: str(f, 'name'),
		amountMinor: amount(str(f, 'amount')),
		frequency: str(f, 'frequency') as BillFrequency,
		dayOfMonth: int(f, 'dayOfMonth', 'Day of month'),
		monthOfYear: int(f, 'monthOfYear', 'Month'),
		intervalWeeks: int(f, 'intervalWeeks', 'Weeks'),
		startDate: str(f, 'startDate'),
		endedAt: str(f, 'endedAt') || null,
		accountId: str(f, 'accountId'),
		categoryId: str(f, 'categoryId') || null,
		payToAccountId: str(f, 'payToAccountId') || null
	};
}

/**
 * Parse the new/edit paycheck form. An empty next payday leaves it to the default (or unchanged).
 * Bills to include arrive as checkbox values `billId|dueDate` named `bills`.
 */
export function parsePaycheckForm(f: FormData): {
	input: PaycheckInput;
	billOccurrences: BillPick[];
} {
	const billOccurrences = f
		.getAll('bills')
		.filter((v): v is string => typeof v === 'string' && v.includes('|'))
		.map((v) => {
			const [billId, dueDate] = v.split('|');
			return { billId, dueDate };
		});
	return {
		input: {
			date: str(f, 'date'),
			amountMinor: amount(str(f, 'amount'), 'Enter the pay amount'),
			accountId: str(f, 'accountId'),
			incomeCategoryId: str(f, 'incomeCategoryId') || null,
			nextDate: str(f, 'nextDate') || undefined,
			note: str(f, 'note') || null
		},
		billOccurrences
	};
}

/** Parse the "Add to plan" form. Bill lines may leave the amount empty to use the bill's. */
export function parseLineForm(f: FormData): LineInput {
	const kind = str(f, 'kind') as LineKind;
	const raw = str(f, 'amount');
	return {
		kind,
		amountMinor: kind === 'bill' && !raw ? undefined : amount(raw),
		label: str(f, 'label') || null,
		fromAccountId: str(f, 'fromAccountId') || null,
		toAccountId: str(f, 'toAccountId') || null,
		categoryId: str(f, 'categoryId') || null,
		billId: str(f, 'billId') || null,
		dueDate: str(f, 'dueDate') || null
	};
}

/** Parse an edit to a planned line: only the fields present in the form change. */
export function parseLinePatch(f: FormData): LinePatch {
	const patch: LinePatch = {};
	if (f.has('amount')) patch.amountMinor = amount(str(f, 'amount'));
	if (f.has('label')) patch.label = str(f, 'label') || null;
	for (const k of ['fromAccountId', 'toAccountId', 'categoryId'] as const) {
		if (f.has(k)) patch[k] = str(f, k) || null;
	}
	return patch;
}

/** Parse the pay schedule form (settings and onboarding share the field names). */
export function parsePayScheduleForm(f: FormData): PayScheduleInput {
	return {
		frequency: str(f, 'frequency') as PayFrequency,
		amountMinor: amount(str(f, 'amount'), 'Enter your take-home pay'),
		anchorDate: str(f, 'anchorDate'),
		semiDay1: int(f, 'semiDay1', 'Payday'),
		semiDay2: int(f, 'semiDay2', 'Payday'),
		depositAccountId: str(f, 'depositAccountId') || null,
		incomeCategoryId: str(f, 'incomeCategoryId') || null
	};
}

function jsonRows(f: FormData, k: string): Record<string, string>[] {
	try {
		const rows = JSON.parse(str(f, k) || '[]');
		if (!Array.isArray(rows)) throw new Error();
		return rows;
	} catch {
		throw new ValidationError('Invalid form data');
	}
}

/** A starting balance; empty means zero. */
const balance = (raw: string | undefined) => {
	if (!raw?.trim()) return 0;
	const a = parseMoney(raw);
	if (a === null) throw new ValidationError('Enter a valid balance');
	return a;
};

/**
 * Parse the onboarding wizard. Savings and debts arrive as hidden JSON rows
 * (`[{ name, balance }]` and `[{ name, type, owed }]`); rows without a name are skipped.
 */
export function parseOnboardingForm(f: FormData): OnboardingInput {
	const pay = parsePayScheduleForm(f);
	return {
		checking: {
			name: str(f, 'checkingName') || 'Checking',
			balanceMinor: balance(str(f, 'checkingBalance'))
		},
		savings: jsonRows(f, 'savings')
			.filter((r) => String(r.name ?? '').trim())
			.map((r) => ({ name: String(r.name), balanceMinor: balance(String(r.balance ?? '')) })),
		debts: jsonRows(f, 'debts')
			.filter((r) => String(r.name ?? '').trim())
			.map((r) => ({
				name: String(r.name),
				type: (r.type === 'loan' ? 'loan' : 'credit') as 'credit' | 'loan',
				owedMinor: Math.abs(balance(String(r.owed ?? '')))
			})),
		pay: {
			frequency: pay.frequency,
			amountMinor: pay.amountMinor,
			anchorDate: pay.anchorDate,
			semiDay1: pay.semiDay1,
			semiDay2: pay.semiDay2
		}
	};
}

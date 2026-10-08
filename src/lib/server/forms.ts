import { parseMoney } from '$lib/money';
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

import { today } from '$lib/month';
import { parseMoney } from '$lib/money';
import { getDb } from '$lib/server/db/client';
import { ACCOUNT_TYPES, type AccountType } from '$lib/server/db/schema';
import { handleValidation, requireUserId } from '$lib/server/page-helpers';
import { createAccount, listAccounts } from '$lib/server/repo/accounts';
import { listCategories } from '$lib/server/repo/categories';
import { createTransaction, ValidationError } from '$lib/server/repo/transactions';
import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	const userId = requireUserId(locals);
	return { accounts: listAccounts(getDb(), userId, { includeArchived: true }) };
};

export const actions: Actions = {
	create: async ({ locals, request }) => {
		const userId = requireUserId(locals);
		const f = await request.formData();
		const name = String(f.get('name') ?? '').trim();
		const type = String(f.get('type')) as AccountType;
		const balanceRaw = String(f.get('balance') ?? '').trim();
		const result = await handleValidation(() => {
			if (!name) throw new ValidationError('Give the account a name');
			if (!ACCOUNT_TYPES.includes(type)) throw new ValidationError('Pick an account type');
			const balance = balanceRaw ? parseMoney(balanceRaw) : 0;
			if (balance === null) throw new ValidationError('Starting balance is not a number');
			const db = getDb();
			const onBudget = f.get('onBudget') === 'on';
			// Debt accounts are entered as a positive amount owed.
			const signed = type === 'credit' || type === 'loan' ? -Math.abs(balance) : balance;
			const id = createAccount(db, userId, { name, type, onBudget });
			if (signed !== 0) {
				// Like Actual: a budget account's starting balance is income to budget.
				const income = onBudget
					? listCategories(db, userId).find((c) => c.isIncome)?.id
					: undefined;
				createTransaction(db, userId, {
					accountId: id,
					date: today(),
					amountMinor: signed,
					payeeName: 'Starting balance',
					categoryId: income ?? null,
					cleared: true
				});
			}
			return id;
		});
		if (typeof result === 'string') redirect(303, `/accounts/${result}`);
		return result;
	}
};

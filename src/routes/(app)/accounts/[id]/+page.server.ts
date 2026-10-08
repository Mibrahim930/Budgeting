import { getDb } from '$lib/server/db/client';
import { loadFormOptions, requireUserId, transactionActions } from '$lib/server/page-helpers';
import {
	getAccountWithBalance,
	setAccountArchived,
	updateAccount
} from '$lib/server/repo/accounts';
import { listTransactions } from '$lib/server/repo/transactions';
import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params, url }) => {
	const userId = requireUserId(locals);
	const db = getDb();
	const account = getAccountWithBalance(db, userId, params.id);
	if (!account) error(404, 'Account not found');
	const search = url.searchParams.get('q') ?? '';
	return {
		account,
		search,
		transactions: listTransactions(db, userId, {
			accountId: account.id,
			search: search || undefined
		}),
		...loadFormOptions(userId)
	};
};

export const actions: Actions = {
	...transactionActions,
	update: async ({ locals, params, request }) => {
		const userId = requireUserId(locals);
		const f = await request.formData();
		const name = String(f.get('name') ?? '').trim();
		if (!name) return fail(400, { error: 'Name is required' });
		updateAccount(getDb(), userId, params.id, { name, onBudget: f.get('onBudget') === 'on' });
		return { saved: true };
	},
	archive: async ({ locals, params, request }) => {
		const userId = requireUserId(locals);
		const f = await request.formData();
		setAccountArchived(getDb(), userId, params.id, f.get('archived') === 'true');
	}
};

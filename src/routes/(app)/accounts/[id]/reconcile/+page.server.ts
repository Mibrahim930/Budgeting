import { today } from '$lib/month';
import { parseMoney } from '$lib/money';
import { getDb } from '$lib/server/db/client';
import { requireUserId, transactionActions } from '$lib/server/page-helpers';
import { getAccountWithBalance, reconcileAccount } from '$lib/server/repo/accounts';
import { listTransactions } from '$lib/server/repo/transactions';
import { latestProviderBalances } from '$lib/server/sync/sync';
import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params }) => {
	const userId = requireUserId(locals);
	const db = getDb();
	const account = getAccountWithBalance(db, userId, params.id);
	if (!account) error(404, 'Account not found');
	return {
		account,
		bank: latestProviderBalances(db, userId, [account.id]).get(account.id) ?? null,
		unreconciled: listTransactions(db, userId, { accountId: account.id }).filter(
			(t) => !t.reconciled
		)
	};
};

export const actions: Actions = {
	toggleCleared: transactionActions.toggleCleared,
	finish: async ({ locals, params, request }) => {
		const userId = requireUserId(locals);
		const f = await request.formData();
		const statement = parseMoney(String(f.get('statement') ?? ''));
		if (statement === null) return fail(400, { error: 'Enter the statement balance' });
		const res = reconcileAccount(getDb(), userId, params.id, statement, {
			adjust: f.get('adjust') === 'true',
			date: today()
		});
		if (!res.ok)
			return fail(400, { difference: res.differenceMinor, statement: String(f.get('statement')) });
		redirect(303, `/accounts/${params.id}`);
	}
};

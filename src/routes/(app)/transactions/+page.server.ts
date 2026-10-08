import { isMonth } from '$lib/month';
import { getDb } from '$lib/server/db/client';
import { loadFormOptions, requireUserId, transactionActions } from '$lib/server/page-helpers';
import { listTransactions } from '$lib/server/repo/transactions';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	const userId = requireUserId(locals);
	const p = url.searchParams;
	const filter = {
		accountId: p.get('account') || undefined,
		categoryId: p.get('category') || undefined,
		month: isMonth(p.get('month')) ? p.get('month')! : undefined,
		search: p.get('q') || undefined,
		uncategorized: p.get('uncategorized') === '1'
	};
	return {
		filter,
		transactions: listTransactions(getDb(), userId, filter),
		...loadFormOptions(userId)
	};
};

export const actions: Actions = transactionActions;

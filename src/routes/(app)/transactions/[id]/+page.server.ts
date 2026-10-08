import { getDb } from '$lib/server/db/client';
import { parseTxnForm } from '$lib/server/forms';
import { handleValidation, loadFormOptions, requireUserId } from '$lib/server/page-helpers';
import { listPayees } from '$lib/server/repo/transactions';
import {
	deleteTransaction,
	getSplits,
	getTransaction,
	getTransferPartner,
	updateTransaction
} from '$lib/server/repo/transactions';
import { error, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params }) => {
	const userId = requireUserId(locals);
	const db = getDb();
	let t = getTransaction(db, userId, params.id);
	if (!t) error(404, 'Transaction not found');
	if (t.parentId) t = getTransaction(db, userId, t.parentId)!;
	const partner = getTransferPartner(db, userId, t);
	const payeeName = t.payeeId ? listPayees(db, userId).find((p) => p.id === t.payeeId)?.name : null;
	return {
		txn: {
			id: t.id,
			accountId: t.accountId,
			date: t.date,
			amountMinor: t.amountMinor,
			payeeName: payeeName ?? null,
			memo: t.memo,
			cleared: t.cleared,
			categoryId: t.categoryId,
			transferAccountId: partner?.accountId ?? null,
			splits: t.isParent
				? getSplits(db, userId, t.id).map((s) => ({
						amountMinor: s.amountMinor,
						categoryId: s.categoryId,
						memo: s.memo
					}))
				: []
		},
		description: t.description,
		source: t.source,
		reconciled: t.reconciled,
		...loadFormOptions(userId)
	};
};

/** Split children are edited through their parent. */
function rootId(userId: string, id: string) {
	const t = getTransaction(getDb(), userId, id);
	return t?.parentId ?? id;
}

export const actions: Actions = {
	save: async ({ locals, params, request }) => {
		const userId = requireUserId(locals);
		const form = await request.formData();
		const result = await handleValidation(() => {
			const input = parseTxnForm(form);
			updateTransaction(getDb(), userId, rootId(userId, params.id), input);
			return input.accountId;
		});
		if (typeof result === 'string') redirect(303, `/accounts/${result}`);
		return result;
	},
	delete: async ({ locals, params }) => {
		const userId = requireUserId(locals);
		const t = getTransaction(getDb(), userId, rootId(userId, params.id));
		if (t) deleteTransaction(getDb(), userId, t.id);
		redirect(303, t ? `/accounts/${t.accountId}` : '/transactions');
	}
};

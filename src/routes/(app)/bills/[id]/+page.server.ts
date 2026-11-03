import { today } from '$lib/month';
import { getDb } from '$lib/server/db/client';
import { parseBillForm } from '$lib/server/forms';
import { handleValidation, loadBillFormOptions, requireUserId } from '$lib/server/page-helpers';
import { deleteBill, endBill, getBill, listBills, updateBill } from '$lib/server/repo/bills';
import { error, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params }) => {
	const userId = requireUserId(locals);
	const db = getDb();
	const bill = getBill(db, userId, params.id);
	if (!bill) error(404, 'Bill not found');
	const item = listBills(db, userId, { includeEnded: true }).find((b) => b.id === bill.id);
	return {
		bill,
		nextDue: item?.nextDue ?? null,
		ended: item?.ended ?? false,
		...loadBillFormOptions(userId, [bill.accountId, bill.payToAccountId])
	};
};

export const actions: Actions = {
	update: async ({ locals, params, request }) => {
		const userId = requireUserId(locals);
		const f = await request.formData();
		return handleValidation(() => {
			updateBill(getDb(), userId, params.id, parseBillForm(f));
			return { saved: true };
		});
	},
	end: async ({ locals, params }) => {
		const userId = requireUserId(locals);
		return handleValidation(() => {
			endBill(getDb(), userId, params.id, today());
			return { ended: true };
		});
	},
	delete: async ({ locals, params }) => {
		deleteBill(getDb(), requireUserId(locals), params.id);
		redirect(303, '/bills');
	}
};

import { today } from '$lib/month';
import { getDb } from '$lib/server/db/client';
import { parseBillForm } from '$lib/server/forms';
import { handleValidation, loadBillFormOptions, requireUserId } from '$lib/server/page-helpers';
import { createBill, deleteBill, endBill, listBills } from '$lib/server/repo/bills';
import { ValidationError } from '$lib/server/repo/transactions';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	const userId = requireUserId(locals);
	return {
		bills: listBills(getDb(), userId, { includeEnded: true }),
		...loadBillFormOptions(userId)
	};
};

/** Like handleValidation, but the message comes back as `rowError` so it isn't shown in the form. */
function rowAction(fn: () => void) {
	try {
		fn();
	} catch (e) {
		if (e instanceof ValidationError) return fail(400, { rowError: e.message });
		throw e;
	}
}

export const actions: Actions = {
	create: async ({ locals, request }) => {
		const userId = requireUserId(locals);
		const f = await request.formData();
		return handleValidation(() => {
			createBill(getDb(), userId, parseBillForm(f));
			return { created: true };
		});
	},
	end: async ({ locals, request }) => {
		const userId = requireUserId(locals);
		const f = await request.formData();
		return rowAction(() => endBill(getDb(), userId, String(f.get('id')), today()));
	},
	delete: async ({ locals, request }) => {
		const userId = requireUserId(locals);
		const f = await request.formData();
		deleteBill(getDb(), userId, String(f.get('id')));
	}
};

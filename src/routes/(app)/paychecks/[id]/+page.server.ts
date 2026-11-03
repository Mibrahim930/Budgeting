import { today } from '$lib/month';
import { getDb } from '$lib/server/db/client';
import { parsePaycheckForm } from '$lib/server/forms';
import { handleValidation, loadBillFormOptions, requireUserId } from '$lib/server/page-helpers';
import { paycheckActions } from '$lib/server/paycheck-actions';
import { deletePaycheck, getPaycheck, updatePaycheck } from '$lib/server/repo/paychecks';
import { error, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params }) => {
	const userId = requireUserId(locals);
	const paycheck = getPaycheck(getDb(), userId, params.id);
	if (!paycheck) error(404, 'Paycheck not found');
	const keep = [
		paycheck.accountId,
		...paycheck.lines.flatMap((l) => [l.effectiveFromAccountId, l.toAccountId])
	];
	return { today: today(), paycheck, ...loadBillFormOptions(userId, keep) };
};

export const actions: Actions = {
	...paycheckActions,
	update: async ({ locals, request, params }) => {
		const userId = requireUserId(locals);
		const form = await request.formData();
		return handleValidation(() => {
			// The header form only edits these; the deposit account stays as it is.
			const { input } = parsePaycheckForm(form);
			updatePaycheck(getDb(), userId, params.id, {
				date: input.date,
				amountMinor: input.amountMinor,
				nextDate: input.nextDate,
				note: input.note
			});
			return { saved: true };
		});
	},
	delete: async ({ locals, params }) => {
		const userId = requireUserId(locals);
		const result = await handleValidation(() => {
			deletePaycheck(getDb(), userId, params.id);
			return { deleted: true };
		});
		if ('deleted' in result) redirect(303, '/');
		return result;
	}
};

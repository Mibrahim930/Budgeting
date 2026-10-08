import { addMonths, isMonth } from '$lib/month';
import { parseMoney } from '$lib/money';
import { getDb } from '$lib/server/db/client';
import { handleValidation, requireUserId } from '$lib/server/page-helpers';
import {
	copyLastMonth,
	getBudgetMonth,
	setBudgeted,
	uncategorizedSummary
} from '$lib/server/repo/budget';
import { ValidationError } from '$lib/server/repo/transactions';
import { error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params }) => {
	const userId = requireUserId(locals);
	if (!isMonth(params.month)) error(404, 'Not a month');
	const db = getDb();
	const mode = locals.user!.budgetMode === 'limits' ? 'limits' : 'envelope';
	return {
		budget: getBudgetMonth(db, userId, params.month, mode),
		prev: addMonths(params.month, -1),
		next: addMonths(params.month, 1),
		uncategorized: uncategorizedSummary(db, userId)
	};
};

export const actions: Actions = {
	setBudget: async ({ locals, params, request }) => {
		const userId = requireUserId(locals);
		const f = await request.formData();
		return handleValidation(() => {
			const raw = String(f.get('amount') ?? '').trim();
			const amount = raw === '' ? 0 : parseMoney(raw);
			if (amount === null) throw new ValidationError('Not a valid amount');
			setBudgeted(getDb(), userId, String(f.get('categoryId')), params.month, amount);
		});
	},
	copyLastMonth: ({ locals, params }) => {
		copyLastMonth(getDb(), requireUserId(locals), params.month);
	}
};

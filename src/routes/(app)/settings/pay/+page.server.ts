import { today } from '$lib/month';
import { getDb } from '$lib/server/db/client';
import { parsePayScheduleForm } from '$lib/server/forms';
import { handleValidation, requireUserId } from '$lib/server/page-helpers';
import { listAccounts } from '$lib/server/repo/accounts';
import { listCategoryTree } from '$lib/server/repo/categories';
import {
	defaultIncomeCategoryId,
	getPaySchedule,
	upsertPaySchedule
} from '$lib/server/repo/pay-schedule';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	const userId = requireUserId(locals);
	const db = getDb();
	const schedule = getPaySchedule(db, userId) ?? null;
	const depositAccounts = listAccounts(db, userId)
		.filter((a) => a.type !== 'credit' && a.type !== 'loan')
		.map((a) => ({ id: a.id, name: a.name }));
	return {
		schedule,
		today: today(),
		depositAccounts,
		defaultIncomeCategoryId: defaultIncomeCategoryId(db, userId),
		incomeGroups: listCategoryTree(db, userId)
			.filter((g) => g.isIncome)
			.map((g) => ({
				id: g.id,
				name: g.name,
				categories: g.categories.map((c) => ({ id: c.id, name: c.name }))
			}))
	};
};

export const actions: Actions = {
	default: async ({ locals, request }) => {
		const userId = requireUserId(locals);
		const form = await request.formData();
		return handleValidation(() => {
			upsertPaySchedule(getDb(), userId, parsePayScheduleForm(form));
			return { saved: true };
		});
	}
};

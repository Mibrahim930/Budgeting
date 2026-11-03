import { centsToInput } from '$lib/money';
import { addDays, isDate, today } from '$lib/month';
import { nextPayday } from '$lib/planner/payday';
import { getDb } from '$lib/server/db/client';
import { parsePaycheckForm } from '$lib/server/forms';
import { handleValidation, requireUserId } from '$lib/server/page-helpers';
import { listAccounts } from '$lib/server/repo/accounts';
import { billsDueBetween } from '$lib/server/repo/bills';
import { listCategoryTree } from '$lib/server/repo/categories';
import { getPaySchedule } from '$lib/server/repo/pay-schedule';
import { createPaycheck, suggestNextPaycheck } from '$lib/server/repo/paychecks';
import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

/**
 * `?date=&next=` choose the window whose bills are offered (the "Refresh bills" button also sends
 * the rest of the form, so `nextDate`, `amount` and `accountId` are read back to keep them).
 */
export const load: PageServerLoad = ({ locals, url }) => {
	const userId = requireUserId(locals);
	const db = getDb();
	const q = (k: string) => url.searchParams.get(k)?.trim() || '';
	const suggestion = suggestNextPaycheck(db, userId, today());
	const schedule = getPaySchedule(db, userId);

	const date = isDate(q('date')) ? q('date') : suggestion.date;
	const askedNext = q('next') || q('nextDate');
	const next =
		isDate(askedNext) && askedNext > date
			? askedNext
			: date === suggestion.date
				? suggestion.nextDate
				: schedule
					? nextPayday(schedule, date)
					: addDays(date, 14);

	const depositAccounts = listAccounts(db, userId)
		.filter((a) => a.type !== 'credit' && a.type !== 'loan')
		.map((a) => ({ id: a.id, name: a.name, type: a.type }));
	const incomeCategories = listCategoryTree(db, userId)
		.filter((g) => g.isIncome)
		.flatMap((g) => g.categories.map((c) => ({ id: c.id, name: c.name })));
	const askedAccount = q('accountId');

	return {
		date,
		next,
		amount: q('amount') || (suggestion.amountMinor ? centsToInput(suggestion.amountMinor) : ''),
		accountId: depositAccounts.some((a) => a.id === askedAccount)
			? askedAccount
			: (suggestion.accountId ?? depositAccounts[0]?.id ?? ''),
		incomeCategoryId: q('incomeCategoryId') || suggestion.incomeCategoryId || '',
		note: q('note'),
		depositAccounts,
		incomeCategories,
		billsDue: billsDueBetween(db, userId, date, next)
	};
};

export const actions: Actions = {
	create: async ({ locals, request }) => {
		const userId = requireUserId(locals);
		const form = await request.formData();
		const result = await handleValidation(() => {
			const { input, billOccurrences } = parsePaycheckForm(form);
			return { id: createPaycheck(getDb(), userId, input, { billOccurrences }) };
		});
		if ('id' in result) redirect(303, `/paychecks/${result.id}`);
		return result;
	}
};

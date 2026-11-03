import { currentMonth, isDate, isMonth, monthOf, today } from '$lib/month';
import { getDb } from '$lib/server/db/client';
import { parseBillForm } from '$lib/server/forms';
import { loadBillFormOptions, requireUserId } from '$lib/server/page-helpers';
import { createBillAndPlan } from '$lib/server/repo/bills';
import { calendarMonth } from '$lib/server/repo/calendar';
import { getPaycheckRow } from '$lib/server/repo/paychecks';
import { ValidationError } from '$lib/server/repo/transactions';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	const userId = requireUserId(locals);
	const db = getDb();
	const todayDate = today();
	const m = url.searchParams.get('month');
	const month = isMonth(m) ? m : currentMonth();
	const d = url.searchParams.get('day');
	const day =
		isDate(d) && monthOf(d) === month
			? d
			: monthOf(todayDate) === month
				? todayDate
				: `${month}-01`;
	const addedId = url.searchParams.get('added');
	const addedTo = addedId ? (getPaycheckRow(db, userId, addedId)?.date ?? null) : null;
	return {
		today: todayDate,
		day,
		addedTo,
		addedId: addedTo ? addedId : null,
		calendar: calendarMonth(db, userId, month),
		...loadBillFormOptions(userId)
	};
};

export const actions: Actions = {
	create: async ({ locals, request }) => {
		const userId = requireUserId(locals);
		const f = await request.formData();
		let target: string;
		try {
			const input = parseBillForm(f);
			const { added } = createBillAndPlan(getDb(), userId, input);
			const params = new URLSearchParams({
				month: monthOf(input.startDate),
				day: input.startDate,
				added: added[0]?.paycheckId ?? 'none'
			});
			target = `/calendar?${params}`;
		} catch (e) {
			if (e instanceof ValidationError) return fail(400, { error: e.message });
			throw e;
		}
		redirect(303, target);
	}
};

import { addMonths, currentMonth, isMonth } from '$lib/month';
import { getDb } from '$lib/server/db/client';
import { requireUserId } from '$lib/server/page-helpers';
import { incomeVsSpending, spendingByCategory } from '$lib/server/repo/reports';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	const userId = requireUserId(locals);
	const db = getDb();
	const month = isMonth(url.searchParams.get('month'))
		? url.searchParams.get('month')!
		: currentMonth();
	const span = Number(url.searchParams.get('span')) || 1;
	const from = addMonths(month, -(span - 1));
	return {
		month,
		span,
		from,
		spending: spendingByCategory(db, userId, from, month),
		trend: incomeVsSpending(db, userId, month, 12)
	};
};

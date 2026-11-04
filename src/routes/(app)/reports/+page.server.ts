import { addMonths, currentMonth, isMonth, today } from '$lib/month';
import { getDb } from '$lib/server/db/client';
import { requireUserId } from '$lib/server/page-helpers';
import { getPaycheck, listPaychecks, pickHomePaycheck } from '$lib/server/repo/paychecks';
import { incomeVsSpending, paycheckBreakdown, spendingByCategory } from '$lib/server/repo/reports';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	const userId = requireUserId(locals);
	const db = getDb();
	const month = isMonth(url.searchParams.get('month'))
		? url.searchParams.get('month')!
		: currentMonth();
	const span = Number(url.searchParams.get('span')) || 1;
	const from = addMonths(month, -(span - 1));
	// The plan the home page shows, for the spending-money rings (same recipe as the home load).
	const now = today();
	const picked = pickHomePaycheck(listPaychecks(db, userId), now);
	return {
		month,
		span,
		from,
		spending: spendingByCategory(db, userId, from, month),
		trend: incomeVsSpending(db, userId, month, 12),
		paychecks: paycheckBreakdown(db, userId),
		today: now,
		current: picked ? (getPaycheck(db, userId, picked.id) ?? null) : null
	};
};

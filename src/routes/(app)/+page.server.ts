import { addDays, today } from '$lib/month';
import { nextPayday } from '$lib/planner/payday';
import { getDb } from '$lib/server/db/client';
import { needsOnboarding } from '$lib/server/onboarding';
import { requireUserId } from '$lib/server/page-helpers';
import { paycheckActions } from '$lib/server/paycheck-actions';
import { listAccounts } from '$lib/server/repo/accounts';
import { billsDueBetween } from '$lib/server/repo/bills';
import { getPaySchedule } from '$lib/server/repo/pay-schedule';
import {
	getPaycheck,
	listPaychecks,
	pickHomePaycheck,
	suggestNextPaycheck
} from '$lib/server/repo/paychecks';
import { uncategorizedSummary } from '$lib/server/repo/transactions';
import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

/** Without a pay schedule, "upcoming" bills look this far ahead. */
const UPCOMING_DAYS = 30;

export const load: PageServerLoad = ({ locals }) => {
	const userId = requireUserId(locals);
	const db = getDb();
	if (needsOnboarding(db, userId)) redirect(303, '/welcome');

	const now = today();
	const schedule = getPaySchedule(db, userId) ?? null;
	const paychecks = listPaychecks(db, userId);
	const picked = pickHomePaycheck(paychecks, now);
	const upcomingEnd = schedule ? nextPayday(schedule, now) : addDays(now, UPCOMING_DAYS);

	return {
		today: now,
		schedule,
		paychecks,
		home: picked ? (getPaycheck(db, userId, picked.id) ?? null) : null,
		suggestNext: suggestNextPaycheck(db, userId, now),
		upcoming: billsDueBetween(db, userId, now, upcomingEnd),
		upcomingEnd,
		accounts: listAccounts(db, userId),
		uncategorized: uncategorizedSummary(db, userId)
	};
};

export const actions: Actions = { ...paycheckActions };

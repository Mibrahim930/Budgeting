import { safeNext } from '$lib/safe-redirect';
import { getDb } from '$lib/server/db/client';
import { countUsers } from '$lib/server/repo/invites';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	const next = safeNext(url.searchParams.get('next'));
	if (locals.user) redirect(303, next);
	// Fresh install: send the first visitor to create the admin account.
	if (countUsers(getDb()) === 0) redirect(303, '/signup');
	return { next };
};

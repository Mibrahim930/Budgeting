import { getAuth } from '$lib/server/auth';
import { getDb } from '$lib/server/db/client';
import { user } from '$lib/server/db/schema';
import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { Actions } from './$types';

export const actions: Actions = {
	signOut: async ({ request }) => {
		await getAuth().api.signOut({ headers: request.headers });
		redirect(303, '/login');
	},
	budgetMode: async ({ locals, request }) => {
		const mode = String((await request.formData()).get('mode'));
		if (mode !== 'envelope' && mode !== 'limits') return fail(400, { error: 'Unknown mode' });
		getDb().update(user).set({ budgetMode: mode }).where(eq(user.id, locals.user!.id)).run();
		return { saved: true };
	}
};

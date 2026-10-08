import { getAuth } from '$lib/server/auth';
import { getDb } from '$lib/server/db/client';
import { countUsers, findUsableInvite } from '$lib/server/repo/invites';
import { registerUser, SignupError } from '$lib/server/signup';
import { fail, redirect } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	if (locals.user) redirect(303, '/budget');
	const db = getDb();
	const isFirstUser = countUsers(db) === 0;
	const invite = url.searchParams.get('invite');
	const inviteValid = !!invite && !!findUsableInvite(db, invite);
	return { isFirstUser, invite, inviteValid };
};

export const actions: Actions = {
	default: async ({ request }) => {
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		const email = String(form.get('email') ?? '').trim();
		const password = String(form.get('password') ?? '');
		const inviteCode = String(form.get('invite') ?? '') || null;

		if (!name || !email || password.length < 10) {
			return fail(400, {
				name,
				email,
				error: 'Fill in all fields. Passwords need 10+ characters.'
			});
		}
		try {
			await registerUser(
				getDb(),
				getAuth(),
				{ name, email, password, inviteCode },
				request.headers
			);
		} catch (e) {
			if (e instanceof SignupError) return fail(400, { name, email, error: e.message });
			if (e instanceof APIError) return fail(400, { name, email, error: e.message });
			throw e;
		}
		redirect(303, '/budget');
	}
};

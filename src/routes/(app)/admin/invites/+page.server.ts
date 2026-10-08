import { getDb } from '$lib/server/db/client';
import { createInvite, listInvites, revokeInvite } from '$lib/server/repo/invites';
import { error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

function requireAdmin(locals: App.Locals) {
	if (locals.user?.role !== 'admin') error(403, 'Admins only');
	return locals.user;
}

export const load: PageServerLoad = ({ locals, url }) => {
	const admin = requireAdmin(locals);
	return { invites: listInvites(getDb(), admin.id), origin: url.origin };
};

export const actions: Actions = {
	create: ({ locals }) => {
		const admin = requireAdmin(locals);
		const inv = createInvite(getDb(), admin.id);
		return { created: inv.code };
	},
	revoke: async ({ locals, request }) => {
		const admin = requireAdmin(locals);
		const code = String((await request.formData()).get('code') ?? '');
		revokeInvite(getDb(), admin.id, code);
	}
};

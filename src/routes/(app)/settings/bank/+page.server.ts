import { getDb } from '$lib/server/db/client';
import { requireUserId } from '$lib/server/page-helpers';
import { SimplefinError } from '$lib/server/sync/simplefin';
import {
	connectSimplefin,
	listConnections,
	removeConnection,
	syncConnection
} from '$lib/server/sync/sync';
import { listAccounts } from '$lib/server/repo/accounts';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	const userId = requireUserId(locals);
	const db = getDb();
	const accounts = listAccounts(db, userId);
	return {
		connections: listConnections(db, userId).map((c) => ({
			...c,
			accounts: accounts.filter((a) => a.connectionId === c.id).map((a) => a.name)
		}))
	};
};

export const actions: Actions = {
	connect: async ({ locals, request }) => {
		const userId = requireUserId(locals);
		const token = String((await request.formData()).get('token') ?? '').trim();
		if (!token) return fail(400, { error: 'Paste your SimpleFIN setup token' });
		let id: string;
		try {
			id = await connectSimplefin(getDb(), userId, token);
		} catch (e) {
			if (e instanceof SimplefinError) return fail(400, { error: e.message });
			return fail(502, { error: 'Could not reach SimpleFIN. Try again in a minute.' });
		}
		redirect(303, `/settings/bank/${id}`);
	},
	sync: async ({ locals, request }) => {
		const userId = requireUserId(locals);
		const id = String((await request.formData()).get('id'));
		const res = await syncConnection(getDb(), userId, id);
		const added = res.accounts.reduce((n, a) => n + a.result.added, 0);
		return { synced: { added, errors: res.errors } };
	},
	remove: async ({ locals, request }) => {
		const userId = requireUserId(locals);
		removeConnection(getDb(), userId, String((await request.formData()).get('id')));
	}
};

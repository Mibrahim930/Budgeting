import { getDb } from '$lib/server/db/client';
import { requireUserId } from '$lib/server/page-helpers';
import { listAccounts } from '$lib/server/repo/accounts';
import { SimplefinError } from '$lib/server/sync/simplefin';
import { linkAccounts, listProviderAccounts, type LinkChoice } from '$lib/server/sync/sync';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const userId = requireUserId(locals);
	const db = getDb();
	const accounts = listAccounts(db, userId).map((a) => ({
		id: a.id,
		name: a.name,
		connectionId: a.connectionId
	}));
	try {
		const provider = await listProviderAccounts(db, userId, params.id);
		return { provider, accounts, loadError: null };
	} catch (e) {
		return {
			provider: { accounts: [], errors: [] },
			accounts,
			loadError: e instanceof SimplefinError ? e.message : 'Could not reach SimpleFIN.'
		};
	}
};

export const actions: Actions = {
	link: async ({ locals, params, request }) => {
		const userId = requireUserId(locals);
		const f = await request.formData();
		const choices: LinkChoice[] = f.getAll('externalId').map((v) => {
			const externalId = String(v);
			return {
				externalId,
				target: String(f.get(`target:${externalId}`) ?? 'ignore'),
				name: String(f.get(`name:${externalId}`) ?? ''),
				balanceMinor: Number(f.get(`balance:${externalId}`) ?? 0)
			};
		});
		try {
			await linkAccounts(getDb(), userId, params.id, choices);
		} catch (e) {
			return fail(400, { error: e instanceof Error ? e.message : 'Linking failed' });
		}
		redirect(303, '/accounts');
	}
};

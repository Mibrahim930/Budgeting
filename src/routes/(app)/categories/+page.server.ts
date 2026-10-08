import { getDb } from '$lib/server/db/client';
import { requireUserId } from '$lib/server/page-helpers';
import {
	archiveCategory,
	archiveGroup,
	createCategory,
	createGroup,
	listCategoryTree,
	renameCategory,
	renameGroup
} from '$lib/server/repo/categories';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => ({
	groups: listCategoryTree(getDb(), requireUserId(locals))
});

async function fields(request: Request) {
	const f = await request.formData();
	return { id: String(f.get('id') ?? ''), name: String(f.get('name') ?? '').trim() };
}

export const actions: Actions = {
	addGroup: async ({ locals, request }) => {
		const { name } = await fields(request);
		if (!name) return fail(400, { error: 'Name is required' });
		createGroup(getDb(), requireUserId(locals), name);
	},
	addCategory: async ({ locals, request }) => {
		const { id, name } = await fields(request);
		if (!name) return fail(400, { error: 'Name is required' });
		createCategory(getDb(), requireUserId(locals), id, name);
	},
	renameGroup: async ({ locals, request }) => {
		const { id, name } = await fields(request);
		if (name) renameGroup(getDb(), requireUserId(locals), id, name);
	},
	renameCategory: async ({ locals, request }) => {
		const { id, name } = await fields(request);
		if (name) renameCategory(getDb(), requireUserId(locals), id, name);
	},
	archiveGroup: async ({ locals, request }) => {
		const { id } = await fields(request);
		archiveGroup(getDb(), requireUserId(locals), id);
	},
	archiveCategory: async ({ locals, request }) => {
		const { id } = await fields(request);
		archiveCategory(getDb(), requireUserId(locals), id);
	}
};

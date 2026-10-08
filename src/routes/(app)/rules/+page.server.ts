import { getDb } from '$lib/server/db/client';
import { handleValidation, loadFormOptions, requireUserId } from '$lib/server/page-helpers';
import {
	applyRulesToUncategorized,
	createRule,
	deleteRule,
	listRules,
	type RuleField,
	type RuleOp
} from '$lib/server/rules/apply';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	const userId = requireUserId(locals);
	const { groups } = loadFormOptions(userId);
	return {
		rules: listRules(getDb(), userId),
		groups,
		prefill: {
			matchValue: url.searchParams.get('match') ?? '',
			setCategoryId: url.searchParams.get('category') ?? ''
		}
	};
};

export const actions: Actions = {
	create: async ({ locals, request }) => {
		const userId = requireUserId(locals);
		const f = await request.formData();
		return handleValidation(() => {
			createRule(getDb(), userId, {
				matchField: String(f.get('matchField')) as RuleField,
				matchOp: String(f.get('matchOp')) as RuleOp,
				matchValue: String(f.get('matchValue') ?? ''),
				setCategoryId: String(f.get('setCategoryId') ?? '') || null,
				setPayeeName: String(f.get('setPayeeName') ?? '') || null,
				priority: Number(f.get('priority') ?? 0) || 0
			});
			const applied = f.get('applyNow') === 'on' ? applyRulesToUncategorized(getDb(), userId) : 0;
			return { created: true, applied };
		});
	},
	delete: async ({ locals, request }) => {
		const f = await request.formData();
		deleteRule(getDb(), requireUserId(locals), String(f.get('id')));
	},
	apply: ({ locals }) => ({ applied: applyRulesToUncategorized(getDb(), requireUserId(locals)) })
};

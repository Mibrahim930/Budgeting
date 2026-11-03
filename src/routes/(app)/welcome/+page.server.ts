import { today } from '$lib/month';
import { getDb } from '$lib/server/db/client';
import { parseOnboardingForm } from '$lib/server/forms';
import { completeOnboarding, needsOnboarding } from '$lib/server/onboarding';
import { handleValidation, requireUserId } from '$lib/server/page-helpers';
import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	const userId = requireUserId(locals);
	if (!needsOnboarding(getDb(), userId)) redirect(303, '/');
	return { today: today() };
};

export const actions: Actions = {
	default: async ({ locals, request }) => {
		const userId = requireUserId(locals);
		const form = await request.formData();
		const result = await handleValidation(() => {
			completeOnboarding(getDb(), userId, parseOnboardingForm(form));
			return { done: true as const };
		});
		if ('done' in result) redirect(303, '/');
		return result;
	}
};

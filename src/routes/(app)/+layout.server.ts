import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => {
	if (!locals.user) redirect(303, '/login');
	const { id, name, email, role, budgetMode } = locals.user;
	return { user: { id, name, email, role, budgetMode } };
};

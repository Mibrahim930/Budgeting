import { redirect } from '@sveltejs/kit';

// Temporary until the paycheck planner home page exists.
export const load = () => redirect(303, '/accounts');

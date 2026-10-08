import { currentMonth } from '$lib/month';
import { redirect } from '@sveltejs/kit';

export const load = () => redirect(303, `/budget/${currentMonth()}`);

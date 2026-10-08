import { building } from '$app/environment';
import { getAuth } from '$lib/server/auth';
import { startSyncScheduler } from '$lib/server/sync/scheduler';
import { error, redirect, type Handle, type ServerInit } from '@sveltejs/kit';
import { svelteKitHandler } from 'better-auth/svelte-kit';

export const init: ServerInit = () => {
	if (!building) startSyncScheduler();
};

const PUBLIC_PATHS = ['/login', '/signup', '/privacy'];

export const handle: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;

	// Sign-up only happens through the invite-checking form action on /signup.
	if (pathname.startsWith('/api/auth/sign-up')) error(403, 'Sign-up requires an invite');

	if (building) return resolve(event);

	const auth = getAuth();
	const session = await auth.api.getSession({ headers: event.request.headers });
	event.locals.user = session?.user ?? null;
	event.locals.session = session?.session ?? null;

	const isPublic =
		pathname.startsWith('/api/auth') ||
		PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
	if (!isPublic && !event.locals.user) {
		redirect(303, `/login?next=${encodeURIComponent(pathname + event.url.search)}`);
	}

	return svelteKitHandler({ event, resolve, auth, building });
};

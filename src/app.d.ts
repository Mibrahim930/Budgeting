// See https://svelte.dev/docs/kit/types#app.d.ts
import type { Auth } from '$lib/server/auth';

type SessionData = NonNullable<Awaited<ReturnType<Auth['api']['getSession']>>>;

declare global {
	namespace App {
		interface Locals {
			user: SessionData['user'] | null;
			session: SessionData['session'] | null;
		}
	}
}

export {};

import { passkey } from '@better-auth/passkey';
import { getRequestEvent } from '$app/server';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import type { Db } from './db/client';
import { getDb } from './db/client';
import * as schema from './db/schema';

/** `withSvelteKitCookies` is off in unit tests, which run outside a SvelteKit request. */
export function createAuth(db: Db, { withSvelteKitCookies = true } = {}) {
	const baseURL = process.env.BETTER_AUTH_URL ?? process.env.ORIGIN ?? 'http://localhost:5173';
	return betterAuth({
		baseURL,
		secret: process.env.BETTER_AUTH_SECRET,
		database: drizzleAdapter(db, { provider: 'sqlite', schema }),
		emailAndPassword: {
			enabled: true,
			minPasswordLength: 10
		},
		user: {
			additionalFields: {
				role: { type: 'string', input: false, defaultValue: 'user' },
				budgetMode: { type: 'string', input: false, defaultValue: 'envelope' }
			}
		},
		session: {
			expiresIn: 60 * 60 * 24 * 30,
			updateAge: 60 * 60 * 24
		},
		rateLimit: {
			enabled: true,
			window: 60,
			max: 100,
			customRules: {
				'/sign-in/email': { window: 60, max: 5 },
				'/sign-in/passkey': { window: 60, max: 10 }
			}
		},
		advanced: {
			useSecureCookies: baseURL.startsWith('https://'),
			// Fly.io's edge sets this header to the real client IP (used for rate limiting).
			ipAddress: { ipAddressHeaders: ['fly-client-ip'] }
		},
		plugins: [
			passkey({ rpName: 'Budgeting' }),
			...(withSvelteKitCookies ? [sveltekitCookies(getRequestEvent)] : [])
		]
	});
}

export type Auth = ReturnType<typeof createAuth>;

let instance: Auth | undefined;

export function getAuth(): Auth {
	instance ??= createAuth(getDb());
	return instance;
}

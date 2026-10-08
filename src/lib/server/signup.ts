import { eq } from 'drizzle-orm';
import type { Auth } from './auth';
import type { Db } from './db/client';
import { user } from './db/schema';
import { countUsers, findUsableInvite, markInviteUsed } from './repo/invites';
import { seedDefaultCategories } from './repo/categories';

export class SignupError extends Error {}

export interface SignupInput {
	name: string;
	email: string;
	password: string;
	inviteCode?: string | null;
}

/**
 * Sign-up is invite-only. The very first user needs no invite and becomes the admin.
 * Public `/api/auth/sign-up/*` requests are blocked in hooks.server.ts, so this is the only path.
 */
export async function registerUser(db: Db, auth: Auth, input: SignupInput, headers: Headers) {
	const isFirstUser = countUsers(db) === 0;
	const code = input.inviteCode?.trim() || null;
	if (!isFirstUser) {
		if (!code || !findUsableInvite(db, code)) {
			throw new SignupError('This invite link is invalid, used or expired.');
		}
	}

	const result = await auth.api.signUpEmail({
		body: { name: input.name, email: input.email, password: input.password },
		headers
	});
	const userId = result.user.id;

	if (isFirstUser) {
		db.update(user).set({ role: 'admin' }).where(eq(user.id, userId)).run();
	} else if (code) {
		markInviteUsed(db, code, userId);
	}
	seedDefaultCategories(db, userId);
	return userId;
}

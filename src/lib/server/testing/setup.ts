import { createAuth } from '../auth';
import { openDb, type Db } from '../db/client';
import { registerUser } from '../signup';

/** Fresh in-memory database + auth instance for a test. */
export function setupTest() {
	process.env.BETTER_AUTH_SECRET ??= 'test-secret-test-secret-test-secret-123';
	process.env.DATA_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString('base64');
	const db = openDb(':memory:');
	const auth = createAuth(db, { withSvelteKitCookies: false });
	return { db, auth };
}

let n = 0;

/** Register a user (the first becomes admin; later ones get an auto-created invite). */
export async function makeUser(db: Db, auth: ReturnType<typeof createAuth>, inviteCode?: string) {
	n += 1;
	return registerUser(
		db,
		auth,
		{
			name: `User ${n}`,
			email: `user${n}@example.test`,
			password: 'correct-horse-battery',
			inviteCode
		},
		new Headers()
	);
}

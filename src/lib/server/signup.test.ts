import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { user } from './db/schema';
import { listCategoryTree } from './repo/categories';
import { createInvite, findUsableInvite } from './repo/invites';
import { SignupError } from './signup';
import { makeUser, setupTest } from './testing/setup';

describe('registerUser', () => {
	it('makes the first user an admin without an invite and seeds categories', async () => {
		const { db, auth } = setupTest();
		const id = await makeUser(db, auth);
		expect(db.select().from(user).where(eq(user.id, id)).get()?.role).toBe('admin');
		expect(listCategoryTree(db, id).length).toBeGreaterThan(0);
	});

	it('requires a valid invite after the first user', async () => {
		const { db, auth } = setupTest();
		await makeUser(db, auth);
		await expect(makeUser(db, auth)).rejects.toBeInstanceOf(SignupError);
		await expect(makeUser(db, auth, 'bogus')).rejects.toBeInstanceOf(SignupError);
	});

	it('accepts an invite once and marks it used', async () => {
		const { db, auth } = setupTest();
		const admin = await makeUser(db, auth);
		const { code } = createInvite(db, admin);
		const friend = await makeUser(db, auth, code);
		expect(db.select().from(user).where(eq(user.id, friend)).get()?.role).toBe('user');
		expect(findUsableInvite(db, code)).toBeUndefined();
		await expect(makeUser(db, auth, code)).rejects.toBeInstanceOf(SignupError);
	});

	it('rejects expired invites', async () => {
		const { db, auth } = setupTest();
		const admin = await makeUser(db, auth);
		const { code } = createInvite(db, admin, new Date(Date.now() - 8 * 86400_000));
		await expect(makeUser(db, auth, code)).rejects.toBeInstanceOf(SignupError);
	});
});

import { count, eq } from 'drizzle-orm';
import { expect, it } from 'vitest';
import { finAccount, txn, user } from '../db/schema';
import { makeUser, setupTest } from '../testing/setup';
import { createAccount } from './accounts';
import { createTransaction } from './transactions';

it('deleting a user removes all of their data', async () => {
	const { db, auth } = setupTest();
	const id = await makeUser(db, auth);
	const acct = createAccount(db, id, { name: 'A', type: 'checking' });
	createTransaction(db, id, {
		accountId: acct,
		date: '2026-01-01',
		amountMinor: 1,
		payeeName: 'X'
	});
	db.delete(user).where(eq(user.id, id)).run();
	expect(db.select({ n: count() }).from(txn).get()?.n).toBe(0);
	expect(db.select({ n: count() }).from(finAccount).get()?.n).toBe(0);
});

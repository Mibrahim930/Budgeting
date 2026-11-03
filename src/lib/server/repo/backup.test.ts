import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDb } from '../db/client';
import { makeUser, setupTest } from '../testing/setup';
import { createAccount, listAccounts } from './accounts';
import { writeBackup } from './backup';

let dir: string | undefined;

afterEach(() => {
	if (dir) rmSync(dir, { recursive: true, force: true });
	dir = undefined;
});

describe('writeBackup', () => {
	it('writes a copy of the database that opens with the same data', async () => {
		const { db, auth } = setupTest();
		const user = await makeUser(db, auth);
		createAccount(db, user, { name: 'Checking', type: 'checking' });

		dir = mkdtempSync(join(tmpdir(), 'backup-test-'));
		const dest = join(dir, 'copy.db');
		const size = await writeBackup(db, dest);
		expect(size).toBeGreaterThan(0);

		const copy = openDb(dest);
		try {
			expect(listAccounts(copy, user).map((a) => a.name)).toEqual(['Checking']);
		} finally {
			copy.$client.close();
		}
	});
});

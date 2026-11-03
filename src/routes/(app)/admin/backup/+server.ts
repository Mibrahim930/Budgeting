import { getDb } from '$lib/server/db/client';
import { writeBackup } from '$lib/server/repo/backup';
import { today } from '$lib/month';
import { error } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RequestHandler } from './$types';

/** Admin only: download a consistent copy of the whole database (everyone's data). */
export const GET: RequestHandler = async ({ locals }) => {
	if (locals.user?.role !== 'admin') error(403, 'Admins only');

	const tmp = join(tmpdir(), `budget-backup-${randomUUID()}.db`);
	try {
		await writeBackup(getDb(), tmp);
		const bytes = await readFile(tmp);
		return new Response(bytes, {
			headers: {
				'Content-Type': 'application/vnd.sqlite3',
				'Content-Disposition': `attachment; filename="budget-${today()}.db"`,
				'Content-Length': String(bytes.byteLength),
				'Cache-Control': 'no-store'
			}
		});
	} finally {
		await rm(tmp, { force: true });
	}
};

import { statSync } from 'node:fs';
import type { Db } from '../db/client';

/**
 * Copy the whole database to `destPath` with SQLite's online backup API, which is safe while the
 * app keeps reading and writing (WAL mode). Returns the size of the copy in bytes.
 */
export async function writeBackup(db: Db, destPath: string): Promise<number> {
	await db.$client.backup(destPath);
	return statSync(destPath).size;
}

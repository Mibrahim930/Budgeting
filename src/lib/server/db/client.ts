import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import * as schema from './schema';

export type Db = BetterSQLite3Database<typeof schema>;

const MIGRATIONS_DIR = resolve(process.env.MIGRATIONS_DIR ?? 'src/lib/server/db/migrations');

/** Open a SQLite database (file path or ':memory:') and apply pending migrations. */
export function openDb(path: string): Db {
	if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
	const sqlite = new Database(path);
	sqlite.pragma('journal_mode = WAL');
	sqlite.pragma('foreign_keys = ON');
	sqlite.pragma('busy_timeout = 5000');
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_DIR });
	return db;
}

let instance: Db | undefined;

/** The app-wide database, opened lazily from DATABASE_PATH. */
export function getDb(): Db {
	instance ??= openDb(process.env.DATABASE_PATH ?? './data/budget.db');
	return instance;
}

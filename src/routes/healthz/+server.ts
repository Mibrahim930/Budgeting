import { getDb } from '$lib/server/db/client';
import { sql } from 'drizzle-orm';

/** Liveness check for the host: the app is up and the database answers. */
export function GET() {
	getDb().run(sql`select 1`);
	return new Response('ok');
}

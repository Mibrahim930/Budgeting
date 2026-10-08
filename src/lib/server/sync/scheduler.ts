import { getDb } from '../db/client';
import { syncAll } from './sync';

// SimpleFIN asks clients to stay under ~24 requests a day; every 6 hours is plenty for a budget.
const INTERVAL_MS = 6 * 60 * 60 * 1000;
const FIRST_RUN_DELAY_MS = 60 * 1000;

let started = false;

export function startSyncScheduler() {
	if (started || process.env.DISABLE_SYNC_SCHEDULER) return;
	started = true;
	const run = async () => {
		try {
			const n = await syncAll(getDb());
			if (n) console.log(`Background sync finished for ${n} connection(s)`);
		} catch (e) {
			console.error('Background sync failed:', e instanceof Error ? e.message : e);
		}
	};
	setTimeout(run, FIRST_RUN_DELAY_MS).unref();
	setInterval(run, INTERVAL_MS).unref();
}

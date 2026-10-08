import { describe, expect, it } from 'vitest';
import { openDb } from './client';
import { user } from './schema';

describe('openDb', () => {
	it('applies migrations to an in-memory database', () => {
		const db = openDb(':memory:');
		expect(db.select().from(user).all()).toEqual([]);
	});
});

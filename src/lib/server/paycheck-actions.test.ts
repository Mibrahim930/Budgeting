import type { RequestEvent } from '@sveltejs/kit';
import { beforeAll, expect, it } from 'vitest';
import { createAuth } from './auth';
import { getDb } from './db/client';
import { paycheckActions } from './paycheck-actions';
import { createAccount, getAccountWithBalance } from './repo/accounts';
import { createPaycheck, getPaycheck } from './repo/paychecks';
import { makeUser } from './testing/setup';

let userId: string;
let checking: string;
let savings: string;
let paycheckId: string;

beforeAll(async () => {
	process.env.DATABASE_PATH = ':memory:';
	process.env.BETTER_AUTH_SECRET ??= 'test-secret-test-secret-test-secret-123';
	const db = getDb();
	userId = await makeUser(db, createAuth(db, { withSvelteKitCookies: false }));
	checking = createAccount(db, userId, { name: 'Checking', type: 'checking' });
	savings = createAccount(db, userId, { name: 'Savings', type: 'savings' });
	paycheckId = createPaycheck(db, userId, {
		date: '2030-01-03',
		amountMinor: 100000,
		accountId: checking
	});
});

/** Call an action the way SvelteKit does. */
function post(name: keyof typeof paycheckActions, fields: Record<string, string>) {
	const body = new FormData();
	for (const [k, v] of Object.entries(fields)) body.append(k, v);
	const event = {
		locals: { user: { id: userId } },
		request: new Request('http://test/', { method: 'POST', body })
	} as unknown as RequestEvent;
	return paycheckActions[name](event);
}

it('adds, ticks and unticks a line through the actions', async () => {
	expect(
		await post('addLine', { paycheckId, kind: 'savings', amount: '100', toAccountId: savings })
	).toEqual({ added: true });
	const line = getPaycheck(getDb(), userId, paycheckId)!.lines[0];
	await post('confirmLine', { id: line.id });
	expect(getAccountWithBalance(getDb(), userId, savings)!.balanceMinor).toBe(10000);
	await post('updateLine', { id: line.id, amount: '5' });
	expect(getPaycheck(getDb(), userId, paycheckId)!.lines[0].amountMinor).toBe(10000);
	await post('unconfirmLine', { id: line.id });
	await post('updateLine', { id: line.id, amount: '5' });
	expect(getPaycheck(getDb(), userId, paycheckId)!.lines[0].amountMinor).toBe(500);
	await post('confirmIncome', { paycheckId });
	expect(getAccountWithBalance(getDb(), userId, checking)!.balanceMinor).toBe(100000);
	await post('unconfirmIncome', { paycheckId });
	await post('allocateLeftover', { paycheckId });
	expect(getPaycheck(getDb(), userId, paycheckId)!.totals.left).toBe(0);
	await post('removeLine', { id: line.id });
	expect(getPaycheck(getDb(), userId, paycheckId)!.lines).toHaveLength(1);
});

it('turns validation errors into 400s', async () => {
	const res = await post('addLine', {
		paycheckId,
		kind: 'debt',
		amount: '1',
		toAccountId: savings
	});
	expect(res).toMatchObject({ status: 400, data: { error: 'Debt payments go to a card or loan' } });
	const edit = await post('confirmLine', { id: 'nope' });
	expect(edit).toMatchObject({ status: 400, data: { error: 'Line not found' } });
});

import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/client';
import { bankConnection } from '../db/schema';
import { getAccountWithBalance, listAccounts } from '../repo/accounts';
import { listTransactions } from '../repo/transactions';
import { makeUser, setupTest } from '../testing/setup';
import { claimSetupToken, fetchAccounts, unixToDate, type FetchLike } from './simplefin';
import { connectSimplefin, linkAccounts, listProviderAccounts, syncConnection } from './sync';

const ACCESS = 'https://user123:secret456@bridge.example/simplefin';
const setupToken = Buffer.from('https://bridge.example/simplefin/claim/abc').toString('base64');
const day = (iso: string) => Date.parse(`${iso}T16:00:00Z`) / 1000;

type Txn = { id: string; posted: number; amount: string; description: string; pending?: boolean };

/** A fake SimpleFIN Bridge. */
function fakeBridge(state: { txns: Txn[]; balance: string }) {
	const calls: { url: string; auth: string | null }[] = [];
	const impl: FetchLike = async (input, init) => {
		const url = new URL(String(input));
		const auth = new Headers(init?.headers).get('Authorization');
		calls.push({ url: url.toString(), auth });
		if (url.pathname.endsWith('/claim/abc')) return new Response(ACCESS);
		if (url.pathname.endsWith('/accounts')) {
			if (auth !== `Basic ${Buffer.from('user123:secret456').toString('base64')}`) {
				return new Response('nope', { status: 403 });
			}
			const balancesOnly = url.searchParams.get('balances-only') === '1';
			return Response.json({
				errors: [],
				accounts: [
					{
						id: 'ACT-1',
						name: 'Everyday Checking',
						currency: 'USD',
						balance: state.balance,
						'balance-date': day('2026-01-20'),
						org: { name: 'Test Bank' },
						transactions: balancesOnly ? [] : state.txns
					}
				]
			});
		}
		return new Response('not found', { status: 404 });
	};
	return { impl, calls };
}

let db: Db;
let user: string;

beforeEach(async () => {
	const t = setupTest();
	db = t.db;
	user = await makeUser(db, t.auth);
});

describe('simplefin client', () => {
	it('claims a setup token', async () => {
		const { impl, calls } = fakeBridge({ txns: [], balance: '0' });
		expect(await claimSetupToken(setupToken, impl)).toBe(ACCESS);
		expect(calls[0].url).toBe('https://bridge.example/simplefin/claim/abc');
	});

	it('rejects junk tokens and non-https claim URLs', async () => {
		await expect(claimSetupToken('%%%')).rejects.toThrow();
		await expect(
			claimSetupToken(Buffer.from('http://insecure.example/claim').toString('base64'))
		).rejects.toThrow(/https/);
	});

	it('sends credentials as a header, not in the URL', async () => {
		const { impl, calls } = fakeBridge({
			txns: [{ id: 'T1', posted: day('2026-01-05'), amount: '-12.34', description: 'STORE' }],
			balance: '100.00'
		});
		const res = await fetchAccounts(ACCESS, { fetchImpl: impl, startDate: new Date(0) });
		expect(calls[0].url).not.toContain('secret456');
		expect(res.accounts[0]).toMatchObject({ externalId: 'ACT-1', balanceMinor: 10000 });
		expect(res.accounts[0].transactions[0]).toMatchObject({
			date: '2026-01-05',
			amountMinor: -1234,
			externalId: 'T1',
			pending: false
		});
	});

	it('formats dates in the configured US time zone', () => {
		// 03:00 UTC on Jan 6 is still Jan 5 in New York.
		expect(unixToDate(Date.parse('2026-01-06T03:00:00Z') / 1000, 'America/New_York')).toBe(
			'2026-01-05'
		);
	});
});

describe('sync', () => {
	it('connects, links a new account, imports and sets the opening balance', async () => {
		const bridge = fakeBridge({
			txns: [
				{ id: 'T1', posted: day('2026-01-05'), amount: '-20.00', description: 'GROCERY' },
				{ id: 'T2', posted: 0, amount: '-5.00', description: 'COFFEE', pending: true }
			],
			balance: '475.00'
		});
		const connId = await connectSimplefin(db, user, setupToken, bridge.impl);
		const stored = db.select().from(bankConnection).get()!;
		expect(stored.accessSecretEnc).not.toContain('secret456');

		const { accounts } = await listProviderAccounts(db, user, connId, bridge.impl);
		expect(accounts).toEqual([
			expect.objectContaining({
				externalId: 'ACT-1',
				name: 'Everyday Checking',
				linkedAccountId: null
			})
		]);

		await linkAccounts(
			db,
			user,
			connId,
			[{ externalId: 'ACT-1', target: 'new', name: 'Everyday Checking', balanceMinor: 47500 }],
			bridge.impl
		);
		const [acct] = listAccounts(db, user);
		expect(acct).toMatchObject({
			name: 'Everyday Checking',
			type: 'checking',
			connectionId: connId
		});
		// The bank's 475 excludes the pending $5, so the opening balance is 475 + 20 = 495 and the
		// app shows 470 including the pending coffee.
		const list = listTransactions(db, user);
		expect(list.find((t) => t.payeeName === 'Starting balance')?.amountMinor).toBe(49500);
		expect(getAccountWithBalance(db, user, acct.id)!.balanceMinor).toBe(47000);
		expect(list.find((t) => t.externalId === 'T2')?.pending).toBe(true);
	});

	it('replaces a pending transaction that posts under a new id', async () => {
		const state = {
			txns: [
				{ id: 'P1', posted: 0, amount: '-5.00', description: 'COFFEE', pending: true }
			] as Txn[],
			balance: '0'
		};
		const bridge = fakeBridge(state);
		const connId = await connectSimplefin(db, user, setupToken, bridge.impl);
		await linkAccounts(
			db,
			user,
			connId,
			[{ externalId: 'ACT-1', target: 'new', name: 'Chk' }],
			bridge.impl
		);

		state.txns = [{ id: 'T9', posted: day('2026-01-06'), amount: '-5.75', description: 'COFFEE' }];
		const res = await syncConnection(db, user, connId, { fetchImpl: bridge.impl });
		expect(res.accounts[0].result.added).toBe(1);
		const coffee = listTransactions(db, user).filter((t) => t.description === 'COFFEE');
		expect(coffee).toHaveLength(1);
		expect(coffee[0]).toMatchObject({ externalId: 'T9', amountMinor: -575, pending: false });
	});

	it('is idempotent and records errors on the connection', async () => {
		const bridge = fakeBridge({
			txns: [{ id: 'T1', posted: day('2026-01-05'), amount: '-20.00', description: 'GROCERY' }],
			balance: '0'
		});
		const connId = await connectSimplefin(db, user, setupToken, bridge.impl);
		await linkAccounts(
			db,
			user,
			connId,
			[{ externalId: 'ACT-1', target: 'new', name: 'Chk' }],
			bridge.impl
		);
		const again = await syncConnection(db, user, connId, { fetchImpl: bridge.impl });
		expect(again.accounts[0].result).toMatchObject({ added: 0, skipped: 1 });

		const broken: FetchLike = async () => new Response('', { status: 403 });
		const res = await syncConnection(db, user, connId, { fetchImpl: broken });
		expect(res.errors[0]).toMatch(/Reconnect/);
		expect(db.select().from(bankConnection).get()).toMatchObject({ status: 'error' });
	});

	it("cannot sync another user's connection", async () => {
		const bridge = fakeBridge({ txns: [], balance: '0' });
		const connId = await connectSimplefin(db, user, setupToken, bridge.impl);
		await expect(
			syncConnection(db, 'someone-else', connId, { fetchImpl: bridge.impl })
		).rejects.toThrow();
	});
});

// SimpleFIN Bridge client. Protocol: https://www.simplefin.org/protocol.html
//  1. The user creates a Setup Token at bridge.simplefin.org (base64 of a one-time claim URL).
//  2. POSTing to the claim URL returns an Access URL with embedded basic-auth credentials.
//  3. GET {access}/accounts?start-date=<unix>&pending=1 returns accounts with transactions.
import type { ParsedRow } from '$lib/import/csv';
import { parseMoney } from '$lib/money';

export type FetchLike = typeof fetch;

export class SimplefinError extends Error {}

export interface ProviderAccount {
	externalId: string;
	name: string;
	orgName: string;
	currency: string;
	balanceMinor: number;
	balanceDate: Date;
	transactions: ParsedRow[];
}

export interface ProviderResult {
	accounts: ProviderAccount[];
	errors: string[];
}

/** Exchange a setup token for a long-lived Access URL. Tokens work once. */
export async function claimSetupToken(
	token: string,
	fetchImpl: FetchLike = fetch
): Promise<string> {
	let claimUrl: URL;
	try {
		claimUrl = new URL(Buffer.from(token.trim(), 'base64').toString('utf8').trim());
	} catch {
		throw new SimplefinError("That doesn't look like a SimpleFIN setup token.");
	}
	if (claimUrl.protocol !== 'https:') throw new SimplefinError('Setup token must point to https.');
	const res = await fetchImpl(claimUrl, { method: 'POST', headers: { 'Content-Length': '0' } });
	if (res.status === 403) {
		throw new SimplefinError('This setup token was already used or has expired. Create a new one.');
	}
	if (!res.ok)
		throw new SimplefinError(`SimpleFIN returned ${res.status} while claiming the token.`);
	const access = (await res.text()).trim();
	let url: URL;
	try {
		url = new URL(access);
	} catch {
		throw new SimplefinError('SimpleFIN returned an invalid access URL.');
	}
	if (url.protocol !== 'https:' || !url.username) {
		throw new SimplefinError('SimpleFIN returned an unexpected access URL.');
	}
	return access;
}

/** Format a unix timestamp as a calendar date in the bank's (US) time zone. */
export function unixToDate(
	seconds: number,
	timeZone = process.env.APP_TIMEZONE ?? 'America/New_York'
) {
	return new Intl.DateTimeFormat('en-CA', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(new Date(seconds * 1000));
}

interface RawTxn {
	id: string;
	posted: number;
	amount: string;
	description?: string;
	payee?: string;
	memo?: string;
	pending?: boolean;
	transacted_at?: number;
}

interface RawAccount {
	id: string;
	name: string;
	currency?: string;
	balance: string;
	'balance-date': number;
	org?: { name?: string; domain?: string };
	transactions?: RawTxn[];
}

function toRow(t: RawTxn): ParsedRow | null {
	const amount = parseMoney(t.amount);
	// Pending transactions may have no posted date yet; show them as today.
	const when = t.posted || t.transacted_at || (t.pending ? Math.floor(Date.now() / 1000) : 0);
	if (amount === null || !when) return null;
	return {
		date: unixToDate(when),
		amountMinor: amount,
		description: (t.description || t.payee || '').replace(/\s+/g, ' ').trim(),
		memo: t.memo || null,
		externalId: t.id,
		pending: !!t.pending || !t.posted
	};
}

export async function fetchAccounts(
	accessUrl: string,
	opts: { startDate?: Date; balancesOnly?: boolean; fetchImpl?: FetchLike } = {}
): Promise<ProviderResult> {
	const url = new URL(accessUrl);
	const auth = Buffer.from(
		`${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`
	).toString('base64');
	url.username = '';
	url.password = '';
	url.pathname = `${url.pathname.replace(/\/$/, '')}/accounts`;
	if (opts.balancesOnly) url.searchParams.set('balances-only', '1');
	else url.searchParams.set('pending', '1');
	if (opts.startDate) {
		url.searchParams.set('start-date', String(Math.floor(opts.startDate.getTime() / 1000)));
	}

	const res = await (opts.fetchImpl ?? fetch)(url, {
		headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' }
	});
	if (res.status === 403 || res.status === 401) {
		throw new SimplefinError(
			'SimpleFIN rejected the connection. Reconnect with a new setup token.'
		);
	}
	if (res.status === 402) throw new SimplefinError('Your SimpleFIN subscription needs payment.');
	if (!res.ok) throw new SimplefinError(`SimpleFIN returned ${res.status}.`);

	const body = (await res.json()) as {
		errors?: string[];
		errlist?: { msg?: string; message?: string }[];
		accounts?: RawAccount[];
	};
	const errors = [
		...(body.errors ?? []),
		...(body.errlist ?? []).map((e) => e.msg ?? e.message ?? 'Unknown error')
	];
	const accounts = (body.accounts ?? []).map((a) => ({
		externalId: a.id,
		name: a.name,
		orgName: a.org?.name ?? a.org?.domain ?? '',
		currency: a.currency ?? 'USD',
		balanceMinor: parseMoney(a.balance) ?? 0,
		balanceDate: new Date((a['balance-date'] ?? 0) * 1000),
		transactions: (a.transactions ?? []).map(toRow).filter((r): r is ParsedRow => r !== null)
	}));
	return { accounts, errors };
}

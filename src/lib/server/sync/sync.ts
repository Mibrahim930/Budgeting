import { and, asc, eq, gte, inArray, isNull, min, notInArray, sum } from 'drizzle-orm';
import { decryptSecret, encryptSecret } from '../crypto';
import type { Db } from '../db/client';
import { balanceSnapshot, bankConnection, finAccount, txn, type AccountType } from '../db/schema';
import { newId } from '../id';
import { importTransactions, type ImportResult } from '../import/importer';
import { createAccount, getAccountWithBalance } from '../repo/accounts';
import { listCategories } from '../repo/categories';
import { createTransaction, ValidationError } from '../repo/transactions';
import {
	claimSetupToken,
	fetchAccounts,
	SimplefinError,
	type FetchLike,
	type ProviderAccount
} from './simplefin';

const INITIAL_DAYS = 90;
/** Re-fetch this many days before the last sync so late-posting transactions are caught. */
const OVERLAP_DAYS = 14;

export function listConnections(db: Db, userId: string) {
	return db
		.select({
			id: bankConnection.id,
			label: bankConnection.label,
			provider: bankConnection.provider,
			status: bankConnection.status,
			error: bankConnection.error,
			lastSyncedAt: bankConnection.lastSyncedAt
		})
		.from(bankConnection)
		.where(eq(bankConnection.userId, userId))
		.orderBy(asc(bankConnection.createdAt))
		.all();
}

function getConnection(db: Db, userId: string, id: string) {
	return db
		.select()
		.from(bankConnection)
		.where(and(eq(bankConnection.id, id), eq(bankConnection.userId, userId)))
		.get();
}

export async function connectSimplefin(
	db: Db,
	userId: string,
	setupToken: string,
	fetchImpl?: FetchLike
) {
	const accessUrl = await claimSetupToken(setupToken, fetchImpl);
	const id = newId();
	db.insert(bankConnection)
		.values({
			id,
			userId,
			provider: 'simplefin',
			label: 'SimpleFIN',
			accessSecretEnc: encryptSecret(accessUrl)
		})
		.run();
	return id;
}

export function removeConnection(db: Db, userId: string, id: string) {
	// Linked accounts keep their history and become manual accounts.
	db.transaction(() => {
		db.update(finAccount)
			.set({ connectionId: null, externalId: null })
			.where(and(eq(finAccount.connectionId, id), eq(finAccount.userId, userId)))
			.run();
		db.delete(bankConnection)
			.where(and(eq(bankConnection.id, id), eq(bankConnection.userId, userId)))
			.run();
	});
}

/** The bank's accounts (balances only) and which app account each is linked to. */
export async function listProviderAccounts(
	db: Db,
	userId: string,
	connectionId: string,
	fetchImpl?: FetchLike
) {
	const conn = getConnection(db, userId, connectionId);
	if (!conn) throw new ValidationError('Connection not found');
	const { accounts, errors } = await fetchAccounts(decryptSecret(conn.accessSecretEnc), {
		balancesOnly: true,
		fetchImpl
	});
	const linked = db
		.select({ id: finAccount.id, externalId: finAccount.externalId })
		.from(finAccount)
		.where(and(eq(finAccount.userId, userId), eq(finAccount.connectionId, connectionId)))
		.all();
	return {
		errors,
		accounts: accounts.map((a) => ({
			externalId: a.externalId,
			name: a.name,
			orgName: a.orgName,
			balanceMinor: a.balanceMinor,
			linkedAccountId: linked.find((l) => l.externalId === a.externalId)?.id ?? null
		}))
	};
}

export function guessAccountType(name: string, balanceMinor: number): AccountType {
	if (/credit|card|visa|mastercard|amex|discover/i.test(name)) return 'credit';
	if (/saving/i.test(name)) return 'savings';
	if (/loan|mortgage/i.test(name)) return 'loan';
	if (/brokerage|401k|ira|invest/i.test(name)) return 'investment';
	return balanceMinor < 0 ? 'credit' : 'checking';
}

export type LinkChoice = {
	externalId: string;
	target: 'new' | 'ignore' | string;
	name?: string;
	balanceMinor?: number;
};

/**
 * Link bank accounts to app accounts ('new' creates one), then sync. Accounts that had no
 * transactions get an opening balance so the app balance matches the bank.
 */
export async function linkAccounts(
	db: Db,
	userId: string,
	connectionId: string,
	choices: LinkChoice[],
	fetchImpl?: FetchLike
) {
	const conn = getConnection(db, userId, connectionId);
	if (!conn) throw new ValidationError('Connection not found');
	const fresh: string[] = [];
	db.transaction(() => {
		for (const c of choices) {
			// Unlink whatever this bank account was linked to before.
			db.update(finAccount)
				.set({ connectionId: null, externalId: null })
				.where(
					and(
						eq(finAccount.userId, userId),
						eq(finAccount.connectionId, connectionId),
						eq(finAccount.externalId, c.externalId)
					)
				)
				.run();
			if (c.target === 'ignore') continue;
			let accountId = c.target;
			if (c.target === 'new') {
				const name = c.name?.trim() || 'Bank account';
				accountId = createAccount(
					db,
					userId,
					{ name, type: guessAccountType(name, c.balanceMinor ?? 0) },
					{ connectionId, externalId: c.externalId }
				);
			} else {
				const acct = getAccountWithBalance(db, userId, accountId);
				if (!acct) throw new ValidationError('Unknown account');
				db.update(finAccount)
					.set({ connectionId, externalId: c.externalId })
					.where(eq(finAccount.id, accountId))
					.run();
			}
			const hasTxns = db
				.select({ id: txn.id })
				.from(txn)
				.where(eq(txn.accountId, accountId))
				.limit(1)
				.get();
			if (!hasTxns) fresh.push(accountId);
		}
	});
	const result = await syncConnection(db, userId, connectionId, { fetchImpl });
	for (const accountId of fresh) addOpeningBalance(db, userId, accountId);
	return result;
}

function addOpeningBalance(db: Db, userId: string, accountId: string) {
	const acct = getAccountWithBalance(db, userId, accountId);
	const snap = db
		.select()
		.from(balanceSnapshot)
		.where(eq(balanceSnapshot.accountId, accountId))
		.orderBy(asc(balanceSnapshot.asOf))
		.all()
		.at(-1);
	if (!acct || !snap) return;
	// The bank's balance doesn't include pending transactions, so compare against posted ones only.
	const pending = db
		.select({ total: sum(txn.amountMinor) })
		.from(txn)
		.where(and(eq(txn.accountId, accountId), eq(txn.pending, true), isNull(txn.parentId)))
		.get()?.total;
	const diff = snap.balanceMinor - (acct.balanceMinor - Number(pending ?? 0));
	if (diff === 0) return;
	const first = db
		.select({ d: min(txn.date) })
		.from(txn)
		.where(eq(txn.accountId, accountId))
		.get()?.d;
	const date = first ?? new Date().toISOString().slice(0, 10);
	createTransaction(db, userId, {
		accountId,
		date,
		amountMinor: diff,
		payeeName: 'Starting balance',
		categoryId: acct.onBudget
			? (listCategories(db, userId).find((c) => c.isIncome)?.id ?? null)
			: null,
		cleared: true
	});
}

export interface SyncResult {
	accounts: { accountId: string; name: string; result: ImportResult }[];
	errors: string[];
}

export async function syncConnection(
	db: Db,
	userId: string,
	connectionId: string,
	opts: { fetchImpl?: FetchLike; now?: Date } = {}
): Promise<SyncResult> {
	const conn = getConnection(db, userId, connectionId);
	if (!conn) throw new ValidationError('Connection not found');
	const now = opts.now ?? new Date();
	const start = conn.lastSyncedAt
		? new Date(conn.lastSyncedAt.getTime() - OVERLAP_DAYS * 86_400_000)
		: new Date(now.getTime() - INITIAL_DAYS * 86_400_000);

	let provider: { accounts: ProviderAccount[]; errors: string[] };
	try {
		provider = await fetchAccounts(decryptSecret(conn.accessSecretEnc), {
			startDate: start,
			fetchImpl: opts.fetchImpl
		});
	} catch (e) {
		const message = e instanceof SimplefinError ? e.message : 'Could not reach SimpleFIN.';
		db.update(bankConnection)
			.set({ status: 'error', error: message })
			.where(eq(bankConnection.id, connectionId))
			.run();
		return { accounts: [], errors: [message] };
	}

	const linked = db
		.select()
		.from(finAccount)
		.where(
			and(
				eq(finAccount.userId, userId),
				eq(finAccount.connectionId, connectionId),
				isNull(finAccount.archivedAt)
			)
		)
		.all();
	const out: SyncResult = { accounts: [], errors: provider.errors };
	const startDate = start.toISOString().slice(0, 10);

	for (const acct of linked) {
		const pa = provider.accounts.find((a) => a.externalId === acct.externalId);
		if (!pa) continue;
		const result = importTransactions(db, userId, acct.id, pa.transactions, {
			source: 'simplefin'
		});
		// Pending transactions that vanished were either cancelled or posted under a new id.
		const seen = pa.transactions.map((t) => t.externalId!).filter(Boolean);
		db.delete(txn)
			.where(
				and(
					eq(txn.accountId, acct.id),
					eq(txn.source, 'simplefin'),
					eq(txn.pending, true),
					gte(txn.date, startDate),
					seen.length ? notInArray(txn.externalId, seen) : undefined
				)
			)
			.run();
		db.insert(balanceSnapshot)
			.values({
				id: newId(),
				userId,
				accountId: acct.id,
				asOf: pa.balanceDate.getTime() ? pa.balanceDate : now,
				balanceMinor: pa.balanceMinor,
				source: 'provider'
			})
			.run();
		out.accounts.push({ accountId: acct.id, name: acct.name, result });
	}

	db.update(bankConnection)
		.set({
			lastSyncedAt: now,
			status: provider.errors.length ? 'error' : 'ok',
			error: provider.errors.length ? provider.errors.join(' ') : null
		})
		.where(eq(bankConnection.id, connectionId))
		.run();
	return out;
}

/** Sync every connection of every user (used by the background scheduler). */
export async function syncAll(db: Db) {
	const conns = db
		.select({ id: bankConnection.id, userId: bankConnection.userId })
		.from(bankConnection)
		.all();
	for (const c of conns) {
		try {
			await syncConnection(db, c.userId, c.id);
		} catch (e) {
			console.error(`Sync failed for connection ${c.id}:`, e instanceof Error ? e.message : e);
		}
	}
	return conns.length;
}

/** Latest provider balance per account (for showing drift against the bank). */
export function latestProviderBalances(db: Db, userId: string, accountIds: string[]) {
	if (!accountIds.length) return new Map<string, { balanceMinor: number; asOf: Date }>();
	const rows = db
		.select()
		.from(balanceSnapshot)
		.where(
			and(
				eq(balanceSnapshot.userId, userId),
				inArray(balanceSnapshot.accountId, accountIds),
				eq(balanceSnapshot.source, 'provider')
			)
		)
		.orderBy(asc(balanceSnapshot.asOf))
		.all();
	const map = new Map<string, { balanceMinor: number; asOf: Date }>();
	for (const r of rows) map.set(r.accountId, { balanceMinor: r.balanceMinor, asOf: r.asOf });
	return map;
}

import type { ParsedRow } from '$lib/import/csv';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import type { Db } from '../db/client';
import { finAccount, importBatch, txn } from '../db/schema';
import { newId } from '../id';
import { getAccount } from '../repo/accounts';
import { createTransaction, normalizePayeeName, ValidationError } from '../repo/transactions';
import { createCategorizer } from '../rules/apply';
import { cleanPayee } from './payee';

export type ImportSource = 'csv' | 'ofx' | 'simplefin';

export interface ImportResult {
	batchId: string;
	added: number;
	updated: number;
	skipped: number;
}

const FUZZY_DAYS = 3;

function shiftDate(date: string, days: number): string {
	const d = new Date(`${date}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}

const dayDiff = (a: string, b: string) =>
	Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;

/**
 * Stable fingerprint for rows without a reliable bank id. The occurrence index tells apart
 * genuinely identical transactions in one file (two $4.50 coffees on the same day).
 */
export function importHash(accountId: string, row: ParsedRow, occurrence: number): string {
	const key = [
		accountId,
		row.date,
		row.amountMinor,
		normalizePayeeName(row.description),
		occurrence
	];
	return createHash('sha256').update(key.join('|')).digest('hex').slice(0, 32);
}

/**
 * Import bank rows into an account, skipping ones already present.
 *  1. Same bank transaction id (FITID / provider id) -> skip, or update a pending one.
 *  2. Same import fingerprint -> skip (re-importing the same or an overlapping file).
 *  3. A manually entered transaction with the same amount within ±3 days -> link it (keeps the
 *     user's payee and category, marks it cleared).
 *  4. Otherwise insert, with a cleaned-up payee and a category from rules.
 */
export function importTransactions(
	db: Db,
	userId: string,
	accountId: string,
	rows: ParsedRow[],
	opts: { source: ImportSource; fileName?: string | null }
): ImportResult {
	if (!getAccount(db, userId, accountId)) throw new ValidationError('Unknown account');
	const batchId = newId();
	const result: ImportResult = { batchId, added: 0, updated: 0, skipped: 0 };
	if (!rows.length) return result;

	const dates = rows.map((r) => r.date).sort();
	const from = shiftDate(dates[0], -FUZZY_DAYS - 1);
	const to = shiftDate(dates[dates.length - 1], FUZZY_DAYS + 1);

	db.transaction(() => {
		db.insert(importBatch)
			.values({
				id: batchId,
				userId,
				accountId,
				source: opts.source,
				fileName: opts.fileName ?? null
			})
			.run();

		const existing = db
			.select()
			.from(txn)
			.where(and(eq(txn.userId, userId), eq(txn.accountId, accountId), isNull(txn.parentId)))
			.all();
		const byExternal = new Map(existing.filter((t) => t.externalId).map((t) => [t.externalId!, t]));
		const byHash = new Set(existing.map((t) => t.importHash).filter(Boolean));
		const manual = existing.filter(
			(t) => !t.externalId && !t.importHash && t.date >= from && t.date <= to && !t.transferId
		);
		const matched = new Set<string>();
		const occurrences = new Map<string, number>();
		const categorize = createCategorizer(db, userId);

		for (const row of rows) {
			const occKey = `${row.date}|${row.amountMinor}|${normalizePayeeName(row.description)}`;
			const occ = occurrences.get(occKey) ?? 0;
			occurrences.set(occKey, occ + 1);
			const hash = importHash(accountId, row, occ);

			const prior = row.externalId ? byExternal.get(row.externalId) : undefined;
			if (prior) {
				const changed =
					prior.pending &&
					(prior.amountMinor !== row.amountMinor ||
						prior.date !== row.date ||
						prior.pending !== !!row.pending);
				if (changed) {
					db.update(txn)
						.set({
							amountMinor: row.amountMinor,
							date: row.date,
							pending: !!row.pending,
							cleared: !row.pending
						})
						.where(eq(txn.id, prior.id))
						.run();
					result.updated++;
				} else result.skipped++;
				continue;
			}
			if (byHash.has(hash)) {
				result.skipped++;
				continue;
			}

			const candidate = manual
				.filter(
					(t) =>
						!matched.has(t.id) &&
						t.amountMinor === row.amountMinor &&
						dayDiff(t.date, row.date) <= FUZZY_DAYS
				)
				.sort((a, b) => dayDiff(a.date, row.date) - dayDiff(b.date, row.date))[0];
			if (candidate) {
				matched.add(candidate.id);
				db.update(txn)
					.set({
						externalId: row.externalId ?? null,
						importHash: hash,
						description: candidate.description ?? row.description,
						cleared: !row.pending,
						pending: !!row.pending
					})
					.where(eq(txn.id, candidate.id))
					.run();
				byHash.add(hash);
				result.updated++;
				continue;
			}

			const { categoryId, payeeName } = categorize({
				description: row.description,
				payeeName: cleanPayee(row.description) || null
			});
			const id = createTransaction(db, userId, {
				accountId,
				date: row.date,
				amountMinor: row.amountMinor,
				payeeName,
				categoryId,
				memo: row.memo ?? null,
				description: row.description,
				cleared: !row.pending,
				pending: !!row.pending,
				source: opts.source,
				externalId: row.externalId ?? null,
				importHash: hash,
				importBatchId: batchId
			});
			if (row.externalId) {
				byExternal.set(row.externalId, {
					id,
					pending: !!row.pending,
					amountMinor: row.amountMinor,
					date: row.date
				} as (typeof existing)[number]);
			}
			byHash.add(hash);
			result.added++;
		}

		db.update(importBatch)
			.set({ added: result.added, updated: result.updated, skipped: result.skipped })
			.where(eq(importBatch.id, batchId))
			.run();
	});
	return result;
}

/** Remove the transactions an import added. Linked manual transactions are left alone. */
export function undoImport(db: Db, userId: string, batchId: string) {
	db.transaction(() => {
		db.delete(txn)
			.where(and(eq(txn.userId, userId), eq(txn.importBatchId, batchId)))
			.run();
		db.update(importBatch)
			.set({ undoneAt: new Date() })
			.where(and(eq(importBatch.id, batchId), eq(importBatch.userId, userId)))
			.run();
	});
}

export function listImportBatches(db: Db, userId: string, limit = 20) {
	return db
		.select({ batch: importBatch, accountName: finAccount.name })
		.from(importBatch)
		.leftJoin(finAccount, eq(finAccount.id, importBatch.accountId))
		.where(eq(importBatch.userId, userId))
		.orderBy(desc(importBatch.createdAt))
		.limit(limit)
		.all()
		.map((r) => ({ ...r.batch, accountName: r.accountName }));
}

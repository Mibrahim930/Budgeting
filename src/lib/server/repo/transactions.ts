import { and, asc, desc, eq, gte, inArray, isNull, lt, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import type { Db } from '../db/client';
import { category, finAccount, payee, txn, TXN_SOURCES } from '../db/schema';
import { newId } from '../id';
import { getAccount } from './accounts';
import { getCategory } from './categories';

export class ValidationError extends Error {}

export type TxnRow = typeof txn.$inferSelect;
export type TxnSource = (typeof TXN_SOURCES)[number];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function normalizePayeeName(name: string): string {
	return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Find or create a payee by (case/whitespace-insensitive) name. */
export function getOrCreatePayee(db: Db, userId: string, name: string | null | undefined) {
	const display = name?.trim().replace(/\s+/g, ' ');
	if (!display) return null;
	const normalizedName = normalizePayeeName(display);
	const existing = db
		.select({ id: payee.id })
		.from(payee)
		.where(and(eq(payee.userId, userId), eq(payee.normalizedName, normalizedName)))
		.get();
	if (existing) return existing.id;
	const id = newId();
	db.insert(payee).values({ id, userId, name: display, normalizedName }).run();
	return id;
}

export function listPayees(db: Db, userId: string) {
	return db
		.select({ id: payee.id, name: payee.name })
		.from(payee)
		.where(eq(payee.userId, userId))
		.orderBy(asc(payee.name))
		.all();
}

export interface SplitInput {
	amountMinor: number;
	categoryId: string | null;
	memo?: string | null;
}

export interface TxnInput {
	accountId: string;
	date: string;
	amountMinor: number;
	payeeName?: string | null;
	categoryId?: string | null;
	memo?: string | null;
	cleared?: boolean;
	pending?: boolean;
	description?: string | null;
	/** When set, the transaction is split across these categories (must sum to amountMinor). */
	splits?: SplitInput[];
	/** When set, creates a transfer to/from this account instead of a categorized transaction. */
	transferAccountId?: string | null;
	source?: TxnSource;
	externalId?: string | null;
	importHash?: string | null;
	importBatchId?: string | null;
}

function assertCategory(db: Db, userId: string, categoryId: string | null | undefined) {
	if (categoryId && !getCategory(db, userId, categoryId)) {
		throw new ValidationError('Unknown category');
	}
}

function validate(db: Db, userId: string, input: TxnInput) {
	if (!DATE_RE.test(input.date)) throw new ValidationError('Date must be YYYY-MM-DD');
	if (!Number.isSafeInteger(input.amountMinor)) throw new ValidationError('Invalid amount');
	if (!getAccount(db, userId, input.accountId)) throw new ValidationError('Unknown account');
	assertCategory(db, userId, input.categoryId);
	if (input.splits) {
		if (input.splits.length < 2) throw new ValidationError('A split needs at least two parts');
		if (input.transferAccountId) throw new ValidationError('Transfers cannot be split');
		for (const s of input.splits) {
			if (!Number.isSafeInteger(s.amountMinor)) throw new ValidationError('Invalid split amount');
			assertCategory(db, userId, s.categoryId);
		}
		const total = input.splits.reduce((a, s) => a + s.amountMinor, 0);
		if (total !== input.amountMinor) {
			throw new ValidationError('Split amounts must add up to the transaction amount');
		}
	}
	if (input.transferAccountId) {
		if (input.transferAccountId === input.accountId) {
			throw new ValidationError('Cannot transfer to the same account');
		}
		if (!getAccount(db, userId, input.transferAccountId)) {
			throw new ValidationError('Unknown transfer account');
		}
	}
}

/**
 * Transfers between two on-budget accounts don't touch the budget, so their legs get no category.
 * When money moves between an on-budget and an off-budget account, the on-budget leg may keep a
 * category (e.g. paying a loan from checking).
 */
function transferLegCategory(
	db: Db,
	userId: string,
	accountId: string,
	otherAccountId: string,
	categoryId: string | null | undefined
) {
	const a = getAccount(db, userId, accountId)!;
	const b = getAccount(db, userId, otherAccountId)!;
	return a.onBudget && !b.onBudget ? (categoryId ?? null) : null;
}

/** Create a transaction (plain, split or transfer). Returns the id of the main row. */
export function createTransaction(db: Db, userId: string, input: TxnInput): string {
	validate(db, userId, input);
	return db.transaction((tx) => {
		const t = tx as unknown as Db;
		const id = newId();
		const base = {
			userId,
			date: input.date,
			payeeId: getOrCreatePayee(t, userId, input.payeeName),
			memo: input.memo ?? null,
			cleared: input.cleared ?? false,
			pending: input.pending ?? false,
			description: input.description ?? null,
			source: input.source ?? 'manual',
			externalId: input.externalId ?? null,
			importHash: input.importHash ?? null,
			importBatchId: input.importBatchId ?? null
		};

		if (input.transferAccountId) {
			const transferId = newId();
			t.insert(txn)
				.values({
					...base,
					id,
					accountId: input.accountId,
					amountMinor: input.amountMinor,
					transferId,
					categoryId: transferLegCategory(
						t,
						userId,
						input.accountId,
						input.transferAccountId,
						input.categoryId
					)
				})
				.run();
			t.insert(txn)
				.values({
					...base,
					id: newId(),
					accountId: input.transferAccountId,
					amountMinor: -input.amountMinor,
					transferId,
					categoryId: transferLegCategory(
						t,
						userId,
						input.transferAccountId,
						input.accountId,
						input.categoryId
					),
					// The other side hasn't been seen on a statement yet.
					cleared: false,
					source: 'manual',
					externalId: null,
					importHash: null,
					importBatchId: null
				})
				.run();
			return id;
		}

		if (input.splits) {
			t.insert(txn)
				.values({
					...base,
					id,
					accountId: input.accountId,
					amountMinor: input.amountMinor,
					isParent: true,
					categoryId: null
				})
				.run();
			insertSplitChildren(t, userId, id, input.accountId, input.date, input.splits);
			return id;
		}

		t.insert(txn)
			.values({
				...base,
				id,
				accountId: input.accountId,
				amountMinor: input.amountMinor,
				categoryId: input.categoryId ?? null
			})
			.run();
		return id;
	});
}

function insertSplitChildren(
	db: Db,
	userId: string,
	parentId: string,
	accountId: string,
	date: string,
	splits: SplitInput[]
) {
	for (const s of splits) {
		db.insert(txn)
			.values({
				id: newId(),
				userId,
				accountId,
				date,
				amountMinor: s.amountMinor,
				categoryId: s.categoryId,
				memo: s.memo ?? null,
				parentId
			})
			.run();
	}
}

export function getTransaction(db: Db, userId: string, id: string): TxnRow | undefined {
	return db
		.select()
		.from(txn)
		.where(and(eq(txn.id, id), eq(txn.userId, userId)))
		.get();
}

export function getSplits(db: Db, userId: string, parentId: string): TxnRow[] {
	return db
		.select()
		.from(txn)
		.where(and(eq(txn.parentId, parentId), eq(txn.userId, userId)))
		.orderBy(asc(txn.createdAt))
		.all();
}

/** The other leg of a transfer, if any. */
export function getTransferPartner(db: Db, userId: string, row: TxnRow): TxnRow | undefined {
	if (!row.transferId) return undefined;
	return db
		.select()
		.from(txn)
		.where(
			and(eq(txn.transferId, row.transferId), eq(txn.userId, userId), sql`${txn.id} != ${row.id}`)
		)
		.get();
}

/**
 * Update a transaction. Editing works on the whole logical transaction: a transfer is rewritten
 * as a pair, a split's children are replaced.
 */
export function updateTransaction(db: Db, userId: string, id: string, input: TxnInput) {
	const existing = getTransaction(db, userId, id);
	if (!existing || existing.parentId) throw new ValidationError('Transaction not found');
	validate(db, userId, input);
	db.transaction((tx) => {
		const t = tx as unknown as Db;
		const partner = getTransferPartner(t, userId, existing);
		const wasTransfer = !!partner;
		const isTransfer = !!input.transferAccountId;
		const common = {
			date: input.date,
			amountMinor: input.amountMinor,
			payeeId: getOrCreatePayee(t, userId, input.payeeName),
			memo: input.memo ?? null,
			cleared: input.cleared ?? existing.cleared
		};

		// Clear old structure that may not apply any more.
		t.delete(txn)
			.where(and(eq(txn.parentId, id), eq(txn.userId, userId)))
			.run();
		if (wasTransfer && (!isTransfer || partner.accountId !== input.transferAccountId)) {
			t.delete(txn).where(eq(txn.id, partner.id)).run();
		}

		if (isTransfer) {
			const transferId = existing.transferId ?? newId();
			t.update(txn)
				.set({
					...common,
					accountId: input.accountId,
					transferId,
					isParent: false,
					categoryId: transferLegCategory(
						t,
						userId,
						input.accountId,
						input.transferAccountId!,
						input.categoryId
					)
				})
				.where(eq(txn.id, id))
				.run();
			const otherLeg = {
				date: input.date,
				amountMinor: -input.amountMinor,
				payeeId: common.payeeId,
				memo: common.memo,
				categoryId: transferLegCategory(
					t,
					userId,
					input.transferAccountId!,
					input.accountId,
					input.categoryId
				)
			};
			if (wasTransfer && partner.accountId === input.transferAccountId) {
				t.update(txn).set(otherLeg).where(eq(txn.id, partner.id)).run();
			} else {
				t.insert(txn)
					.values({
						...otherLeg,
						id: newId(),
						userId,
						accountId: input.transferAccountId!,
						transferId
					})
					.run();
			}
			return;
		}

		t.update(txn)
			.set({
				...common,
				accountId: input.accountId,
				transferId: null,
				isParent: !!input.splits,
				categoryId: input.splits ? null : (input.categoryId ?? null)
			})
			.where(eq(txn.id, id))
			.run();
		if (input.splits) {
			insertSplitChildren(t, userId, id, input.accountId, input.date, input.splits);
		}
	});
}

/** Delete a transaction with its split children and transfer partner. */
export function deleteTransaction(db: Db, userId: string, id: string) {
	const existing = getTransaction(db, userId, id);
	if (!existing) return;
	const rootId = existing.parentId ?? existing.id;
	const root = existing.parentId ? getTransaction(db, userId, rootId)! : existing;
	db.transaction((tx) => {
		tx.delete(txn)
			.where(and(eq(txn.parentId, rootId), eq(txn.userId, userId)))
			.run();
		if (root.transferId) {
			tx.delete(txn)
				.where(and(eq(txn.transferId, root.transferId), eq(txn.userId, userId)))
				.run();
		}
		tx.delete(txn)
			.where(and(eq(txn.id, rootId), eq(txn.userId, userId)))
			.run();
	});
}

/** Set the category on a single row (not a split parent). Used by quick-categorize and rules. */
export function setTransactionCategory(
	db: Db,
	userId: string,
	id: string,
	categoryId: string | null
) {
	assertCategory(db, userId, categoryId);
	db.update(txn)
		.set({ categoryId })
		.where(and(eq(txn.id, id), eq(txn.userId, userId), eq(txn.isParent, false)))
		.run();
}

export function setCleared(db: Db, userId: string, id: string, cleared: boolean) {
	db.update(txn)
		.set({ cleared })
		.where(and(eq(txn.id, id), eq(txn.userId, userId), eq(txn.reconciled, false)))
		.run();
}

export interface TxnFilter {
	accountId?: string;
	categoryId?: string;
	/** 'YYYY-MM' */
	month?: string;
	search?: string;
	uncategorized?: boolean;
	limit?: number;
	offset?: number;
}

export function monthRange(month: string): [string, string] {
	const [y, m] = month.split('-').map(Number);
	const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
	return [`${month}-01`, `${next}-01`];
}

export type TxnListItem = TxnRow & {
	payeeName: string | null;
	categoryName: string | null;
	accountName: string;
	transferAccountId: string | null;
	transferAccountName: string | null;
	splits: (TxnRow & { categoryName: string | null })[];
};

/** List top-level transactions (split parents include their children). */
export function listTransactions(db: Db, userId: string, f: TxnFilter = {}): TxnListItem[] {
	const conds: SQL[] = [eq(txn.userId, userId), isNull(txn.parentId)];
	if (f.accountId) conds.push(eq(txn.accountId, f.accountId));
	if (f.month) {
		const [from, to] = monthRange(f.month);
		conds.push(gte(txn.date, from), lt(txn.date, to));
	}
	if (f.categoryId) {
		const parentIds = db
			.select({ id: txn.parentId })
			.from(txn)
			.where(and(eq(txn.userId, userId), eq(txn.categoryId, f.categoryId)));
		conds.push(or(eq(txn.categoryId, f.categoryId), inArray(txn.id, parentIds))!);
	}
	if (f.uncategorized) {
		conds.push(isNull(txn.categoryId), eq(txn.isParent, false), isNull(txn.transferId));
	}
	if (f.search) {
		const q = `%${f.search.replace(/[%_]/g, (c) => `\\${c}`)}%`;
		conds.push(
			or(
				sql`${payee.name} like ${q} escape '\\'`,
				sql`${txn.description} like ${q} escape '\\'`,
				sql`${txn.memo} like ${q} escape '\\'`
			)!
		);
	}

	const other = alias(txn, 'other');
	const otherAccount = alias(finAccount, 'other_account');
	const rows = db
		.select({
			t: txn,
			payeeName: payee.name,
			categoryName: category.name,
			accountName: finAccount.name,
			transferAccountId: other.accountId,
			transferAccountName: otherAccount.name
		})
		.from(txn)
		.innerJoin(finAccount, eq(finAccount.id, txn.accountId))
		.leftJoin(payee, eq(payee.id, txn.payeeId))
		.leftJoin(category, eq(category.id, txn.categoryId))
		.leftJoin(other, and(eq(other.transferId, txn.transferId), sql`${other.id} != ${txn.id}`))
		.leftJoin(otherAccount, eq(otherAccount.id, other.accountId))
		.where(and(...conds))
		.orderBy(desc(txn.date), desc(txn.createdAt))
		.limit(f.limit ?? 500)
		.offset(f.offset ?? 0)
		.all();

	const parentIds = rows.filter((r) => r.t.isParent).map((r) => r.t.id);
	const children = parentIds.length
		? db
				.select({ t: txn, categoryName: category.name })
				.from(txn)
				.leftJoin(category, eq(category.id, txn.categoryId))
				.where(and(eq(txn.userId, userId), inArray(txn.parentId, parentIds)))
				.orderBy(asc(txn.createdAt))
				.all()
		: [];

	return rows.map((r) => ({
		...r.t,
		payeeName: r.payeeName,
		categoryName: r.categoryName,
		accountName: r.accountName,
		transferAccountId: r.transferAccountId,
		transferAccountName: r.transferAccountName,
		splits: children
			.filter((c) => c.t.parentId === r.t.id)
			.map((c) => ({ ...c.t, categoryName: c.categoryName }))
	}));
}

import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { finAccount, txn, type AccountType } from '../db/schema';
import { newId } from '../id';

export type AccountRow = typeof finAccount.$inferSelect;
export type AccountWithBalance = AccountRow & { balanceMinor: number; clearedMinor: number };

/** Default for new accounts: credit cards, loans etc. still count in the budget unless chosen otherwise. */
export const OFF_BUDGET_BY_DEFAULT: AccountType[] = ['investment', 'loan'];

export function listAccounts(
	db: Db,
	userId: string,
	{ includeArchived = false } = {}
): AccountWithBalance[] {
	// Split children are excluded: the parent row carries the full amount.
	return db
		.select({
			account: finAccount,
			balanceMinor: sql<number>`coalesce(sum(${txn.amountMinor}), 0)`,
			clearedMinor: sql<number>`coalesce(sum(case when ${txn.cleared} then ${txn.amountMinor} else 0 end), 0)`
		})
		.from(finAccount)
		.leftJoin(txn, and(eq(txn.accountId, finAccount.id), isNull(txn.parentId)))
		.where(
			includeArchived
				? eq(finAccount.userId, userId)
				: and(eq(finAccount.userId, userId), isNull(finAccount.archivedAt))
		)
		.groupBy(finAccount.id)
		.orderBy(asc(finAccount.sort), asc(finAccount.name))
		.all()
		.map((r) => ({ ...r.account, balanceMinor: r.balanceMinor, clearedMinor: r.clearedMinor }));
}

export function getAccount(db: Db, userId: string, id: string): AccountRow | undefined {
	return db
		.select()
		.from(finAccount)
		.where(and(eq(finAccount.id, id), eq(finAccount.userId, userId)))
		.get();
}

export function getAccountWithBalance(db: Db, userId: string, id: string) {
	return listAccounts(db, userId, { includeArchived: true }).find((a) => a.id === id);
}

export interface AccountInput {
	name: string;
	type: AccountType;
	onBudget?: boolean;
}

export function createAccount(
	db: Db,
	userId: string,
	input: AccountInput,
	extra: Partial<AccountRow> = {}
) {
	const id = newId();
	db.insert(finAccount)
		.values({
			id,
			userId,
			name: input.name,
			type: input.type,
			onBudget: input.onBudget ?? !OFF_BUDGET_BY_DEFAULT.includes(input.type),
			...extra
		})
		.run();
	return id;
}

export function updateAccount(db: Db, userId: string, id: string, patch: Partial<AccountInput>) {
	db.update(finAccount)
		.set(patch)
		.where(and(eq(finAccount.id, id), eq(finAccount.userId, userId)))
		.run();
}

export function setAccountArchived(db: Db, userId: string, id: string, archived: boolean) {
	db.update(finAccount)
		.set({ archivedAt: archived ? new Date() : null })
		.where(and(eq(finAccount.id, id), eq(finAccount.userId, userId)))
		.run();
}

export function setCsvMapping(db: Db, userId: string, id: string, mapping: unknown) {
	db.update(finAccount)
		.set({ csvMapping: JSON.stringify(mapping) })
		.where(and(eq(finAccount.id, id), eq(finAccount.userId, userId)))
		.run();
}

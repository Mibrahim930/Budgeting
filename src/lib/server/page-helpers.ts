import { fail, type RequestEvent } from '@sveltejs/kit';
import { getDb } from './db/client';
import { parseTxnForm } from './forms';
import { listAccounts } from './repo/accounts';
import { listCategoryTree } from './repo/categories';
import {
	createTransaction,
	deleteTransaction,
	listPayees,
	setCleared,
	setTransactionCategory,
	ValidationError
} from './repo/transactions';

export function requireUserId(locals: App.Locals): string {
	if (!locals.user) throw new Error('Not signed in');
	return locals.user.id;
}

/** Options for transaction forms: open accounts, category tree, known payees. */
export function loadFormOptions(userId: string) {
	const db = getDb();
	return {
		accountOptions: listAccounts(db, userId).map((a) => ({
			id: a.id,
			name: a.name,
			onBudget: a.onBudget
		})),
		groups: listCategoryTree(db, userId).map((g) => ({
			id: g.id,
			name: g.name,
			categories: g.categories.map((c) => ({ id: c.id, name: c.name }))
		})),
		payees: listPayees(db, userId).map((p) => p.name)
	};
}

/** Wrap a form action so validation errors come back as `{ error }` with status 400. */
export async function handleValidation<T>(fn: () => T | Promise<T>) {
	try {
		return await fn();
	} catch (e) {
		if (e instanceof ValidationError) return fail(400, { error: e.message });
		throw e;
	}
}

/** Form actions shared by every page that lists transactions. */
export const transactionActions = {
	addTxn: async ({ locals, request }: RequestEvent) => {
		const userId = requireUserId(locals);
		const form = await request.formData();
		return handleValidation(() => {
			createTransaction(getDb(), userId, parseTxnForm(form));
			return { added: true };
		});
	},
	toggleCleared: async ({ locals, request }: RequestEvent) => {
		const userId = requireUserId(locals);
		const form = await request.formData();
		setCleared(getDb(), userId, String(form.get('id')), form.get('cleared') === 'true');
	},
	setCategory: async ({ locals, request }: RequestEvent) => {
		const userId = requireUserId(locals);
		const form = await request.formData();
		return handleValidation(() =>
			setTransactionCategory(
				getDb(),
				userId,
				String(form.get('id')),
				String(form.get('categoryId') ?? '') || null
			)
		);
	},
	deleteTxn: async ({ locals, request }: RequestEvent) => {
		const userId = requireUserId(locals);
		const form = await request.formData();
		deleteTransaction(getDb(), userId, String(form.get('id')));
	}
};

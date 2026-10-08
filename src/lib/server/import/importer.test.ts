import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/client';
import { createAccount } from '../repo/accounts';
import { listCategories } from '../repo/categories';
import { createTransaction, listTransactions } from '../repo/transactions';
import { createRule } from '../rules/apply';
import { makeUser, setupTest } from '../testing/setup';
import { importTransactions, listImportBatches, undoImport } from './importer';

let db: Db;
let user: string;
let account: string;
let cat: (n: string) => string;

beforeEach(async () => {
	const t = setupTest();
	db = t.db;
	user = await makeUser(db, t.auth);
	account = createAccount(db, user, { name: 'Checking', type: 'checking' });
	const cats = listCategories(db, user);
	cat = (n) => cats.find((c) => c.name === n)!.id;
});

const rows = [
	{ date: '2026-01-03', amountMinor: -450, description: 'SQ *BLUE BOTTLE COFFEE 0423 OAKLAND CA' },
	{ date: '2026-01-03', amountMinor: -450, description: 'SQ *BLUE BOTTLE COFFEE 0423 OAKLAND CA' },
	{ date: '2026-01-05', amountMinor: 250000, description: 'ACME CORP PAYROLL' }
];

const csv = (r = rows) =>
	importTransactions(db, user, account, r, { source: 'csv', fileName: 'a.csv' });

describe('importTransactions', () => {
	it('adds rows with cleaned payees and keeps same-day duplicates', () => {
		expect(csv()).toMatchObject({ added: 3, updated: 0, skipped: 0 });
		const list = listTransactions(db, user);
		expect(list.filter((t) => t.payeeName === 'Blue Bottle Coffee')).toHaveLength(2);
		expect(list.every((t) => t.cleared)).toBe(true);
	});

	it('skips everything when the same file is imported twice', () => {
		csv();
		expect(csv()).toMatchObject({ added: 0, skipped: 3 });
		expect(listTransactions(db, user)).toHaveLength(3);
	});

	it('only adds the new rows of an overlapping file', () => {
		csv(rows.slice(0, 2));
		const res = csv([
			...rows.slice(1),
			{ date: '2026-01-06', amountMinor: -999, description: 'GAS' }
		]);
		// The second coffee in the new file is occurrence #0 there, matching the first one imported.
		expect(res).toMatchObject({ added: 2, skipped: 1 });
		expect(listTransactions(db, user)).toHaveLength(4);
	});

	it('links a manually entered transaction instead of duplicating it', () => {
		createTransaction(db, user, {
			accountId: account,
			date: '2026-01-04',
			amountMinor: 250000,
			payeeName: 'My job',
			categoryId: cat('Paycheck')
		});
		expect(csv()).toMatchObject({ added: 2, updated: 1 });
		const pay = listTransactions(db, user).find((t) => t.amountMinor === 250000)!;
		expect(pay.payeeName).toBe('My job');
		expect(pay.categoryId).toBe(cat('Paycheck'));
		expect(pay.cleared).toBe(true);
		expect(listTransactions(db, user)).toHaveLength(3);
	});

	it('dedupes by bank id even if the description changes', () => {
		const ofx = (description: string) =>
			importTransactions(
				db,
				user,
				account,
				[{ date: '2026-01-05', amountMinor: -100, description, externalId: 'FIT1' }],
				{ source: 'ofx' }
			);
		ofx('FIRST');
		expect(ofx('SECOND NAME')).toMatchObject({ added: 0, skipped: 1 });
	});

	it('updates a pending transaction when it posts with a new amount', () => {
		const sync = (amountMinor: number, pending: boolean) =>
			importTransactions(
				db,
				user,
				account,
				[
					{ date: '2026-01-05', amountMinor, description: 'GAS STATION', externalId: 'P1', pending }
				],
				{ source: 'simplefin' }
			);
		sync(-100, true);
		expect(sync(-4523, false)).toMatchObject({ updated: 1 });
		const [t] = listTransactions(db, user);
		expect(t).toMatchObject({ amountMinor: -4523, pending: false, cleared: true });
	});

	it('categorizes with rules, then with the last category used for the payee', () => {
		createRule(db, user, {
			matchField: 'description',
			matchOp: 'contains',
			matchValue: 'payroll',
			setCategoryId: cat('Paycheck'),
			setPayeeName: 'Acme Corp'
		});
		createTransaction(db, user, {
			accountId: account,
			date: '2025-12-01',
			amountMinor: -300,
			payeeName: 'Blue Bottle Coffee',
			categoryId: cat('Dining out')
		});
		csv();
		const list = listTransactions(db, user, { month: '2026-01' });
		const pay = list.find((t) => t.amountMinor === 250000)!;
		expect(pay.payeeName).toBe('Acme Corp');
		expect(pay.categoryId).toBe(cat('Paycheck'));
		expect(list.filter((t) => t.categoryId === cat('Dining out'))).toHaveLength(2);
	});

	it('undo removes only what the import added', () => {
		createTransaction(db, user, { accountId: account, date: '2026-01-05', amountMinor: 250000 });
		const res = csv();
		undoImport(db, user, res.batchId);
		const list = listTransactions(db, user);
		expect(list).toHaveLength(1);
		expect(listImportBatches(db, user)[0].undoneAt).not.toBeNull();
	});
});

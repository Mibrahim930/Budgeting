import { applyMapping, parseCsv, type CsvMapping } from '$lib/import/csv';
import { isOfx, parseOfx } from '$lib/import/ofx';
import { getDb } from '$lib/server/db/client';
import { importTransactions, listImportBatches, undoImport } from '$lib/server/import/importer';
import { handleValidation, requireUserId } from '$lib/server/page-helpers';
import { listAccounts, setCsvMapping } from '$lib/server/repo/accounts';
import { ValidationError } from '$lib/server/repo/transactions';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	const userId = requireUserId(locals);
	const db = getDb();
	return {
		accounts: listAccounts(db, userId).map((a) => ({
			id: a.id,
			name: a.name,
			type: a.type,
			csvMapping: a.csvMapping
				? (JSON.parse(a.csvMapping) as CsvMapping & { columns: number })
				: null
		})),
		batches: listImportBatches(db, userId)
	};
};

export const actions: Actions = {
	import: async ({ locals, request }) => {
		const userId = requireUserId(locals);
		const f = await request.formData();
		return handleValidation(() => {
			const db = getDb();
			const accountId = String(f.get('accountId') ?? '');
			const content = String(f.get('content') ?? '');
			const fileName = String(f.get('fileName') ?? '') || null;
			if (!content.trim()) throw new ValidationError('Choose a file to import');
			let rows;
			let source: 'csv' | 'ofx';
			if (isOfx(content)) {
				rows = parseOfx(content).rows;
				source = 'ofx';
			} else {
				const mapping = JSON.parse(String(f.get('mapping') ?? '{}')) as CsvMapping;
				const csv = parseCsv(content);
				const mapped = applyMapping(csv, mapping);
				if (!mapped.rows.length)
					throw new ValidationError('No transactions found with this mapping');
				rows = mapped.rows;
				source = 'csv';
				setCsvMapping(db, userId, accountId, { ...mapping, columns: csv[0]?.length ?? 0 });
			}
			const result = importTransactions(db, userId, accountId, rows, { source, fileName });
			return { result };
		});
	},
	undo: async ({ locals, request }) => {
		const f = await request.formData();
		undoImport(getDb(), requireUserId(locals), String(f.get('batchId')));
	}
};

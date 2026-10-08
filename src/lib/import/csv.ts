// CSV parsing and column mapping. Runs in the browser (preview) and on the server (import).
import { parseMoney } from '$lib/money';

/** RFC 4180-ish CSV parser: quoted fields, escaped quotes, CRLF/LF, auto-detected delimiter. */
export function parseCsv(text: string): string[][] {
	const src = text.replace(/^\uFEFF/, '');
	const firstLine = src.slice(0, src.indexOf('\n') === -1 ? undefined : src.indexOf('\n'));
	const delimiter = [',', ';', '\t'].reduce((best, d) =>
		firstLine.split(d).length > firstLine.split(best).length ? d : best
	);
	const rows: string[][] = [];
	let row: string[] = [];
	let field = '';
	let inQuotes = false;
	for (let i = 0; i < src.length; i++) {
		const ch = src[i];
		if (inQuotes) {
			if (ch === '"') {
				if (src[i + 1] === '"') {
					field += '"';
					i++;
				} else inQuotes = false;
			} else field += ch;
		} else if (ch === '"') {
			inQuotes = true;
		} else if (ch === delimiter) {
			row.push(field);
			field = '';
		} else if (ch === '\n' || ch === '\r') {
			if (ch === '\r' && src[i + 1] === '\n') i++;
			row.push(field);
			rows.push(row);
			row = [];
			field = '';
		} else field += ch;
	}
	if (field !== '' || row.length) {
		row.push(field);
		rows.push(row);
	}
	return rows.map((r) => r.map((f) => f.trim())).filter((r) => r.some((f) => f !== ''));
}

export const DATE_FORMATS = ['YYYY-MM-DD', 'MM/DD/YYYY', 'DD/MM/YYYY', 'YYYYMMDD'] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];

/** Parse a bank date into 'YYYY-MM-DD'. Two-digit years are 20xx. */
export function parseDate(value: string, format: DateFormat): string | null {
	const v = value.trim().split(/[ T]/)[0];
	let y: number, m: number, d: number;
	if (format === 'YYYYMMDD') {
		const mt = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
		if (!mt) return null;
		[y, m, d] = [Number(mt[1]), Number(mt[2]), Number(mt[3])];
	} else {
		const parts = v.split(/[-/.]/);
		if (parts.length !== 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
		const n = parts.map(Number);
		if (format === 'YYYY-MM-DD') [y, m, d] = n;
		else if (format === 'MM/DD/YYYY') [m, d, y] = n;
		else [d, m, y] = n;
		if (parts[format === 'YYYY-MM-DD' ? 0 : 2].length === 2) y += 2000;
	}
	const date = new Date(Date.UTC(y, m - 1, d));
	if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
		return null;
	}
	return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Pick the format that parses the most samples (earlier formats win ties). */
export function detectDateFormat(samples: string[]): DateFormat {
	const filled = samples.filter((s) => s.trim());
	let best: DateFormat = 'MM/DD/YYYY';
	let bestCount = 0;
	for (const f of DATE_FORMATS) {
		const n = filled.filter((s) => parseDate(s, f) !== null).length;
		if (n > bestCount) [best, bestCount] = [f, n];
	}
	return best;
}

export interface CsvMapping {
	hasHeader: boolean;
	dateColumn: number;
	dateFormat: DateFormat;
	descriptionColumn: number;
	/** 'single': one signed amount column; 'split': separate debit (out) and credit (in) columns. */
	amountMode: 'single' | 'split';
	amountColumn: number;
	debitColumn: number;
	creditColumn: number;
	/** Some banks (often credit cards) show purchases as positive numbers. */
	invertAmount: boolean;
	memoColumn: number;
}

export interface ParsedRow {
	date: string;
	amountMinor: number;
	description: string;
	memo?: string | null;
	externalId?: string | null;
	pending?: boolean;
}

const findCol = (header: string[], ...names: RegExp[]) => {
	for (const re of names) {
		const i = header.findIndex((h) => re.test(h));
		if (i !== -1) return i;
	}
	return -1;
};

/** Guess a mapping from the header row and data. */
export function guessMapping(rows: string[][]): CsvMapping {
	const first = rows[0] ?? [];
	const hasHeader = first.length > 0 && first.every((c) => parseMoney(c) === null || c === '');
	const header = hasHeader ? first.map((h) => h.toLowerCase()) : [];
	const data = hasHeader ? rows.slice(1) : rows;
	let dateColumn = findCol(header, /^(transaction |trans\.? |posting |post(ed)? )?date$/, /date/);
	if (dateColumn === -1) {
		dateColumn = Math.max(
			0,
			first.findIndex((_, i) =>
				data
					.slice(0, 5)
					.every((r) => parseDate(r[i] ?? '', detectDateFormat([r[i] ?? ''])) !== null)
			)
		);
	}
	const debitColumn = findCol(header, /^debit/, /withdrawal/, /money out/);
	const creditColumn = findCol(header, /^credit/, /deposit/, /money in/);
	let amountColumn = findCol(header, /^amount$/, /amount/);
	if (amountColumn === -1 && debitColumn === -1) {
		amountColumn = first.findIndex(
			(_, i) => i !== dateColumn && data.slice(0, 5).every((r) => parseMoney(r[i] ?? '') !== null)
		);
	}
	const descriptionColumn = findCol(
		header,
		/^description$/,
		/description/,
		/payee/,
		/merchant/,
		/^name$/,
		/details/
	);
	return {
		hasHeader,
		dateColumn,
		dateFormat: detectDateFormat(data.slice(0, 20).map((r) => r[dateColumn] ?? '')),
		descriptionColumn:
			descriptionColumn === -1
				? first.findIndex((_, i) => i !== dateColumn && i !== amountColumn)
				: descriptionColumn,
		amountMode:
			amountColumn === -1 && debitColumn !== -1 && creditColumn !== -1 ? 'split' : 'single',
		amountColumn,
		debitColumn,
		creditColumn,
		invertAmount: false,
		memoColumn: findCol(header, /^memo/, /^notes?$/)
	};
}

export interface MapResult {
	rows: ParsedRow[];
	errors: { line: number; message: string }[];
}

/** Turn CSV rows into transactions using a mapping. */
export function applyMapping(rows: string[][], m: CsvMapping): MapResult {
	const out: ParsedRow[] = [];
	const errors: MapResult['errors'] = [];
	const data = m.hasHeader ? rows.slice(1) : rows;
	data.forEach((r, i) => {
		const line = i + (m.hasHeader ? 2 : 1);
		const date = parseDate(r[m.dateColumn] ?? '', m.dateFormat);
		if (!date) return errors.push({ line, message: `Can't read date "${r[m.dateColumn] ?? ''}"` });
		let amount: number | null;
		if (m.amountMode === 'split') {
			const debit = parseMoney(r[m.debitColumn] ?? '') ?? 0;
			const credit = parseMoney(r[m.creditColumn] ?? '') ?? 0;
			amount = Math.abs(credit) - Math.abs(debit);
			if (!(r[m.debitColumn] ?? '').trim() && !(r[m.creditColumn] ?? '').trim()) amount = null;
		} else {
			amount = parseMoney(r[m.amountColumn] ?? '');
		}
		if (amount === null) return errors.push({ line, message: 'Missing amount' });
		if (m.invertAmount) amount = -amount;
		out.push({
			date,
			amountMinor: amount,
			description: (r[m.descriptionColumn] ?? '').replace(/\s+/g, ' ').trim(),
			memo: m.memoColumn >= 0 ? r[m.memoColumn] || null : null
		});
	});
	return { rows: out, errors };
}

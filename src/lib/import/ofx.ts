// Minimal OFX/QFX statement parser. Handles both SGML (OFX 1.x, unclosed tags) and XML (OFX 2.x).
import { parseMoney } from '$lib/money';
import type { ParsedRow } from './csv';

function tag(block: string, name: string): string | null {
	const m = new RegExp(`<${name}>([^<\\r\\n]*)`, 'i').exec(block);
	return m ? m[1].trim() : null;
}

function decode(s: string): string {
	return s
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&amp;/g, '&');
}

export function isOfx(text: string): boolean {
	return /<OFX>/i.test(text) || /^\s*OFXHEADER/i.test(text);
}

export interface OfxResult {
	rows: ParsedRow[];
	/** Ledger balance at the end of the statement, if present. */
	balanceMinor: number | null;
}

export function parseOfx(text: string): OfxResult {
	const rows: ParsedRow[] = [];
	const blocks = text.split(/<STMTTRN>/i).slice(1);
	for (const raw of blocks) {
		const block = raw.split(/<\/STMTTRN>/i)[0];
		const dt = tag(block, 'DTPOSTED');
		const amt = tag(block, 'TRNAMT');
		if (!dt || !amt) continue;
		const amount = parseMoney(amt);
		const m = /^(\d{4})(\d{2})(\d{2})/.exec(dt);
		if (amount === null || !m) continue;
		const name = decode(tag(block, 'NAME') ?? tag(block, 'PAYEE') ?? '');
		const memo = decode(tag(block, 'MEMO') ?? '');
		rows.push({
			date: `${m[1]}-${m[2]}-${m[3]}`,
			amountMinor: amount,
			description: (name || memo).replace(/\s+/g, ' ').trim(),
			memo: name && memo && memo !== name ? memo : null,
			externalId: tag(block, 'FITID')
		});
	}
	const ledger = /<LEDGERBAL>([\s\S]*?)(<\/LEDGERBAL>|<AVAILBAL>|$)/i.exec(text);
	const bal = ledger ? tag(ledger[1], 'BALAMT') : null;
	return { rows, balanceMinor: bal ? parseMoney(bal) : null };
}

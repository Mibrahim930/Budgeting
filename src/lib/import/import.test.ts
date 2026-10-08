import { describe, expect, it } from 'vitest';
import { applyMapping, detectDateFormat, guessMapping, parseCsv, parseDate } from './csv';
import { isOfx, parseOfx } from './ofx';

describe('parseCsv', () => {
	it('handles quotes, embedded commas, escaped quotes and CRLF', () => {
		const rows = parseCsv('a,b,c\r\n"x, y","say ""hi""",3\r\n\r\n');
		expect(rows).toEqual([
			['a', 'b', 'c'],
			['x, y', 'say "hi"', '3']
		]);
	});

	it('detects semicolon and tab delimiters', () => {
		expect(parseCsv('a;b\n1;2')).toEqual([
			['a', 'b'],
			['1', '2']
		]);
		expect(parseCsv('a\tb\n1\t2')[1]).toEqual(['1', '2']);
	});

	it('handles a byte-order mark and no trailing newline', () => {
		expect(parseCsv('\uFEFFDate,Amount\n2026-01-01,5')).toEqual([
			['Date', 'Amount'],
			['2026-01-01', '5']
		]);
	});
});

describe('dates', () => {
	it.each([
		['2026-01-31', 'YYYY-MM-DD', '2026-01-31'],
		['01/31/2026', 'MM/DD/YYYY', '2026-01-31'],
		['1/5/26', 'MM/DD/YYYY', '2026-01-05'],
		['31/01/2026', 'DD/MM/YYYY', '2026-01-31'],
		['20260131', 'YYYYMMDD', '2026-01-31'],
		['2026-01-31T10:00:00', 'YYYY-MM-DD', '2026-01-31']
	] as const)('%s (%s)', (v, f, out) => expect(parseDate(v, f)).toBe(out));

	it('rejects impossible dates', () => {
		expect(parseDate('02/30/2026', 'MM/DD/YYYY')).toBeNull();
		expect(parseDate('13/01/2026', 'MM/DD/YYYY')).toBeNull();
	});

	it('detects the format from samples', () => {
		expect(detectDateFormat(['01/02/2026', '12/31/2026'])).toBe('MM/DD/YYYY');
		expect(detectDateFormat(['31/01/2026'])).toBe('DD/MM/YYYY');
		expect(detectDateFormat(['2026-01-02'])).toBe('YYYY-MM-DD');
	});
});

describe('mapping', () => {
	it('maps a typical checking export with a signed amount', () => {
		const rows = parseCsv(
			'Posting Date,Description,Amount,Type,Balance\n01/03/2026,COFFEE SHOP,-4.50,DEBIT,100\n01/04/2026,PAYROLL,"1,500.00",CREDIT,1600'
		);
		const m = guessMapping(rows);
		expect(m).toMatchObject({
			hasHeader: true,
			dateColumn: 0,
			descriptionColumn: 1,
			amountColumn: 2
		});
		const { rows: out, errors } = applyMapping(rows, m);
		expect(errors).toEqual([]);
		expect(out).toEqual([
			{ date: '2026-01-03', amountMinor: -450, description: 'COFFEE SHOP', memo: null },
			{ date: '2026-01-04', amountMinor: 150000, description: 'PAYROLL', memo: null }
		]);
	});

	it('maps separate debit and credit columns', () => {
		const rows = parseCsv(
			'Date,Description,Debit,Credit\n2026-01-03,Store,12.00,\n2026-01-04,Refund,,3.50'
		);
		const m = guessMapping(rows);
		expect(m.amountMode).toBe('split');
		expect(applyMapping(rows, m).rows.map((r) => r.amountMinor)).toEqual([-1200, 350]);
	});

	it('can invert credit-card style amounts and reports bad lines', () => {
		const rows = parseCsv('Date,Description,Amount\n2026-01-03,Store,12.00\nnot a date,Bad,1');
		const m = { ...guessMapping(rows), invertAmount: true };
		const res = applyMapping(rows, m);
		expect(res.rows[0].amountMinor).toBe(-1200);
		expect(res.errors).toEqual([{ line: 3, message: `Can't read date "not a date"` }]);
	});
});

describe('ofx', () => {
	const sgml = `OFXHEADER:100
DATA:OFXSGML
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260105120000[-5:EST]<TRNAMT>-42.10<FITID>A1<NAME>GROCERY &amp; CO<MEMO>POS 123
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260106<TRNAMT>1000.00<FITID>A2<NAME>PAYROLL
</BANKTRANLIST><LEDGERBAL><BALAMT>957.90<DTASOF>20260107</LEDGERBAL></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

	it('parses SGML OFX', () => {
		expect(isOfx(sgml)).toBe(true);
		const r = parseOfx(sgml);
		expect(r.rows).toEqual([
			{
				date: '2026-01-05',
				amountMinor: -4210,
				description: 'GROCERY & CO',
				memo: 'POS 123',
				externalId: 'A1'
			},
			{
				date: '2026-01-06',
				amountMinor: 100000,
				description: 'PAYROLL',
				memo: null,
				externalId: 'A2'
			}
		]);
		expect(r.balanceMinor).toBe(95790);
	});

	it('parses XML OFX', () => {
		const xml = `<?xml version="1.0"?><OFX><STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20260105</DTPOSTED><TRNAMT>-1.00</TRNAMT><FITID>X</FITID><NAME>Thing</NAME></STMTTRN></OFX>`;
		expect(parseOfx(xml).rows).toEqual([
			{ date: '2026-01-05', amountMinor: -100, description: 'Thing', memo: null, externalId: 'X' }
		]);
	});
});

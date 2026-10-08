import { describe, expect, it } from 'vitest';
import { safeNext } from './safe-redirect';

describe('safeNext', () => {
	it('keeps relative paths', () => expect(safeNext('/accounts?x=1')).toBe('/accounts?x=1'));
	it.each([null, '', 'https://evil.test', '//evil.test', '/\\evil.test'])('rejects %s', (v) =>
		expect(safeNext(v)).toBe('/budget')
	);
});

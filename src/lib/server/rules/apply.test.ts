import { describe, expect, it } from 'vitest';
import { ruleMatches } from './apply';

describe('ruleMatches', () => {
	const t = { description: 'AMAZON MKTPL*2K4L09', payeeName: 'Amazon Mktpl' };
	it.each([
		['description', 'contains', 'mktpl', true],
		['description', 'starts_with', 'amazon', true],
		['description', 'starts_with', 'mktpl', false],
		['payee', 'equals', 'amazon  mktpl', true],
		['payee', 'equals', 'amazon', false],
		['payee', 'contains', '', false]
	] as const)('%s %s %j -> %s', (matchField, matchOp, matchValue, expected) =>
		expect(ruleMatches({ matchField, matchOp, matchValue }, t)).toBe(expected)
	);
});

import { randomBytes } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret } from './crypto';

beforeAll(() => {
	process.env.DATA_ENCRYPTION_KEY = randomBytes(32).toString('base64');
});

describe('secret encryption', () => {
	it('round-trips and uses a fresh IV each time', () => {
		const secret = 'https://user:pass@bridge.example/simplefin';
		const a = encryptSecret(secret);
		expect(a).not.toContain('pass');
		expect(a).not.toBe(encryptSecret(secret));
		expect(decryptSecret(a)).toBe(secret);
	});

	it('detects tampering', () => {
		const parts = encryptSecret('hello').split(':');
		parts[3] = Buffer.from('jello').toString('base64url');
		expect(() => decryptSecret(parts.join(':'))).toThrow();
	});

	it('fails with the wrong key', () => {
		const enc = encryptSecret('hello');
		process.env.DATA_ENCRYPTION_KEY = randomBytes(32).toString('base64');
		expect(() => decryptSecret(enc)).toThrow();
	});
});

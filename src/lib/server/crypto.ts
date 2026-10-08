import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// AES-256-GCM for secrets stored in the database (e.g. SimpleFIN Access URLs).
// The key lives outside the database in DATA_ENCRYPTION_KEY (32 bytes, base64).

function key(): Buffer {
	const raw = process.env.DATA_ENCRYPTION_KEY;
	if (!raw) throw new Error('DATA_ENCRYPTION_KEY is not set');
	const k = Buffer.from(raw, 'base64');
	if (k.length !== 32) throw new Error('DATA_ENCRYPTION_KEY must be 32 bytes, base64-encoded');
	return k;
}

export function encryptSecret(plain: string): string {
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', key(), iv);
	const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
	return ['v1', iv, cipher.getAuthTag(), body]
		.map((p) => (typeof p === 'string' ? p : p.toString('base64url')))
		.join(':');
}

export function decryptSecret(stored: string): string {
	const [version, iv, tag, body] = stored.split(':');
	if (version !== 'v1' || !iv || !tag || !body) throw new Error('Unrecognized secret format');
	const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
	decipher.setAuthTag(Buffer.from(tag, 'base64url'));
	return Buffer.concat([
		decipher.update(Buffer.from(body, 'base64url')),
		decipher.final()
	]).toString('utf8');
}

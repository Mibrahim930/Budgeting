// One-command local setup: create .env with fresh secrets and the data folder.
// Usage: npm run setup
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

if (existsSync('.env')) {
	console.log('.env already exists; leaving it alone. Delete it first to start over.');
	process.exit(0);
}

const secret = () => randomBytes(32).toString('base64');
const env = readFileSync('.env.example', 'utf8')
	.replace(/^BETTER_AUTH_SECRET=.*$/m, `BETTER_AUTH_SECRET=${secret()}`)
	.replace(/^DATA_ENCRYPTION_KEY=.*$/m, `DATA_ENCRYPTION_KEY=${secret()}`);

writeFileSync('.env', env, { mode: 0o600 });
mkdirSync('data', { recursive: true });
console.log('Wrote .env with new secrets and created ./data.');
console.log('Done. Next: npm run dev');

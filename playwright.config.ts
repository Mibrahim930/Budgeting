import { defineConfig } from '@playwright/test';

const port = 4173;

export default defineConfig({
	testDir: 'e2e',
	testMatch: '**/*.test.ts',
	use: {
		baseURL: `http://localhost:${port}`,
		// Lets a pre-installed Chromium be used instead of downloading one.
		launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH || undefined }
	},
	webServer: {
		command: `rm -rf ./data/e2e && npm run build && node build`,
		port,
		reuseExistingServer: false,
		env: {
			PORT: String(port),
			ORIGIN: `http://localhost:${port}`,
			BETTER_AUTH_URL: `http://localhost:${port}`,
			BETTER_AUTH_SECRET: 'e2e-secret-e2e-secret-e2e-secret-e2e',
			DATA_ENCRYPTION_KEY: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
			DATABASE_PATH: './data/e2e/budget.db',
			DISABLE_SYNC_SCHEDULER: '1'
		}
	}
});

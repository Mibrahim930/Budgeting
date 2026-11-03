import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => {
	// The app reads process.env, which `vite dev` doesn't fill from .env on its own. Variables that are
	// already set (CI, Playwright, Docker) win over the file.
	for (const [key, value] of Object.entries(loadEnv(mode, process.cwd(), ''))) {
		process.env[key] ??= value;
	}
	return {
		plugins: [tailwindcss(), sveltekit()],
		test: {
			include: ['src/**/*.test.ts'],
			environment: 'node'
		}
	};
});

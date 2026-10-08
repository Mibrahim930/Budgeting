import { expect, test } from '@playwright/test';
import { loginAsAdmin } from './helpers';

test('is installable and shows the last budget offline', async ({ page, context }) => {
	await loginAsAdmin(page);
	const manifest = await page.request.get('/manifest.webmanifest');
	expect((await manifest.json()).display).toBe('standalone');

	await page.goto('/budget/2030-01');
	await page.evaluate(async () => {
		await navigator.serviceWorker.ready;
	});
	// Load again so the now-active worker caches the page.
	await page.reload();
	await expect(page.getByTestId('to-budget')).toBeVisible();

	await context.setOffline(true);
	await page.reload();
	await expect(page.getByTestId('to-budget')).toBeVisible();
	await context.setOffline(false);
});

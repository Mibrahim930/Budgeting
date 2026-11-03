import { expect, test } from '@playwright/test';
import { loginAsAdmin } from './helpers';

// Runs right after auth.test.ts, so both the admin and the friend (a non-admin) exist.
const friend = { email: 'friend@example.test', password: 'friend-password-123' };

test('admin downloads a backup of the database', async ({ page }) => {
	await loginAsAdmin(page);
	await page.goto('/admin/invites');
	await expect(page.getByRole('heading', { name: 'Backups' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Download a backup now' })).toHaveAttribute(
		'href',
		'/admin/backup'
	);

	const res = await page.request.get('/admin/backup');
	expect(res.status()).toBe(200);
	expect(res.headers()['content-disposition']).toMatch(
		/^attachment; filename="budget-\d{4}-\d{2}-\d{2}\.db"$/
	);
	const body = await res.body();
	expect(body.subarray(0, 15).toString('latin1')).toBe('SQLite format 3');
});

test('a non-admin cannot download a backup', async ({ page }) => {
	await page.goto('/login');
	await page.getByLabel('Email').fill(friend.email);
	await page.getByLabel('Password').fill(friend.password);
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible();

	const res = await page.request.get('/admin/backup');
	expect(res.status()).toBe(403);
});

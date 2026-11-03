import { expect, type Page } from '@playwright/test';

export const admin = { name: 'Admin', email: 'admin@example.test', password: 'admin-password-123' };

/** Sign in as the admin, creating the admin account if this is a fresh database. Lands on `/` or `/welcome`. */
export async function loginAsAdmin(page: Page) {
	await page.goto('/login');
	if (page.url().includes('/signup')) {
		await page.getByLabel('Name').fill(admin.name);
		await page.getByLabel('Email').fill(admin.email);
		await page.getByLabel(/Password/).fill(admin.password);
		await page.getByRole('button', { name: 'Create account' }).click();
	} else {
		await page.getByLabel('Email').fill(admin.email);
		await page.getByLabel('Password').fill(admin.password);
		await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	}
	// Home, or the onboarding wizard while the admin has no accounts or pay schedule yet.
	await expect(page).toHaveURL(/\/(welcome)?$/);
	await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible();
}

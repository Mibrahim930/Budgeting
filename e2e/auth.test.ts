import { expect, test } from '@playwright/test';
import { admin } from './helpers';

test.describe.configure({ mode: 'serial' });

const friend = { name: 'Friend', email: 'friend@example.test', password: 'friend-password-123' };

async function signUp(page: import('@playwright/test').Page, u: typeof admin) {
	await page.getByLabel('Name').fill(u.name);
	await page.getByLabel('Email').fill(u.email);
	await page.getByLabel(/Password/).fill(u.password);
	await page.getByRole('button', { name: 'Create account' }).click();
	await expect(page).toHaveURL(/\/budget/);
}

test('first visitor creates the admin account, invites a friend', async ({ page }) => {
	await page.goto('/');
	await expect(page).toHaveURL(/\/signup/);
	await expect(page.getByRole('heading', { name: 'Create the admin account' })).toBeVisible();
	await signUp(page, admin);

	await page.goto('/admin/invites');
	await page.getByRole('button', { name: 'New invite link' }).click();
	const link = await page.locator('input[readonly]').inputValue();
	expect(link).toContain('/signup?invite=');

	await page.goto('/settings');
	await page.getByRole('button', { name: 'Sign out' }).click();
	await expect(page).toHaveURL(/\/login/);

	// Without an invite, sign-up is refused.
	await page.goto('/signup');
	await expect(page.getByText(/invite-only/)).toBeVisible();

	await page.goto(link);
	await signUp(page, friend);
	await expect(page.getByRole('link', { name: 'Invites' })).toHaveCount(0);
});

test('existing user can sign in with a password', async ({ page }) => {
	await page.goto('/accounts');
	await expect(page).toHaveURL(/\/login\?next=%2Faccounts/);
	await page.getByLabel('Email').fill(admin.email);
	await page.getByLabel('Password').fill(admin.password);
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await expect(page).toHaveURL(/\/accounts/);
});

test('public sign-up API is blocked', async ({ request }) => {
	const res = await request.post('/api/auth/sign-up/email', {
		data: { name: 'x', email: 'x@example.test', password: 'whatever-123456' }
	});
	expect(res.status()).toBe(403);
});

import { expect, test } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

// Created (but not yet onboarded) by auth.test.ts, which runs first.
const friend = { email: 'friend@example.test', password: 'friend-password-123' };

test('a new user is onboarded and lands on the home page', async ({ page }) => {
	await page.goto('/login');
	await page.getByLabel('Email').fill(friend.email);
	await page.getByLabel('Password').fill(friend.password);
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await expect(page).toHaveURL(/\/welcome$/);

	await page.getByLabel('Checking account name').fill('Main checking');
	await page.getByLabel('Checking balance').fill('1000');

	await page.getByRole('button', { name: '+ Add savings account' }).click();
	await page.getByLabel('Savings account name').fill('Emergency');
	await page.getByLabel('Savings balance').fill('250');

	await page.getByRole('button', { name: '+ Add debt' }).click();
	await page.getByLabel('Debt name').fill('Visa');
	await page.getByLabel('Debt type').selectOption('credit');
	await page.getByLabel('Amount owed').fill('300');

	await page.getByLabel('Pay frequency').selectOption('biweekly');
	await page.getByLabel('Take-home pay').fill('2000');
	await page.getByLabel('Next payday').fill('2030-01-03');
	await page.getByRole('button', { name: 'Finish setup' }).click();

	await expect(page).toHaveURL(/\/$/);
	const home = page.getByTestId('home');
	await expect(home).toBeVisible();
	await expect(home.getByText('No paycheck planned yet')).toBeVisible();
	await expect(home.getByRole('link', { name: 'New paycheck' })).toHaveAttribute(
		'href',
		'/paychecks/new'
	);
	// The pay schedule exists, so no set-up card.
	await expect(home.getByText('Set up your pay schedule')).toHaveCount(0);

	const snapshot = page.getByTestId('accounts-snapshot');
	await expect(snapshot.getByRole('listitem').filter({ hasText: 'Main checking' })).toContainText(
		'$1,000.00'
	);
	await expect(snapshot.getByRole('listitem').filter({ hasText: 'Emergency' })).toContainText(
		'$250.00'
	);
	await expect(snapshot.getByRole('listitem').filter({ hasText: 'Visa' })).toContainText(
		'-$300.00'
	);
	await expect(page.getByRole('link', { name: 'Paychecks' })).toHaveAttribute(
		'aria-current',
		'page'
	);
});

test('the wizard is shown only once', async ({ page }) => {
	await page.goto('/login');
	await page.getByLabel('Email').fill(friend.email);
	await page.getByLabel('Password').fill(friend.password);
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await expect(page).toHaveURL(/\/$/);

	await page.goto('/welcome');
	await expect(page).toHaveURL(/\/$/);

	await page.goto('/settings/pay');
	await expect(page.getByLabel('Pay frequency')).toHaveValue('biweekly');
	await expect(page.getByLabel('Take-home pay')).toHaveValue('2000.00');
	await expect(page.getByLabel('Next payday')).toHaveValue('2030-01-03');
	await expect(page.getByLabel('Paid into')).toHaveValue(/.+/);
});

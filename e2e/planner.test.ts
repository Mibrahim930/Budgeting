import { expect, test, type Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

// Onboarded by onboarding.test.ts (Main checking $1,000, Emergency $250, Visa owes $300,
// paid every 2 weeks from 2030-01-03), which runs before this file.
const friend = { email: 'friend@example.test', password: 'friend-password-123' };

async function signIn(page: Page) {
	await page.goto('/login');
	await page.getByLabel('Email').fill(friend.email);
	await page.getByLabel('Password').fill(friend.password);
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await expect(page).toHaveURL(/\/$/);
}

const billRow = (page: Page, name: string) =>
	page.getByRole('list', { name: 'Active bills' }).getByRole('listitem').filter({ hasText: name });

// Part 1 (M4): bills
test('bills are added, listed with their next due date, and edited', async ({ page }) => {
	await signIn(page);
	await page.getByRole('link', { name: 'Bills' }).click();
	await expect(page).toHaveURL(/\/bills$/);
	await expect(page.getByRole('heading', { name: 'Bills' })).toBeVisible();
	await expect(page.getByText('suggested automatically')).toBeVisible();

	await page.getByRole('button', { name: 'Add bill' }).click();
	await page.getByLabel('Bill name').fill('Rent');
	await page.getByLabel('Amount').fill('1200');
	await page.getByLabel('How often').selectOption('monthly');
	await page.getByLabel('Day of month').fill('1');
	await page.getByLabel('Paid from').selectOption({ label: 'Main checking' });
	await page.getByRole('button', { name: 'Add bill' }).last().click();
	await expect(billRow(page, 'Rent')).toBeVisible();

	await page.getByRole('button', { name: 'Add bill' }).click();
	await page.getByLabel('Bill name').fill('Netflix');
	await page.getByLabel('Amount').fill('15.49');
	await page.getByLabel('How often').selectOption('monthly');
	await page.getByLabel('Day of month').fill('9');
	await page.getByLabel('Paid from').selectOption({ label: 'Main checking' });
	await page.getByLabel('Category').selectOption({ label: 'Subscriptions' });
	await expect(page.getByLabel('Pays off')).toHaveValue('');
	await page.getByRole('button', { name: 'Add bill' }).last().click();

	const rent = billRow(page, 'Rent');
	const netflix = billRow(page, 'Netflix');
	await expect(rent).toContainText('$1,200.00');
	await expect(rent).toContainText('Monthly on the 1st');
	await expect(rent).toContainText('Paid from Main checking');
	await expect(rent).toContainText(/Next due \w{3}, \w{3} 1\b/);
	await expect(netflix).toContainText('$15.49');
	await expect(netflix).toContainText('Monthly on the 9th');
	await expect(netflix).toContainText('Subscriptions');
	await expect(netflix).toContainText(/Next due \w{3}, \w{3} 9\b/);

	await netflix.getByRole('link').click();
	await expect(page).toHaveURL(/\/bills\/[^/]+$/);
	await expect(page.getByRole('heading', { name: 'Netflix' })).toBeVisible();
	await expect(page.getByLabel('Amount')).toHaveValue('15.49');
	await expect(page.getByLabel('Category').locator('option:checked')).toHaveText('Subscriptions');
	await page.getByLabel('Amount').fill('15.99');
	await page.getByRole('button', { name: 'Save bill' }).click();
	await expect(page.getByText('Bill saved')).toBeVisible();

	await page.getByRole('link', { name: '← Bills' }).click();
	await expect(page).toHaveURL(/\/bills$/);
	await expect(billRow(page, 'Netflix')).toContainText('$15.99');
	await expect(billRow(page, 'Rent')).toContainText('$1,200.00');
});

// Part 2 (M5): paycheck plan

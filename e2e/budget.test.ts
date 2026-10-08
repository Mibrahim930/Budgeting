import { expect, test } from '@playwright/test';
import { loginAsAdmin } from './helpers';

test('budget a paycheck, overspend, and see it come out of next month', async ({ page }) => {
	await loginAsAdmin(page);

	// An account whose starting balance becomes money to budget.
	await page.goto('/accounts');
	await page.getByRole('button', { name: 'Add account' }).click();
	await page.getByLabel('Name').fill('E2E Checking');
	await page.getByLabel('Balance today').fill('1000');
	await page.getByRole('button', { name: 'Create account' }).click();
	await expect(page.getByRole('heading', { name: 'E2E Checking' })).toBeVisible();

	await page.goto('/budget/2030-01');
	const toBudget = page.getByTestId('to-budget');
	await expect(toBudget).toHaveText('$1,000.00');

	const dining = page.getByLabel('Budgeted for Dining out');
	await dining.fill('50');
	await dining.press('Tab');
	await expect(toBudget).toHaveText('$950.00');

	// Spend $80 on dining in January 2030 (overspent by $30).
	await page.goto('/transactions');
	await page.getByRole('button', { name: 'Add transaction' }).click();
	await page.getByLabel('Date').fill('2030-01-15');
	await page.getByLabel('Account').selectOption({ label: 'E2E Checking' });
	await page.getByLabel('Payee').fill('Pizza Place');
	await page.getByLabel('Amount').fill('80');
	await page.getByLabel('Category', { exact: true }).selectOption({ label: 'Dining out' });
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.getByText('Pizza Place')).toBeVisible();

	await page.goto('/budget/2030-01');
	await expect(page.getByTestId('to-budget')).toHaveText('$950.00');

	await page.goto('/budget/2030-02');
	await expect(page.getByTestId('to-budget')).toHaveText('$920.00');
});

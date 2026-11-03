import { expect, test } from '@playwright/test';

// Runs after planner.test.ts (see the `calendar` project in playwright.config.ts). The friend has
// the 2030-01-03 → 2030-01-17 plan with Netflix ticked (linked), left to allocate $0.00.
const friend = { email: 'friend@example.test', password: 'friend-password-123' };

test('a charge added on the calendar lands in the open plan', async ({ page }) => {
	await page.goto('/login');
	await page.getByLabel('Email').fill(friend.email);
	await page.getByLabel('Password').fill(friend.password);
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await expect(page).toHaveURL(/\/$/);
	const planHref = await page.getByRole('link', { name: /Open plan/ }).getAttribute('href');
	expect(planHref).toMatch(/^\/paychecks\/[^/]+$/);

	await page.getByRole('link', { name: 'Calendar', exact: true }).first().click();
	await expect(page).toHaveURL(/\/calendar$/);
	await expect(page.getByRole('heading', { name: 'Calendar' })).toBeVisible();

	await page.goto('/calendar?month=2030-01');
	await expect(page.getByRole('heading', { name: 'January 2030' })).toBeVisible();
	await page.getByTestId('day-2030-01-16').click();
	await expect(page).toHaveURL(/day=2030-01-16/);
	await expect(page.getByTestId('day-2030-01-16')).toHaveAttribute('aria-pressed', 'true');
	const agenda = page.getByRole('region', { name: 'Selected day' });
	await expect(agenda).toContainText('Wed, Jan 16');
	await expect(agenda).toContainText('Nothing due');

	await agenda.getByRole('button', { name: 'Add a charge on this day' }).click();
	await expect(agenda.getByLabel('How often')).toHaveValue('monthly');
	await expect(agenda.getByLabel('Day of month')).toHaveValue('16');
	await expect(agenda.getByLabel('First due date')).toHaveValue('2030-01-16');
	await agenda.getByLabel('Bill name').fill('Gym');
	await agenda.getByLabel('Amount').fill('100');
	await agenda.getByRole('button', { name: 'Add charge' }).click();

	await expect(page).toHaveURL(/month=2030-01&day=2030-01-16&added=/);
	await expect(page.getByRole('status')).toContainText('Added to the Thu, Jan 3 plan');
	const jan16 = page.getByTestId('day-2030-01-16');
	await expect(jan16.locator('[data-status="planned"]')).toHaveCount(1);
	await expect(page.getByTestId('day-2030-01-09').locator('[data-status="paid"]')).toHaveCount(1);
	await expect(page.getByTestId('day-2030-01-01').locator('[data-status="unplanned"]')).toHaveCount(
		1
	);
	for (const day of ['2030-01-03', '2030-01-17']) {
		await expect(page.getByTestId(`day-${day}`).getByTitle('Payday')).toBeVisible();
	}
	await expect(page.getByTestId('day-2030-01-16').getByTitle('Payday')).toHaveCount(0);
	const gym = agenda.getByRole('listitem').filter({ hasText: 'Gym' });
	await expect(gym).toContainText('$100.00');
	await expect(gym).toContainText('Planned');

	await page.goto(planHref!);
	const line = page
		.getByRole('list', { name: 'Plan checklist' })
		.getByRole('listitem')
		.filter({ has: page.getByRole('checkbox', { name: 'Gym', exact: true }) });
	await expect(line).toBeVisible();
	await expect(page.getByLabel('Amount for Gym')).toHaveValue('100.00');
	await expect(page.getByTestId('left-to-allocate')).toHaveText('-$100.00');
});

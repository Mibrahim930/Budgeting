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

	// Back to the §2.3 price, which part 2's dollar figures rely on.
	await billRow(page, 'Netflix').getByRole('link').click();
	await page.getByLabel('Amount').fill('15.49');
	await page.getByRole('button', { name: 'Save bill' }).click();
	await expect(page.getByText('Bill saved')).toBeVisible();
	await page.getByRole('link', { name: '← Bills' }).click();
	await expect(billRow(page, 'Netflix')).toContainText('$15.49');
});

// Part 2 (M5): paycheck plan

// The friend's 2030-01-03 paycheck. M6's isolation test checks the admin gets a 404 for it.
let paycheckId = '';

const left = (page: Page) => page.getByTestId('left-to-allocate');
const picker = (page: Page) => page.getByRole('region', { name: 'Add to plan' });
const projectedAfter = (page: Page, account: string) =>
	page
		.getByRole('row')
		.filter({ hasText: account })
		.getByTestId(/^projected-/);
const accountRow = (page: Page, account: string) =>
	page.getByRole('listitem').filter({ hasText: account });

async function expectBalances(page: Page, balances: Record<string, string>) {
	await page.goto('/accounts');
	for (const [name, amount] of Object.entries(balances)) {
		await expect(accountRow(page, name)).toContainText(amount);
	}
}

test('a paycheck is planned, allocated and ticked off', async ({ page }) => {
	await signIn(page);

	await page.goto('/paychecks/new?date=2030-01-03&next=2030-01-17');
	await expect(page.getByLabel('Pay date')).toHaveValue('2030-01-03');
	await expect(page.getByLabel('Next payday')).toHaveValue('2030-01-17');
	await expect(page.getByLabel('Paid into').locator('option:checked')).toHaveText('Main checking');
	await page.getByLabel('Amount', { exact: true }).fill('2000');
	await expect(page.getByRole('checkbox', { name: /Netflix/ })).toBeChecked();
	await expect(page.getByRole('checkbox', { name: /Rent/ })).toHaveCount(0);
	await page.getByRole('button', { name: 'Create plan' }).click();

	await expect(page).toHaveURL(/\/paychecks\/(?!new\b)[^/?]+$/);
	paycheckId = new URL(page.url()).pathname.split('/').pop()!;
	await expect(left(page)).toHaveText('$1,984.51');
	await expect(page.getByText('due Jan 9 · Subscriptions')).toBeVisible();
	await expect(
		page
			.getByRole('list', { name: 'Upcoming bills' })
			.getByRole('listitem')
			.filter({ hasText: 'Netflix' })
	).toContainText('In plan ✓');

	// Savings: added at $90, then corrected to $100 in the checklist.
	await picker(page).getByRole('button', { name: 'Savings', exact: true }).click();
	await picker(page).getByLabel('Savings account').selectOption({ label: 'Emergency' });
	await picker(page).getByLabel('Amount', { exact: true }).fill('90');
	await picker(page).getByRole('button', { name: 'Add to plan' }).click();
	await expect(left(page)).toHaveText('$1,894.51');
	await expect(page.getByText('to Emergency')).toBeVisible();
	await page.getByLabel('Amount for Emergency').fill('100');
	await page.getByLabel('Amount for Emergency').press('Tab');
	await expect(left(page)).toHaveText('$1,884.51');

	await picker(page).getByRole('button', { name: 'Debt', exact: true }).click();
	await picker(page).getByLabel('Debt account').selectOption({ label: 'Visa' });
	await picker(page).getByLabel('Amount', { exact: true }).fill('150');
	await picker(page).getByRole('button', { name: 'Add to plan' }).click();
	await expect(left(page)).toHaveText('$1,734.51');
	await expect(page.getByText('Visa payment')).toBeVisible();

	await page.getByRole('button', { name: 'Use $1,734.51 as spending money' }).click();
	await expect(left(page)).toHaveText('$0.00');
	await expect(page.getByText('Every dollar has a job')).toBeVisible();
	await expect(page.getByText('Spending money until next payday: $1,734.51')).toBeVisible();

	await expect(projectedAfter(page, 'Emergency')).toHaveText('$350.00');
	await expect(projectedAfter(page, 'Visa')).toHaveText('-$150.00');
	await expect(projectedAfter(page, 'Main checking')).toHaveText('$2,734.51');

	// Ticking "Paycheck received" records the income.
	await page.getByRole('checkbox', { name: 'Paycheck received', exact: true }).check();
	await expect(
		page.getByRole('checkbox', { name: 'Paycheck received', exact: true })
	).toBeChecked();
	await expect(page.getByRole('button', { name: 'Delete plan' })).toBeDisabled();
	await expectBalances(page, { 'Main checking': '$3,000.00' });

	await page.goto(`/paychecks/${paycheckId}`);
	for (const name of ['Netflix', 'Emergency', 'Visa']) {
		const box = page.getByRole('checkbox', { name, exact: true });
		await box.check();
		await expect(box).toBeChecked();
	}
	// Projections don't move once the money has really moved.
	await expect(projectedAfter(page, 'Main checking')).toHaveText('$2,734.51');
	await expectBalances(page, {
		'Main checking': '$2,734.51',
		Emergency: '$350.00',
		Visa: '-$150.00'
	});

	await page.goto('/transactions?q=netflix');
	const netflixRows = page.getByRole('listitem').filter({ hasText: 'Netflix' });
	await expect(netflixRows).toHaveCount(1);
	await expect(netflixRows).toContainText('Subscriptions');

	await page.goto(`/paychecks/${paycheckId}`);
	const savings = page.getByRole('checkbox', { name: 'Emergency', exact: true });
	await savings.uncheck();
	await expect(savings).not.toBeChecked();
	await expectBalances(page, { Emergency: '$250.00', 'Main checking': '$2,834.51' });

	await page.goto('/');
	const home = page.getByTestId('home');
	await expect(home.getByTestId('left-to-allocate')).toHaveText('$0.00');
	await expect(
		home.getByRole('list', { name: 'All paychecks' }).getByRole('listitem').first()
	).toContainText('Partly confirmed');
	await expect(home.getByRole('link', { name: /Open plan/ })).toHaveAttribute(
		'href',
		`/paychecks/${paycheckId}`
	);
});

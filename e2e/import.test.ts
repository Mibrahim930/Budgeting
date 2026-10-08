import { expect, test } from '@playwright/test';
import { loginAsAdmin } from './helpers';

const csv = `Posting Date,Description,Amount
01/03/2031,SQ *BLUE BOTTLE COFFEE 0423 OAKLAND CA,-4.50
01/04/2031,ACME PAYROLL,2500.00
`;

test('import a CSV, then re-import it without duplicates', async ({ page }) => {
	await loginAsAdmin(page);
	await page.goto('/accounts');
	await page.getByRole('button', { name: 'Add account' }).click();
	await page.getByLabel('Name').fill('Import Checking');
	await page.getByRole('button', { name: 'Create account' }).click();
	await expect(page.getByRole('heading', { name: 'Import Checking' })).toBeVisible();

	const upload = async () => {
		await page.goto('/import');
		await page.getByLabel('Into account').selectOption({ label: 'Import Checking' });
		await page.getByLabel('File').setInputFiles({
			name: 'bank.csv',
			mimeType: 'text/csv',
			buffer: Buffer.from(csv)
		});
		await expect(page.getByText('2 transactions found')).toBeVisible();
		await page.getByRole('button', { name: 'Import 2 transactions' }).click();
	};

	await upload();
	await expect(page.getByRole('status')).toContainText('Imported 2 new');
	await upload();
	await expect(page.getByRole('status')).toContainText('Imported 0 new');
	await expect(page.getByRole('status')).toContainText('skipped 2');

	await page.goto('/transactions?q=blue');
	await expect(page.getByText('Blue Bottle Coffee')).toHaveCount(1);
});

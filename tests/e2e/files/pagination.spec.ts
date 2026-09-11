import { test, expect } from '../fixtures/auth.fixture';

test.describe('Table Pagination System E2E', () => {

  test('1. Files Page: Displays 50 items by default, navigates pages, and switches page sizes', async ({ authenticatedPage: page }) => {
    // Generate 65 mock documents
    const mockDocs = Array.from({ length: 65 }, (_, i) => ({
      id: `doc_${i + 1}`,
      filename: `report_document_${String(i + 1).padStart(2, '0')}.pdf`,
      originalName: `Report Document ${String(i + 1).padStart(2, '0')}.pdf`,
      fileType: 'pdf',
      mimeType: 'application/pdf',
      fileSize: 10240,
      folder: 'Finance',
      downloadPolicy: 'inherit',
      effectiveDownloadPolicy: 'allowed',
      status: 'ready',
      createdAt: new Date(2026, 0, i + 1).toISOString(),
    }));

    await page.route('**/api/documents**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockDocs),
      });
    });

    await page.route('**/api/folders**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: 'fld_1', name: 'Finance', downloadPolicy: 'allowed' }]),
      });
    });

    await page.goto('/documents');

    // Verify pagination footer is visible
    const paginationSummary = page.locator('.pagination-summary');
    await expect(paginationSummary).toBeVisible();
    await expect(paginationSummary).toContainText('Showing 1–50 of 65 files');

    // Page 2 navigation
    const nextBtn = page.locator('button[aria-label="Next page"]').first();
    await expect(nextBtn).toBeEnabled();
    await nextBtn.click();

    await expect(paginationSummary).toContainText('Showing 51–65 of 65 files');

    // Switch page size to 10
    const pageSize10Btn = page.locator('button[aria-label="Show 10 items per page"]').first();
    await pageSize10Btn.click();

    await expect(paginationSummary).toContainText('Showing 1–10 of 65 files');

    // Switch page size to All
    const pageSizeAllBtn = page.locator('button[aria-label="Show all items per page"]').first();
    await pageSizeAllBtn.click();

    await expect(paginationSummary).toContainText('Showing 1–65 of 65 files');
  });

  test('2. Admin Users Page: Paginates enterprise users with 10 / 50 / All controls', async ({ authenticatedPage: page }) => {
    const mockUsers = Array.from({ length: 60 }, (_, i) => ({
      id: `usr_${i + 1}`,
      email: `employee_${i + 1}@enterprise.com`,
      firstName: `Employee${i + 1}`,
      lastName: 'Staff',
      role: 'user',
      departments: ['Engineering'],
      allowedFolders: [],
      status: 'active',
      createdAt: new Date().toISOString(),
    }));

    await page.route('**/api/users**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockUsers),
      });
    });

    await page.route('**/api/roles**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.route('**/api/access-requests/pending**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.route('**/api/access-requests/history**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], total: 0, page: 1, limit: 50, totalPages: 1 }),
      });
    });

    await page.goto('/admin');

    const paginationSummary = page.locator('.pagination-summary').first();
    await expect(paginationSummary).toBeVisible();
    await expect(paginationSummary).toContainText('Showing 1–50 of 60 users');

    // Page 2
    const nextBtn = page.locator('button[aria-label="Next page"]').first();
    await nextBtn.click();
    await expect(paginationSummary).toContainText('Showing 51–60 of 60 users');
  });

});

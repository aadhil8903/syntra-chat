import { test, expect } from '../fixtures/auth.fixture';

test.describe('Files & Documents Navigation', () => {

  test('1. Should render the documents table with folders and files', async ({ authenticatedPage: page }) => {
    const mockDocs = [
      {
        id: 'doc_001',
        filename: '26_vendor_risk_assessment.xlsx',
        originalName: '26_vendor_risk_assessment.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: 1048576,
        folder: 'Finance',
        downloadPermission: 'use_folder_setting',
        ingestionStatus: 'indexed',
        createdAt: new Date().toISOString(),
      },
    ];

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
        body: JSON.stringify([{ id: 'fld_1', name: 'Finance', allowedDepartments: ['Finance'] }]),
      });
    });

    await page.goto('/documents');

    await expect(page.locator('text=26_vendor_risk_assessment.xlsx').first()).toBeVisible();
  });

});

import { test, expect } from '../fixtures/auth.fixture';

test.describe('Archived Conversations Workflow', () => {

  test('1. Navigating to archived chats view displays archived conversations', async ({ authenticatedPage: page }) => {
    const mockArchivedConv = {
      id: 'conv_archived_001',
      title: 'Old FY2024 Strategy',
      userId: 'usr_test_e2e_001',
      archived: true,
      pinned: false,
      createdAt: new Date().toISOString(),
    };

    await page.route('**/api/conversations**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([mockArchivedConv]),
      });
    });

    await page.goto('/chat?view=archived');
    await expect(page.locator('text=Old FY2024 Strategy').first()).toBeVisible({ timeout: 10000 });
  });

  test('2. Refreshing the page in archived view preserves archived state', async ({ authenticatedPage: page }) => {
    const mockArchivedConv = {
      id: 'conv_archived_002',
      title: 'Historical Audit Logs',
      userId: 'usr_test_e2e_001',
      archived: true,
      pinned: false,
      createdAt: new Date().toISOString(),
    };

    await page.route('**/api/conversations**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([mockArchivedConv]),
      });
    });

    await page.goto('/chat?view=archived');
    await expect(page.locator('text=Historical Audit Logs').first()).toBeVisible({ timeout: 10000 });

    // Reload page
    await page.reload();
    await expect(page.locator('text=Historical Audit Logs').first()).toBeVisible({ timeout: 10000 });
  });

});

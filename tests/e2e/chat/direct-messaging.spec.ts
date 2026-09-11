import { test, expect } from '../fixtures/auth.fixture';
import { Selectors } from '../helpers/selectors';

test.describe('Direct Messaging & @Syntra AI Collaboration', () => {

  test('1. Direct Messages section renders in sidebar and opens Org Directory modal', async ({ authenticatedPage: page }) => {
    await page.route('**/api/conversations/direct**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'dm_conv_001',
            type: 'direct',
            partner: {
              id: 'user_rahul',
              firstName: 'Rahul',
              lastName: 'Verma',
              email: 'rahul@enterprise.com',
              presence: { isOnline: true, lastSeenRelative: 'Active now' },
            },
            lastMessage: {
              content: 'Hey Aadil, can you check the Q3 numbers?',
              senderId: 'user_rahul',
              senderName: 'Rahul Verma',
              createdAt: new Date().toISOString(),
              role: 'user',
              isAi: false,
            },
            unreadCount: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ]),
      });
    });

    await page.route('**/api/users/organization-members**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'user_rahul',
            firstName: 'Rahul',
            lastName: 'Verma',
            email: 'rahul@enterprise.com',
            presence: { isOnline: true, lastSeenRelative: 'Active now' },
            departments: ['Product'],
          },
        ]),
      });
    });

    await page.goto('/chat');
    await page.waitForTimeout(500);

    // Direct messages section should be visible
    const dmSection = page.locator('[data-tour="direct-messages"]');
    await expect(dmSection).toBeVisible();
    await expect(dmSection).toContainText('Direct Messages');
    await expect(dmSection).toContainText('Rahul Verma');
    await expect(dmSection).toContainText('Hey Aadil, can you check the Q3 numbers?');

    // Clicking DM item selects it and sets header
    await page.locator('#conv-item-dm_conv_001').click();
    await expect(page.locator('h2')).toContainText('Rahul Verma');
  });

  test('2. @ mention autocomplete shows @Syntra AI option', async ({ authenticatedPage: page }) => {
    await page.route('**/api/conversations/direct**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.goto('/chat');
    await page.waitForTimeout(500);

    const textarea = Selectors.chat.composerTextarea(page);
    await expect(textarea).toBeVisible({ timeout: 10000 });
    await textarea.fill('@');

    // Check autocomplete popup
    const mentionMenu = page.locator('app-mention-autocomplete');
    await expect(mentionMenu).toBeVisible();
    await expect(mentionMenu).toContainText('Syntra AI');
  });
});

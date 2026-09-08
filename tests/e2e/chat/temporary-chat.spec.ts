import { test, expect } from '../fixtures/auth.fixture';
import { Selectors } from '../helpers/selectors';

test.describe('Temporary Chat (Zero-Persistence Mode)', () => {

  test('1. Should toggle Temporary Chat and display temporary session indicator', async ({ authenticatedPage: page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(300);

    const tempToggle = Selectors.chat.temporaryChatToggle(page);
    await expect(tempToggle).toBeVisible({ timeout: 10000 });
    await tempToggle.click();
    await expect(page.locator('h2')).toContainText(/Temporary Chat/i);
  });

  test('2. Temporary chat messages never issue POST /conversations requests', async ({ authenticatedPage: page }) => {
    let postConversationCalled = false;

    await page.route('**/api/conversations**', async (route) => {
      if (route.request().method() === 'POST') {
        postConversationCalled = true;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.route('**/api/messages/stream**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: 'data: {type:chunk,content:Temporary ephemeral response}\n\ndata: {type:done}\n\n',
      });
    });

    await page.goto('/chat');
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(300);

    // Toggle temporary mode
    const tempToggle = Selectors.chat.temporaryChatToggle(page);
    await expect(tempToggle).toBeVisible({ timeout: 10000 });
    await tempToggle.click();

    const textarea = Selectors.chat.composerTextarea(page);
    await expect(textarea).toBeVisible({ timeout: 10000 });
    await textarea.fill('Ephemeral query that should not be saved to DB');
    await Selectors.chat.sendButton(page).click();

    await page.waitForTimeout(500);
    expect(postConversationCalled).toBe(false);
  });

});

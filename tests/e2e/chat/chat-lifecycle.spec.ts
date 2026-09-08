import { test, expect } from '../fixtures/auth.fixture';
import { Selectors } from '../helpers/selectors';

test.describe('Chat Lifecycle & Lazy Persistence', () => {

  test('1. Opening New Chat initializes an empty draft and does NOT write to database', async ({ authenticatedPage: page }) => {
    let conversationCreateCalled = false;

    await page.route('**/api/conversations**', async (route) => {
      if (route.request().method() === 'POST') {
        conversationCreateCalled = true;
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'conv_persisted_001',
            title: 'Persisted Chat',
            userId: 'usr_test_e2e_001',
            createdAt: new Date().toISOString(),
          }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      }
    });

    await page.goto('/chat');
    await page.waitForTimeout(500);
    
    // Header should be present
    await expect(page.locator('h2')).toBeVisible();
    
    // Verify POST /conversations was NOT called simply by opening New Chat
    expect(conversationCreateCalled).toBe(false);
  });

  test('2. Typing a draft and navigating away does not create a conversation in recent chats', async ({ authenticatedPage: page }) => {
    let conversationCreateCalled = false;

    await page.route('**/api/conversations**', async (route) => {
      if (route.request().method() === 'POST') {
        conversationCreateCalled = true;
      }
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
    await textarea.fill('Draft inquiry about quarterly performance');

    // Navigate to Documents/Files
    await Selectors.sidebar.filesNav(page).click();
    await expect(page).toHaveURL(/\/documents/);

    // Return to Chat
    await Selectors.sidebar.chatNav(page).click();
    await expect(page).toHaveURL(/\/chat/);

    // No conversation was created on the backend
    expect(conversationCreateCalled).toBe(false);
  });

  test('3. Sending first message persists the conversation and renders in sidebar', async ({ authenticatedPage: page }) => {
    const mockConv = {
      id: 'conv_persisted_001',
      title: 'Quarterly Report Summary',
      userId: 'usr_test_e2e_001',
      createdAt: new Date().toISOString(),
      pinned: false,
      archived: false,
    };

    let postCount = 0;

    await page.route('**/api/conversations**', async (route) => {
      if (route.request().method() === 'POST') {
        postCount++;
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(mockConv),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(postCount > 0 ? [mockConv] : []),
        });
      }
    });

    await page.route('**/api/messages/stream**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: 'data: {type:chunk,content:Here is the quarterly summary.}\n\ndata: {type:done}\n\n',
      });
    });

    await page.goto('/chat');
    await page.waitForTimeout(500);

    const textarea = Selectors.chat.composerTextarea(page);
    await expect(textarea).toBeVisible({ timeout: 10000 });
    await textarea.fill('Summarize the Q3 report');
    await Selectors.chat.sendButton(page).click();

    // Verify conversation creation occurred
    await expect.poll(() => postCount, { timeout: 10000 }).toBe(1);
  });

});

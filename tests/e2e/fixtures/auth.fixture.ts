import { test as base, Page } from '@playwright/test';

export interface AuthFixture {
  authenticatedPage: Page;
}

export const DEFAULT_MOCK_USER = {
  id: 'usr_test_e2e_001',
  email: 'test-user@syntra.local',
  firstName: 'Test',
  lastName: 'User',
  role: 'admin',
  roles: ['admin', 'user'],
  departments: ['Engineering', 'Finance'],
  allowedFolders: ['Engineering_Docs'],
  isTemporaryPassword: false,
  mustChangePassword: false,
  status: 'active',
};

export async function setupGlobalMockRoutes(page: Page, user = DEFAULT_MOCK_USER) {
  // Generic fallback for any backend API call to return 200 OK
  await page.route(/.*\/api\/.*/, async (route) => {
    const url = route.request().url();
    if (url.includes('/users/me')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(user),
      });
    } else if (url.includes('/auth/refresh')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          accessToken: 'mock_jwt_access_token',
          refreshToken: 'mock_jwt_refresh_token',
        }),
      });
    } else if (url.includes('/auth/login')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          accessToken: 'mock_jwt_access_token',
          refreshToken: 'mock_jwt_refresh_token',
          user: user,
        }),
      });
    } else if (url.includes('/auth/logout')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    } else if (url.includes('/documents')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ documents: [], total: 0 }),
      });
    } else if (url.includes('/analytics')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          totalDocuments: 0,
          totalConversations: 0,
          activeUsersCount: 1,
          totalStorageBytes: 0,
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
}

export async function injectAuthSession(page: Page, user = DEFAULT_MOCK_USER) {
  const token = 'mock_jwt_access_token';
  const refresh = 'mock_jwt_refresh_token';

  await page.addInitScript(({ t, r, u }) => {
    localStorage.setItem('enter_chat_access_token', t);
    localStorage.setItem('enter_chat_refresh_token', r);
    localStorage.setItem('enter_chat_user', JSON.stringify(u));
    localStorage.setItem('syntra_chat_access_token', t);
    localStorage.setItem('syntra_chat_refresh_token', r);
    localStorage.setItem('syntra_chat_user', JSON.stringify(u));
    localStorage.setItem('syntra_chat_walkthrough_completed', 'true');
    localStorage.setItem(`syntra_chat_walkthrough_completed_${u.id}`, 'true');
  }, { t: token, r: refresh, u: user });
}

export const test = base.extend<AuthFixture>({
  authenticatedPage: async ({ page }, use) => {
    await setupGlobalMockRoutes(page);
    await injectAuthSession(page);
    await use(page);
  },
});

export { expect } from '@playwright/test';

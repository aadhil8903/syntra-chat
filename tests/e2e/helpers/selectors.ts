import { Page } from '@playwright/test';

export const Selectors = {
  auth: {
    emailInput: (page: Page) => page.getByPlaceholder(/aadil@company\.com|email/i),
    passwordInput: (page: Page) => page.getByPlaceholder(/••••••••|password/i),
    signInButton: (page: Page) => page.getByRole('button', { name: /sign in/i }),
    errorMessage: (page: Page) => page.locator('div:has-text(Invalid email or password), div:has-text(Please enter)').first(),
  },
  sidebar: {
    homeNav: (page: Page) => page.locator('a[data-tour=nav-dashboard]'),
    chatNav: (page: Page) => page.locator('a[data-tour=nav-chat]'),
    archivedNav: (page: Page) => page.locator('a[data-tour=nav-archived]'),
    filesNav: (page: Page) => page.locator('a[data-tour=nav-documents]'),
    adminNav: (page: Page) => page.locator('a[data-tour=nav-admin]'),
    settingsNav: (page: Page) => page.locator('a[data-tour=nav-settings]'),
    docsNav: (page: Page) => page.locator('a[data-tour=nav-docs]'),
    newChatButton: (page: Page) => page.getByRole('button', { name: /new chat/i }),
    searchInput: (page: Page) => page.getByPlaceholder(/search chats/i),
  },
  chat: {
    composerTextarea: (page: Page) => page.locator('textarea.chat-composer-textarea, textarea').first(),
    sendButton: (page: Page) => page.locator('button[title*=Send]').or(page.getByRole('button', { name: /send/i })),
    temporaryChatToggle: (page: Page) => page.getByRole('button', { name: /toggle temporary chat mode|temporary chat/i }).first(),
    messagesList: (page: Page) => page.locator('.message-item, [data-message-role]'),
  },
  files: {
    fileRows: (page: Page) => page.locator('tr, [data-testid=file-row]'),
  },
};

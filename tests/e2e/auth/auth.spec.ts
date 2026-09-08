import { test, expect } from '../fixtures/auth.fixture';
import { Selectors } from '../helpers/selectors';

test.describe('Authentication & Route Guard Workflows', () => {

  test('1. Should render the login page with all expected accessible controls', async ({ page }) => {
    await page.goto('/auth/login');
    
    await expect(page.getByRole('heading', { name: /welcome to syntra chat/i })).toBeVisible();
    await expect(Selectors.auth.emailInput(page)).toBeVisible();
    await expect(Selectors.auth.passwordInput(page)).toBeVisible();
    await expect(Selectors.auth.signInButton(page)).toBeVisible();
  });

  test('2. Should show validation error when submitting empty credentials', async ({ page }) => {
    await page.goto('/auth/login');
    await Selectors.auth.signInButton(page).click();
    
    await expect(page.locator('text=Please enter your email and password.')).toBeVisible();
  });

  test('3. Should redirect unauthenticated users from protected route /chat to /auth/login', async ({ page }) => {
    await page.goto('/chat');
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test('4. Should redirect unauthenticated users from protected route /documents to /auth/login', async ({ page }) => {
    await page.goto('/documents');
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test('5. Should allow authenticated user access to workspace routes', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(Selectors.sidebar.homeNav(page)).toBeVisible();
  });

  test('6. Should display error message on invalid login credentials', async ({ page }) => {
    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Invalid email or password' }),
      });
    });

    await page.goto('/auth/login');
    await Selectors.auth.emailInput(page).fill('unknown@syntra.local');
    await Selectors.auth.passwordInput(page).fill('WrongPassword123!');
    await Selectors.auth.signInButton(page).click();

    await expect(page.locator('text=Invalid email or password')).toBeVisible();
  });

});

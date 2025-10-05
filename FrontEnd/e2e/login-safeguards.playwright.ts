import { test, expect } from '@playwright/test';

test.describe('Login safeguards E2E (smoke)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/auth/signin');
    await page.evaluate(() => localStorage.clear());
  });

  test('Block at 31st attempt with countdown toast', async ({ page }) => {
    await page.evaluate(() => {
      const now = Date.now();
      const attempts = Array.from({ length: 30 }, (_, i) => now - i * 1000);
      localStorage.setItem('login_attempts', JSON.stringify(attempts));
    });
    await page.goto('/auth/signin');
    await page.getByPlaceholder('Enter your email').fill('a@b.com');
    await page.getByPlaceholder('Enter your password').fill('x');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByText(/Too many attempts/i)).toBeVisible();
    await expect(page.getByText(/Try again in/i)).toBeVisible();
  });

  test('Soft CAPTCHA workflow', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('login_captcha_required', '1'));
    await page.goto('/auth/signin');
    await expect(page.getByText(/i am not a robot/i)).toBeVisible();
    await page.getByPlaceholder('Enter your email').fill('a@b.com');
    await page.getByPlaceholder('Enter your password').fill('x');
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: /sign in/i }).click();
  });
});


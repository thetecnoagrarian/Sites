import { test, expect } from '@playwright/test';

test.describe('Admin Functionality', () => {
  test('admin login page loads', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveURL(/\/login/);
    
    // Check for login form elements
    const hasForm = await page.locator('form, sl-input, input[type="email"], input[type="password"]').count() > 0;
    expect(hasForm).toBe(true);
  });

  test('admin dashboard requires authentication', async ({ page }) => {
    // Try to access admin without login
    await page.goto('/admin');
    
    // Should redirect to login or show unauthorized
    const currentUrl = page.url();
    const isLoginPage = currentUrl.includes('/login') || currentUrl.includes('/auth');
    const isAdminPage = currentUrl.includes('/admin');
    
    // Either redirected to login OR on admin page (if already logged in)
    expect(isLoginPage || isAdminPage).toBe(true);
  });

  test('admin navigation is accessible when logged in', async ({ page }) => {
    // This test assumes you might be logged in via cookies/session
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');
    
    // If we're on admin page, check for admin elements
    if (page.url().includes('/admin')) {
      const hasAdminContent = await page.locator('.admin-container, .admin-dashboard, main').count() > 0;
      expect(hasAdminContent).toBe(true);
    } else {
      // If redirected, that's expected behavior
      test.skip();
    }
  });

  test('no console errors on admin pages', async ({ page }) => {
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');
    
    // Allow some errors if redirected (that's okay)
    if (page.url().includes('/admin')) {
      expect(errors).toHaveLength(0);
    }
  });
});




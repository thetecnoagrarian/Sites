import { test, expect } from '@playwright/test';

test.describe('Homepage', () => {
  test('loads successfully', async ({ page }) => {
    await page.goto('/');
    // Accept either site name in title
    const title = await page.title();
    expect(title).toMatch(/The Tecnoagrarian|Fruition Forest Garden/);
  });

  test('displays header with logo', async ({ page }) => {
    await page.goto('/');
    // TTA uses .logo-image, FFG uses .site-logo img
    const logo = page.locator('.logo-image, .site-logo img');
    await expect(logo).toBeVisible();
  });

  test('displays navigation links', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('nav a[href="/"]')).toBeVisible();
    await expect(page.locator('nav a[href="/about"]')).toBeVisible();
  });

  test('displays search area', async ({ page }) => {
    await page.goto('/');
    // TTA uses .search-area, FFG uses .search-box in sidebar
    const searchArea = page.locator('.search-area, .search-box');
    await expect(searchArea).toBeVisible();
  });

  test('search input is functional', async ({ page }) => {
    await page.goto('/');
    const searchInput = page.locator('sl-input[name="q"]');
    await expect(searchInput).toBeVisible();
    
    // Shoelace components need to be interacted with via the shadow DOM
    // Click the input to focus it, then type
    await searchInput.click();
    await page.keyboard.type('test');
    await page.keyboard.press('Enter');
    
    // Should navigate to search page
    await page.waitForURL(/\/search/);
  });

  test('no console errors on load', async ({ page }) => {
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    expect(errors).toHaveLength(0);
  });
});


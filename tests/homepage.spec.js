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
    
    // On mobile, nav might be hidden behind hamburger menu
    const viewport = page.viewportSize();
    const isMobile = viewport && viewport.width < 768;
    
    if (isMobile) {
      // Open hamburger menu first
      const hamburger = page.locator('.hamburger');
      if (await hamburger.count() > 0) {
        await hamburger.click();
        await page.waitForTimeout(300); // Wait for menu animation
      }
    }
    
    // Check for navigation links (either visible or in menu)
    const homeLink = page.locator('nav a[href="/"]');
    const aboutLink = page.locator('nav a[href="/about"]');
    
    // On mobile, links might be in a menu that's now open
    const homeCount = await homeLink.count();
    const aboutCount = await aboutLink.count();
    
    expect(homeCount).toBeGreaterThan(0);
    expect(aboutCount).toBeGreaterThan(0);
    
    // At least one should be visible (either always visible on desktop, or in opened menu on mobile)
    const homeVisible = homeCount > 0 && await homeLink.first().isVisible().catch(() => false);
    const aboutVisible = aboutCount > 0 && await aboutLink.first().isVisible().catch(() => false);
    
    expect(homeVisible || aboutVisible).toBe(true);
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


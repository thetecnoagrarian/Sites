import { test, expect } from '@playwright/test';

test.describe('Forms', () => {
  test('search form is functional', async ({ page }) => {
    await page.goto('/');
    
    const searchInput = page.locator('sl-input[name="q"], input[name="q"]');
    await expect(searchInput).toBeVisible();
    
    // Interact with search
    await searchInput.click();
    await page.keyboard.type('test');
    await page.keyboard.press('Enter');
    
    // Should navigate to search results
    await page.waitForURL(/\/search/, { timeout: 5000 });
  });

  test('search form works on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    
    const searchInput = page.locator('sl-input[name="q"], input[name="q"]');
    await expect(searchInput).toBeVisible();
    
    await searchInput.click();
    await page.keyboard.type('test');
    await page.keyboard.press('Enter');
    
    await page.waitForURL(/\/search/, { timeout: 5000 });
  });

  test('forms are usable on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    
    // Check search input is properly sized for mobile
    const searchInput = page.locator('sl-input[name="q"]');
    if (await searchInput.count() > 0) {
      const box = await searchInput.boundingBox();
      expect(box.width).toBeGreaterThan(200); // Should be usable size
    }
  });
});




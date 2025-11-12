import { test, expect } from '@playwright/test';

test.describe('Forms', () => {
  test('search form is functional', async ({ page }) => {
    await page.goto('/');
    
    const searchInput = page.locator('sl-input[name="q"], input[name="q"]');
    const count = await searchInput.count();
    
    if (count === 0) {
      test.skip();
    }
    
    // Scroll to search input if needed (FFG has it in sidebar)
    await searchInput.first().scrollIntoViewIfNeeded();
    await expect(searchInput.first()).toBeVisible();
    
    // Interact with search
    await searchInput.first().click();
    await page.waitForTimeout(200); // Wait for focus
    await page.keyboard.type('test');
    await page.waitForTimeout(200);
    
    // For FFG sidebar form, need to click submit button or press Enter
    const form = page.locator('form[action="/search"]');
    if (await form.count() > 0) {
      const submitButton = form.locator('sl-button[type="submit"], button[type="submit"]');
      if (await submitButton.count() > 0) {
        await submitButton.first().click();
      } else {
        await page.keyboard.press('Enter');
      }
    } else {
      await page.keyboard.press('Enter');
    }
    
    // Should navigate to search results
    await page.waitForURL(/\/search/, { timeout: 5000 });
  });

  test('search form works on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    
    // Navigate with timeout and retry logic
    try {
      await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (e) {
      // If initial load fails, try again with load state
      await page.goto('/', { waitUntil: 'load', timeout: 15000 });
    }
    
    const searchInput = page.locator('sl-input[name="q"], input[name="q"]');
    const count = await searchInput.count();
    
    if (count === 0) {
      test.skip();
    }
    
    // Scroll to search input if needed
    await searchInput.first().scrollIntoViewIfNeeded();
    await expect(searchInput.first()).toBeVisible();
    
    await searchInput.first().click();
    await page.waitForTimeout(200);
    await page.keyboard.type('test');
    await page.waitForTimeout(200);
    
    // For FFG sidebar form, need to click submit button or press Enter
    const form = page.locator('form[action="/search"]');
    if (await form.count() > 0) {
      const submitButton = form.locator('sl-button[type="submit"], button[type="submit"]');
      if (await submitButton.count() > 0) {
        await submitButton.first().click();
      } else {
        await page.keyboard.press('Enter');
      }
    } else {
      await page.keyboard.press('Enter');
    }
    
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




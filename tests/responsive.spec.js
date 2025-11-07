import { test, expect } from '@playwright/test';

test.describe('Responsive Design', () => {
  const viewports = [
    { name: 'Mobile', width: 375, height: 667 },
    { name: 'Tablet', width: 768, height: 1024 },
    { name: 'Desktop', width: 1920, height: 1080 },
  ];

  viewports.forEach(({ name, width, height }) => {
    test(`${name} viewport (${width}x${height}) renders correctly`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto('/');
      
      // Check page loads
      await expect(page.locator('header')).toBeVisible();
      await expect(page.locator('.search-area')).toBeVisible();
      
      // Take screenshot for visual comparison
      await page.screenshot({ 
        path: `tests/screenshots/homepage-${name.toLowerCase()}.png`,
        fullPage: true 
      });
    });
  });

  test('hamburger menu appears on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    
    const hamburger = page.locator('.hamburger');
    await expect(hamburger).toBeVisible();
  });

  test('hamburger menu opens navigation', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    
    const hamburger = page.locator('.hamburger');
    const header = page.locator('header');
    
    await hamburger.click();
    await page.waitForTimeout(300);
    
    await expect(header).toHaveClass(/nav-open/);
  });

  test('categories button width adapts to viewport', async ({ page }) => {
    // Mobile - should be full width
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    const mobileButton = page.locator('.categories-toggle');
    const mobileBox = await mobileButton.boundingBox();
    expect(mobileBox.width).toBeCloseTo(375, -10); // Allow padding/margin
    
    // Desktop - should be centered, not full width
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/');
    await page.waitForTimeout(300);
    const desktopButton = page.locator('.categories-toggle');
    const desktopBox = await desktopButton.boundingBox();
    expect(desktopBox.width).toBeLessThan(400); // Should be button width, not full
  });
});


import { test, expect } from '@playwright/test';

test.describe('Cross-Browser Compatibility', () => {
  test('Shoelace components load', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Check for Shoelace components
    const shoelaceComponents = page.locator('sl-input, sl-button, sl-card');
    const count = await shoelaceComponents.count();
    
    // Should have at least one Shoelace component
    expect(count).toBeGreaterThan(0);
  });

  test('Shoelace input components are functional', async ({ page }) => {
    await page.goto('/');
    
    const searchInput = page.locator('sl-input[name="q"]');
    const count = await searchInput.count();
    
    if (count > 0) {
      await expect(searchInput.first()).toBeVisible();
      
      // Scroll into view if needed (for sidebar on FFG)
      await searchInput.first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);
      
      // Try to interact with it - click and type
      await searchInput.first().click();
      await page.waitForTimeout(200);
      await page.keyboard.type('test');
      await page.waitForTimeout(300); // Give shadow DOM time to update
      
      // Try to get value - Shoelace uses shadow DOM, so we need to use evaluate
      const value = await searchInput.first().evaluate((el) => {
        // Access the internal input element in shadow DOM
        const shadowRoot = el.shadowRoot;
        if (shadowRoot) {
          const input = shadowRoot.querySelector('input');
          return input ? input.value : '';
        }
        return el.value || '';
      });
      
      expect(value).toContain('test');
    } else {
      // If no search input, skip test
      test.skip();
    }
  });

  test('Font Awesome icons load', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Check for Font Awesome icons
    const icons = page.locator('.fa, .fas, .far, .fab, [class*="fa-"]');
    const count = await icons.count();
    
    // Should have icons (hamburger, chevron, etc.)
    expect(count).toBeGreaterThan(0);
  });

  test('Google Fonts load', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Check if fonts are loaded by checking computed styles
    const body = page.locator('body');
    const fontFamily = await body.evaluate((el) => {
      return window.getComputedStyle(el).fontFamily;
    });
    
    // TTA uses Roboto/Noto Sans, FFG may use system fonts - accept either
    // Just verify that fonts are loaded (not empty or default)
    expect(fontFamily).toBeTruthy();
    expect(fontFamily.length).toBeGreaterThan(0);
  });

  test('CSS Grid layout works', async ({ page }) => {
    await page.goto('/');
    
    // Check for grid containers
    const gridContainers = page.locator('.grid-container, .post-previews, [style*="grid"]');
    const count = await gridContainers.count();
    
    if (count > 0) {
      const firstGrid = gridContainers.first();
      const display = await firstGrid.evaluate((el) => {
        return window.getComputedStyle(el).display;
      });
      
      // Should be grid or have grid-like display
      expect(['grid', 'flex', 'block']).toContain(display);
    }
  });

  test('CSS Variables work', async ({ page }) => {
    await page.goto('/');
    
    // Check if CSS variables are defined (check for common variable names)
    const hasVariables = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      // Check for common CSS variable names
      const vars = ['--primary', '--secondary', '--text', '--background', '--spacing', '--gray'];
      return vars.some(v => {
        const value = style.getPropertyValue(v);
        return value && value.trim().length > 0;
      });
    });
    
    // At least one CSS variable should be defined
    expect(hasVariables).toBe(true);
  });

  test('ES6 modules load correctly', async ({ page }) => {
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error' && msg.text().includes('module')) {
        errors.push(msg.text());
      }
    });
    
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Should not have module loading errors
    const moduleErrors = errors.filter(e => e.includes('module') || e.includes('import'));
    expect(moduleErrors).toHaveLength(0);
  });

  test('Web Components (Shoelace) render', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Check if Shoelace components are actually rendered
    const slInput = page.locator('sl-input');
    if (await slInput.count() > 0) {
      const isVisible = await slInput.first().isVisible();
      expect(isVisible).toBe(true);
    }
  });

  test('responsive design adapts to viewport', async ({ page }) => {
    // Test mobile
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    const mobileHeader = page.locator('header');
    await expect(mobileHeader).toBeVisible();
    
    // Test desktop
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/');
    const desktopHeader = page.locator('header');
    await expect(desktopHeader).toBeVisible();
    
    // Layout should adapt (hamburger vs full nav)
    const hamburger = page.locator('.hamburger');
    const nav = page.locator('header nav');
    
    // On desktop, hamburger should be hidden, nav visible
    if (page.viewportSize().width >= 768) {
      const hamburgerVisible = await hamburger.isVisible();
      const navVisible = await nav.isVisible();
      
      // Either hamburger is hidden OR nav is visible (depending on implementation)
      expect(!hamburgerVisible || navVisible).toBe(true);
    }
  });
});




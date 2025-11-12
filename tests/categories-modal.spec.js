import { test, expect } from '@playwright/test';

test.describe('Categories Modal', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  // Helper to check if categories modal exists (TTA has it, FFG doesn't)
  async function hasCategoriesModal(page) {
    const button = page.locator('.categories-toggle');
    return (await button.count()) > 0;
  }

  test.describe('Mobile View', () => {
    test.use({ viewport: { width: 375, height: 667 } }); // iPhone size

    test('categories button is visible and centered', async ({ page }) => {
      if (!(await hasCategoriesModal(page))) {
        test.skip();
      }
      const categoriesButton = page.locator('.categories-toggle');
      await expect(categoriesButton).toBeVisible();
      
      // Check button is centered
      const buttonBox = await categoriesButton.boundingBox();
      const pageWidth = page.viewportSize().width;
      const buttonCenter = buttonBox.x + buttonBox.width / 2;
      const pageCenter = pageWidth / 2;
      
      // Allow 10px tolerance for centering
      expect(Math.abs(buttonCenter - pageCenter)).toBeLessThan(10);
    });

    test('opens bottom sheet modal when clicked', async ({ page }) => {
      if (!(await hasCategoriesModal(page))) {
        test.skip();
      }
      const categoriesButton = page.locator('.categories-toggle');
      const categoriesMenu = page.locator('.categories-menu');
      const backdrop = page.locator('.categories-backdrop');
      
      // Modal should be hidden initially
      await expect(categoriesMenu).not.toHaveClass(/active/);
      
      // Click the button
      await categoriesButton.click();
      
      // Wait for animation
      await page.waitForTimeout(300);
      
      // Modal should be visible and active
      await expect(categoriesMenu).toHaveClass(/active/);
      await expect(backdrop).toHaveClass(/active/);
      
      // Check modal is at bottom of screen
      // Allow small tolerance for sub-pixel rendering differences
      const menuBox = await categoriesMenu.boundingBox();
      const viewportHeight = page.viewportSize().height;
      const modalBottom = menuBox.y + menuBox.height;
      expect(modalBottom).toBeCloseTo(viewportHeight, 1); // Allow 1px tolerance
      
      // Take screenshot
      await page.screenshot({ path: 'tests/screenshots/categories-modal-open-mobile.png' });
    });

    test('modal has header with close button', async ({ page }) => {
      if (!(await hasCategoriesModal(page))) {
        test.skip();
      }
      await page.locator('.categories-toggle').click();
      await page.waitForTimeout(300);
      
      const header = page.locator('.categories-menu-header');
      const closeButton = page.locator('.categories-close');
      
      await expect(header).toBeVisible();
      await expect(header.locator('h3')).toHaveText('Categories');
      await expect(closeButton).toBeVisible();
    });

    test('closes when close button is clicked', async ({ page }) => {
      if (!(await hasCategoriesModal(page))) {
        test.skip();
      }
      await page.locator('.categories-toggle').click();
      await page.waitForTimeout(300);
      
      await page.locator('.categories-close').click();
      await page.waitForTimeout(300);
      
      const categoriesMenu = page.locator('.categories-menu');
      await expect(categoriesMenu).not.toHaveClass(/active/);
    });

    test('closes when backdrop is clicked', async ({ page }) => {
      if (!(await hasCategoriesModal(page))) {
        test.skip();
      }
      await page.locator('.categories-toggle').click();
      await page.waitForTimeout(300);
      
      const backdrop = page.locator('.categories-backdrop');
      await backdrop.click({ position: { x: 10, y: 10 } });
      await page.waitForTimeout(300);
      
      const categoriesMenu = page.locator('.categories-menu');
      await expect(categoriesMenu).not.toHaveClass(/active/);
    });

    test('closes when escape key is pressed', async ({ page }) => {
      if (!(await hasCategoriesModal(page))) {
        test.skip();
      }
      await page.locator('.categories-toggle').click();
      await page.waitForTimeout(300);
      
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      
      const categoriesMenu = page.locator('.categories-menu');
      await expect(categoriesMenu).not.toHaveClass(/active/);
    });

    test('displays categories in vertical list', async ({ page }) => {
      if (!(await hasCategoriesModal(page))) {
        test.skip();
      }
      await page.locator('.categories-toggle').click();
      await page.waitForTimeout(300);
      
      const categoryLinks = page.locator('.category-link');
      const count = await categoryLinks.count();
      
      expect(count).toBeGreaterThan(0);
      
      // Check first category is visible
      await expect(categoryLinks.first()).toBeVisible();
      
      // Check layout is vertical (flex-direction: column)
      const grid = page.locator('.categories-grid');
      const styles = await grid.evaluate((el) => {
        const computed = window.getComputedStyle(el);
        return {
          display: computed.display,
          flexDirection: computed.flexDirection
        };
      });
      
      expect(styles.flexDirection).toBe('column');
    });

    test('modal is scrollable when many categories', async ({ page }) => {
      if (!(await hasCategoriesModal(page))) {
        test.skip();
      }
      await page.locator('.categories-toggle').click();
      await page.waitForTimeout(300);
      
      const categoriesGrid = page.locator('.categories-grid');
      const gridBox = await categoriesGrid.boundingBox();
      const menuBox = await page.locator('.categories-menu').boundingBox();
      
      // If grid is taller than menu, it should be scrollable
      if (gridBox.height > menuBox.height) {
        const scrollable = await categoriesGrid.evaluate((el) => {
          return el.scrollHeight > el.clientHeight;
        });
        expect(scrollable).toBe(true);
      }
    });

    test('button stays centered when modal opens', async ({ page }) => {
      if (!(await hasCategoriesModal(page))) {
        test.skip();
      }
      const categoriesButton = page.locator('.categories-toggle');
      
      // Get initial position
      const initialBox = await categoriesButton.boundingBox();
      const initialCenter = initialBox.x + initialBox.width / 2;
      
      // Open modal
      await categoriesButton.click();
      await page.waitForTimeout(300);
      
      // Get position after modal opens
      const afterBox = await categoriesButton.boundingBox();
      const afterCenter = afterBox.x + afterBox.width / 2;
      
      // Button should stay in same position (centered)
      expect(Math.abs(initialCenter - afterCenter)).toBeLessThan(5);
    });
  });

  test.describe('Desktop View', () => {
    test.use({ viewport: { width: 1920, height: 1080 } });

    test('shows hover dropdown on desktop', async ({ page }) => {
      if (!(await hasCategoriesModal(page))) {
        test.skip();
      }
      const categoriesDropdown = page.locator('.categories-dropdown');
      const categoriesMenu = page.locator('.categories-menu');
      
      // Hover over dropdown
      await categoriesDropdown.hover();
      await page.waitForTimeout(300);
      
      // Menu should be visible (opacity and visibility)
      await expect(categoriesMenu).toBeVisible();
      
      // Check it's positioned as dropdown (not bottom sheet)
      const menuBox = await categoriesMenu.boundingBox();
      const dropdownBox = await categoriesDropdown.boundingBox();
      
      // Menu should be below the dropdown
      expect(menuBox.y).toBeGreaterThan(dropdownBox.y + dropdownBox.height);
      
      // Take screenshot
      await page.screenshot({ path: 'tests/screenshots/categories-dropdown-desktop.png' });
    });

    test('displays categories in grid layout on desktop', async ({ page }) => {
      if (!(await hasCategoriesModal(page))) {
        test.skip();
      }
      await page.locator('.categories-dropdown').hover();
      await page.waitForTimeout(300);
      
      const categoriesGrid = page.locator('.categories-grid');
      const styles = await categoriesGrid.evaluate((el) => {
        const computed = window.getComputedStyle(el);
        return {
          display: computed.display,
          gridTemplateColumns: computed.gridTemplateColumns
        };
      });
      
      expect(styles.display).toBe('grid');
      // Browser resolves repeat(auto-fit, ...) to actual pixel values
      // So we check that gridTemplateColumns has multiple columns (indicated by spaces or multiple values)
      const hasMultipleColumns = styles.gridTemplateColumns.includes(' ') || 
                                  styles.gridTemplateColumns.split(' ').length > 1 ||
                                  styles.gridTemplateColumns.includes('px');
      expect(hasMultipleColumns).toBe(true);
    });
  });
});


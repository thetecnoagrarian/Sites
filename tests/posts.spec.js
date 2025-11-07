import { test, expect } from '@playwright/test';

test.describe('Post Pages', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to homepage first to get a post link
    await page.goto('/');
  });

  test('post links are visible on homepage', async ({ page }) => {
    // Look for post previews or links
    const postLinks = page.locator('a[href^="/post/"], .post-previews a, sl-card a');
    const count = await postLinks.count();
    
    if (count > 0) {
      await expect(postLinks.first()).toBeVisible();
    } else {
      // If no posts, that's okay - just skip this test
      test.skip();
    }
  });

  test('can navigate to a post page', async ({ page }) => {
    const postLinks = page.locator('a[href^="/post/"], .post-previews a, sl-card a');
    const count = await postLinks.count();
    
    if (count > 0) {
      const firstPostLink = postLinks.first();
      const href = await firstPostLink.getAttribute('href');
      
      if (href) {
        await firstPostLink.click();
        await page.waitForLoadState('networkidle');
        
        // Should be on a post page
        await expect(page).toHaveURL(/\/post\//);
      }
    } else {
      test.skip();
    }
  });

  test('post page displays content', async ({ page }) => {
    // Try to find and navigate to a post
    const postLinks = page.locator('a[href^="/post/"], .post-previews a, sl-card a');
    const count = await postLinks.count();
    
    if (count > 0) {
      await postLinks.first().click();
      await page.waitForLoadState('networkidle');
      
      // Check for common post content elements
      const hasContent = await page.locator('article, .post-content, .content, main').count() > 0;
      expect(hasContent).toBe(true);
    } else {
      test.skip();
    }
  });

  test('images on post page are visible', async ({ page }) => {
    const postLinks = page.locator('a[href^="/post/"], .post-previews a, sl-card a');
    const count = await postLinks.count();
    
    if (count > 0) {
      await postLinks.first().click();
      await page.waitForLoadState('networkidle');
      
      // Check for images
      const images = page.locator('img');
      const imageCount = await images.count();
      
      if (imageCount > 0) {
        // Check first image is visible and has valid src
        const firstImage = images.first();
        await expect(firstImage).toBeVisible();
        const src = await firstImage.getAttribute('src');
        expect(src).toBeTruthy();
      }
    } else {
      test.skip();
    }
  });

  test('lightbox functionality works', async ({ page }) => {
    const postLinks = page.locator('a[href^="/post/"], .post-previews a, sl-card a');
    const count = await postLinks.count();
    
    if (count > 0) {
      await postLinks.first().click();
      await page.waitForLoadState('networkidle');
      
      // Look for images with lightbox trigger class
      const lightboxImages = page.locator('.lightbox-trigger, img[class*="lightbox"]');
      const lightboxCount = await lightboxImages.count();
      
      if (lightboxCount > 0) {
        const lightboxOverlay = page.locator('#lightbox-overlay');
        
        // Click first lightbox image
        await lightboxImages.first().click();
        await page.waitForTimeout(300);
        
        // Check if lightbox opened
        const isVisible = await lightboxOverlay.isVisible();
        expect(isVisible).toBe(true);
        
        // Close lightbox
        const closeButton = page.locator('#lightbox-close');
        if (await closeButton.count() > 0) {
          await closeButton.click();
          await page.waitForTimeout(300);
          await expect(lightboxOverlay).not.toBeVisible();
        }
      } else {
        test.skip();
      }
    } else {
      test.skip();
    }
  });

  test('no console errors on post page', async ({ page }) => {
    const postLinks = page.locator('a[href^="/post/"], .post-previews a, sl-card a');
    const count = await postLinks.count();
    
    if (count > 0) {
      const errors = [];
      page.on('console', msg => {
        if (msg.type() === 'error') {
          errors.push(msg.text());
        }
      });
      
      await postLinks.first().click();
      await page.waitForLoadState('networkidle');
      
      expect(errors).toHaveLength(0);
    } else {
      test.skip();
    }
  });
});




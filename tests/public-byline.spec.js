import { test, expect } from '@playwright/test';

const sites = [
  { name: 'FFG', baseURL: 'http://127.0.0.1:4000' },
  { name: 'TTA', baseURL: 'http://127.0.0.1:4002' }
];

for (const site of sites) {
  test(`${site.name} homepage and detail render reviewed ordered Public People only`, async ({ page }) => {
    await page.goto(`${site.baseURL}/`);
    const card = page.locator('sl-card', { hasText: 'Local Test Post' });
    await expect(card).toBeVisible();
    const homeByline = card.locator('.public-byline');
    await expect(homeByline).toHaveText(
      'By: Mode B Author One, Mode B Author Two, and Mode B Author Three');
    await expect(homeByline.locator('a')).toHaveCount(1);
    await expect(homeByline.locator('a')).toHaveAttribute(
      'href', 'https://example.test/mode-b-author-one');
    await expect(card.locator('a a')).toHaveCount(0);
    const summaryLink = card.locator('.post-summary-link');
    await expect(summaryLink).toHaveAttribute('href', '/post/local-test-post');
    await summaryLink.evaluate(element => element.focus());
    await expect.poll(() => page.evaluate(
      () => document.activeElement?.getAttribute('href'))).toBe('/post/local-test-post');
    await page.keyboard.press('Tab');
    await expect.poll(() => page.evaluate(
      () => document.activeElement?.getAttribute('href')))
      .toBe('https://example.test/mode-b-author-one');
    await expect(card).toContainText('Event: January 8, 2026');

    const soleAuthorCard = page.locator('sl-card', { hasText: 'Local Pagination Post 7' });
    await expect(soleAuthorCard.locator('.public-byline')).toHaveText('By: Mode B Author One');

    await page.goto(`${site.baseURL}/post/local-pagination-post-7`);
    await expect(page.locator('.post-header .public-byline')).toHaveText('By: Mode B Author One');
    await expect(page.locator('.post-header')).toContainText('Event: January 7, 2026');

    await page.goto(`${site.baseURL}/post/local-test-post`);
    await expect(page.locator('.post-header .public-byline')).toHaveText(
      'By: Mode B Author One, Mode B Author Two, and Mode B Author Three');
    await expect(page.locator('.post-header')).toContainText('Event: January 8, 2026');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href', `${site.baseURL}/post/local-test-post`);
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', 'Local Test Post');
    await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(0);
  });

  test(`${site.name} unresolved authorship omits legacy username fallback`, async ({ page }) => {
    for (const slug of ['local-unreviewed-legacy-author', 'local-unavailable-legacy-author']) {
      await page.goto(`${site.baseURL}/post/${slug}`);
      await expect(page.locator('.post-header .public-byline')).toHaveCount(0);
      await expect(page.locator('.post-header')).not.toContainText('mode-b-multer-admin');
      await expect(page.locator('.post-header')).toContainText('Event:');
      await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(0);
    }
  });
}

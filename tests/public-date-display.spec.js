import { test, expect } from '@playwright/test';

const sites = [
  { name: 'FFG', baseURL: 'http://127.0.0.1:4000' },
  { name: 'TTA', baseURL: 'http://127.0.0.1:4002' }
];

async function expectEventOnlyCards(page, url) {
  await page.goto(url);
  const metadata = page.locator('sl-card .post-meta');
  await expect(metadata.first()).toContainText('Event:');
  await expect(page.locator('sl-card .post-meta', { hasText: 'Posted:' })).toHaveCount(0);
  await expect(page.locator('sl-card .post-meta', { hasText: 'Published:' })).toHaveCount(0);
}

for (const site of sites) {
  test(`${site.name} cards expose Event only`, async ({ page }) => {
    await expectEventOnlyCards(page, `${site.baseURL}/`);
    await expect(page.locator('sl-card a a')).toHaveCount(0);

    await expectEventOnlyCards(page,
      `${site.baseURL}/category/local-test-category`);
    await expectEventOnlyCards(page,
      `${site.baseURL}/search?q=isolated-harness-search-marker`);
  });

  test(`${site.name} detail conditionally exposes reviewed late publication`, async ({ page }) => {
    const templateErrors = [];
    page.on('pageerror', error => templateErrors.push(error.message));

    await page.goto(`${site.baseURL}/post/local-test-post`);
    const sameDayHeader = page.locator('.post-header');
    await expect(sameDayHeader).toContainText('Event: January 8, 2026');
    await expect(sameDayHeader).not.toContainText('Published:');
    await expect(sameDayHeader).not.toContainText('Posted:');
    await expect(sameDayHeader).not.toContainText('Updated:');
    await expect(sameDayHeader.locator('.public-byline')).toHaveText(
      'By: Mode B Author One, Mode B Author Two, and Mode B Author Three');

    await page.goto(`${site.baseURL}/post/local-pagination-post-7`);
    const lateHeader = page.locator('.post-header');
    await expect(lateHeader).toContainText('Event: January 7, 2026');
    await expect(lateHeader).toContainText('Published: February 7, 2026');
    await expect(lateHeader).not.toContainText('Posted:');
    await expect(lateHeader).not.toContainText('Updated:');
    await expect(lateHeader.locator('.public-byline')).toHaveText('By: Mode B Author One');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href', `${site.baseURL}/post/local-pagination-post-7`);
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      'content', 'Local Pagination Post 7');
    await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(1);

    await page.goto(`${site.baseURL}/post/local-unreviewed-legacy-author`);
    const unreviewedHeader = page.locator('.post-header');
    await expect(unreviewedHeader).toContainText('Event:');
    await expect(unreviewedHeader).not.toContainText('Published:');
    await expect(unreviewedHeader).not.toContainText('Posted:');
    expect(templateErrors).toEqual([]);
  });
}

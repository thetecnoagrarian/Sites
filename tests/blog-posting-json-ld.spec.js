import { test, expect } from '@playwright/test';

const sites = [
  { name: 'FFG', baseURL: 'http://127.0.0.1:4000' },
  { name: 'TTA', baseURL: 'http://127.0.0.1:4002' }
];

async function openJsonLd(page, url) {
  await page.goto(url);
  const scripts = page.locator('script[type="application/ld+json"]');
  await expect(scripts).toHaveCount(1);
  return JSON.parse(await scripts.textContent());
}

for (const site of sites) {
  test.describe(`${site.name} factual BlogPosting JSON-LD`, () => {
    test('appears on detail pages only', async ({ page }) => {
      for (const path of ['/', '/category/local-test-category',
        '/search?q=isolated-harness-search-marker']) {
        await page.goto(`${site.baseURL}${path}`);
        await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(0);
      }
      await openJsonLd(page,
        `${site.baseURL}/post/local-reviewed-author-unreviewed-publication`);
    });

    test('reviewed author does not create unsupported publication or publisher facts', async ({ page }) => {
      const url = `${site.baseURL}/post/local-reviewed-author-unreviewed-publication`;
      const jsonLd = await openJsonLd(page, url);
      expect(jsonLd).toMatchObject({
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: 'Local Reviewed Author Unreviewed Publication',
        description: 'Synthetic reviewed-author description.',
        url,
        mainEntityOfPage: { '@type': 'WebPage', '@id': url },
        author: [{
          '@type': 'Person',
          name: 'Mode B Author One',
          url: 'https://example.test/mode-b-author-one'
        }]
      });
      expect(jsonLd).not.toHaveProperty('datePublished');
      expect(jsonLd).not.toHaveProperty('dateModified');
      expect(jsonLd).not.toHaveProperty('publisher');
      expect(JSON.stringify(jsonLd)).not.toContain('2020-01-01');
      await expect(page.locator('h1')).toHaveText(jsonLd.headline);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', jsonLd.url);
      await expect(page.locator('.post-header .public-byline')).toHaveText('By: Mode B Author One');
    });

    test('FFG3-like owner-attested date-only fact emits its literal date', async ({ page }) => {
      const url = `${site.baseURL}/post/local-ffg3-publication`;
      const jsonLd = await openJsonLd(page, url);
      expect(jsonLd.datePublished).toBe('2024-09-22');
      expect(jsonLd.author.map(author => author.name)).toEqual(['Mode B Author One']);
      expect(jsonLd).not.toHaveProperty('publisher');
      expect(jsonLd).not.toHaveProperty('dateModified');
      expect(JSON.stringify(jsonLd)).not.toContain('2022-07-18');
      await expect(page.locator('.post-header')).toContainText('Event: July 18, 2022');
      await expect(page.locator('.post-header')).toContainText('Published: September 22, 2024');
    });

    test('metadata, ordered authors, explicit Person publisher, image, and UI threshold stay consistent', async ({ page, request }) => {
      const url = `${site.baseURL}/post/local-test-post`;
      const jsonLd = await openJsonLd(page, url);
      const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
      const description = await page.locator('meta[name="description"]').getAttribute('content');
      const ogImage = await page.locator('meta[property="og:image"]').getAttribute('content');

      expect(jsonLd.headline).toBe(await page.locator('h1').textContent());
      expect(jsonLd.url).toBe(canonical);
      expect(jsonLd.mainEntityOfPage['@id']).toBe(canonical);
      expect(jsonLd.description).toBe(description);
      expect(jsonLd.image).toBe(`${site.baseURL}/images/nostr.png`);
      expect(new URL(jsonLd.image).pathname).toBe(new URL(ogImage).pathname);
      if (site.name === 'FFG') expect(jsonLd.image).toBe(ogImage);
      expect((await request.get(jsonLd.image)).status()).toBe(200);
      expect(jsonLd.author.map(author => author.name)).toEqual([
        'Mode B Author One', 'Mode B Author Two', 'Mode B Author Three'
      ]);
      expect(jsonLd.publisher).toEqual({
        '@type': 'Person',
        name: 'Mode B Author One',
        url: 'https://example.test/mode-b-author-one'
      });
      expect(jsonLd.datePublished).toBe('2026-01-08');
      expect(jsonLd).not.toHaveProperty('dateModified');
      await expect(page.locator('.post-header')).not.toContainText('Published:');
      await expect(page.locator('.post-header .public-byline')).toHaveText(
        'By: Mode B Author One, Mode B Author Two, and Mode B Author Three');
    });
  });
}

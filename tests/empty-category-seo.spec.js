import { test, expect } from '@playwright/test';

const sites = [
  { name: 'TTA', baseUrl: 'http://127.0.0.1:4002' },
  { name: 'FFG', baseUrl: 'http://127.0.0.1:4000' },
];

for (const site of sites) {
  test.describe(`${site.name} empty-category policy`, () => {
    test('empty category remains available, noindex, canonical, and globally linked', async ({ request }) => {
      const categoryResponse = await request.get(`${site.baseUrl}/category/local-empty-category`);
      expect(categoryResponse.status()).toBe(200);

      const categoryHtml = await categoryResponse.text();
      expect(categoryHtml).toContain('<meta name="robots" content="noindex,follow">');
      expect(categoryHtml).toContain(
        `<link rel="canonical" href="${site.baseUrl}/category/local-empty-category">`
      );

      const homepageResponse = await request.get(`${site.baseUrl}/`);
      expect(homepageResponse.status()).toBe(200);
      expect(await homepageResponse.text()).toContain(
        'href="/category/local-empty-category"'
      );
    });

    test('populated category remains indexable, canonical, and sitemap-listed', async ({ request }) => {
      const categoryResponse = await request.get(`${site.baseUrl}/category/local-test-category`);
      expect(categoryResponse.status()).toBe(200);

      const categoryHtml = await categoryResponse.text();
      expect(categoryHtml).not.toContain('<meta name="robots"');
      expect(categoryHtml).toContain(
        `<link rel="canonical" href="${site.baseUrl}/category/local-test-category">`
      );

      const sitemapResponse = await request.get(`${site.baseUrl}/sitemap.xml`);
      expect(sitemapResponse.status()).toBe(200);

      const sitemapXml = await sitemapResponse.text();
      expect(sitemapXml).toContain(
        `<loc>${site.baseUrl}/category/local-test-category</loc>`
      );
      expect(sitemapXml).not.toContain(
        `<loc>${site.baseUrl}/category/local-empty-category</loc>`
      );
    });

    test('site health remains good', async ({ request }) => {
      const response = await request.get(`${site.baseUrl}/health`);
      expect(response.status()).toBe(200);
    });

    test('unknown categories remain 404 and category crawling remains allowed', async ({ request }) => {
      const categoryResponse = await request.get(`${site.baseUrl}/category/not-a-real-category`);
      expect(categoryResponse.status()).toBe(404);

      const robotsResponse = await request.get(`${site.baseUrl}/robots.txt`);
      expect(robotsResponse.status()).toBe(200);
      expect(await robotsResponse.text()).not.toMatch(/Disallow:\s*\/category/i);
    });
  });
}

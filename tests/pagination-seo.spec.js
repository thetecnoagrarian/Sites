import { test, expect } from '@playwright/test';

const sites = [
  { name: 'TTA', baseUrl: 'http://127.0.0.1:4002' },
  { name: 'FFG', baseUrl: 'http://127.0.0.1:4000' },
];

const extractPostSlugs = (html) => (
  [...html.matchAll(/href="\/post\/([^"]+)"/g)].map((match) => match[1])
);

const normalizeAttributeEntities = (html) => (
  html.replaceAll('&#x3D;', '=').replaceAll('&amp;', '&')
);

for (const site of sites) {
  test.describe(`${site.name} pagination and indexability`, () => {
    test('homepage page one and two are distinct, canonical, and linked', async ({ request }) => {
      const firstResponse = await request.get(`${site.baseUrl}/`);
      expect(firstResponse.status()).toBe(200);
      const firstHtml = normalizeAttributeEntities(await firstResponse.text());
      expect(firstHtml).toContain(`<link rel="canonical" href="${site.baseUrl}/">`);
      expect(firstHtml).toContain('href="/?page=2"');
      expect(firstHtml).toContain('>Next</a>');

      const explicitFirstResponse = await request.get(`${site.baseUrl}/?page=1`);
      expect(explicitFirstResponse.status()).toBe(200);
      expect(normalizeAttributeEntities(await explicitFirstResponse.text())).toContain(
        `<link rel="canonical" href="${site.baseUrl}/">`
      );

      const secondResponse = await request.get(`${site.baseUrl}/?page=2`);
      expect(secondResponse.status()).toBe(200);
      const secondHtml = normalizeAttributeEntities(await secondResponse.text());
      expect(secondHtml).toContain(
        `<link rel="canonical" href="${site.baseUrl}/?page=2">`
      );
      expect(secondHtml).toContain('href="/"');
      expect(secondHtml).toContain('>Previous</a>');

      const firstSlugs = extractPostSlugs(firstHtml);
      const secondSlugs = extractPostSlugs(secondHtml);
      expect(firstSlugs).toHaveLength(6);
      expect(secondSlugs).toHaveLength(2);
      expect(secondSlugs.some((slug) => firstSlugs.includes(slug))).toBe(false);
    });

    test('homepage rejects malformed and out-of-range pages', async ({ request }) => {
      for (const page of ['0', '-1', 'abc', '1.5', '01', '999999999999999999999']) {
        const response = await request.get(`${site.baseUrl}/?page=${page}`);
        expect(response.status()).toBe(404);
      }

      const response = await request.get(`${site.baseUrl}/?page=3`);
      expect(response.status()).toBe(404);
    });

    test('populated category has distinct canonical pages and rejects overflow', async ({ request }) => {
      const categoryPath = '/category/local-test-category';
      const firstResponse = await request.get(`${site.baseUrl}${categoryPath}`);
      expect(firstResponse.status()).toBe(200);
      const firstHtml = normalizeAttributeEntities(await firstResponse.text());
      expect(firstHtml).toContain(`href="${categoryPath}?page=2"`);
      expect(firstHtml).toContain(
        `<link rel="canonical" href="${site.baseUrl}${categoryPath}">`
      );

      const secondResponse = await request.get(`${site.baseUrl}${categoryPath}?page=2`);
      expect(secondResponse.status()).toBe(200);
      const secondHtml = normalizeAttributeEntities(await secondResponse.text());
      expect(secondHtml).toContain(
        `<link rel="canonical" href="${site.baseUrl}${categoryPath}?page=2">`
      );
      expect(secondHtml).toContain(`href="${categoryPath}"`);
      expect(extractPostSlugs(firstHtml)).toHaveLength(6);
      expect(extractPostSlugs(secondHtml)).toHaveLength(2);

      const overflowResponse = await request.get(`${site.baseUrl}${categoryPath}?page=3`);
      expect(overflowResponse.status()).toBe(404);
    });

    test('search is paginated for users and always noindex,follow', async ({ request }) => {
      const query = 'isolated-harness-search-marker';
      const firstPath = `/search?q=${query}`;
      const secondPath = `${firstPath}&page=2`;

      const firstResponse = await request.get(`${site.baseUrl}${firstPath}`);
      expect(firstResponse.status()).toBe(200);
      const firstHtml = normalizeAttributeEntities(await firstResponse.text());
      expect(firstHtml).toContain('<meta name="robots" content="noindex,follow">');
      expect(firstHtml).toContain(
        `<link rel="canonical" href="${site.baseUrl}${firstPath}">`
      );
      expect(firstHtml).toContain(`href="/search?q=${query}&page=2"`);

      const secondResponse = await request.get(`${site.baseUrl}${secondPath}`);
      expect(secondResponse.status()).toBe(200);
      const secondHtml = normalizeAttributeEntities(await secondResponse.text());
      expect(secondHtml).toContain('<meta name="robots" content="noindex,follow">');
      expect(secondHtml).toContain(
        `<link rel="canonical" href="${site.baseUrl}/search?q=${query}&page=2">`
      );
      expect(extractPostSlugs(firstHtml)).toHaveLength(6);
      expect(extractPostSlugs(secondHtml)).toHaveLength(2);
      expect(extractPostSlugs(secondHtml).some((slug) => extractPostSlugs(firstHtml).includes(slug))).toBe(false);

      const overflowResponse = await request.get(`${site.baseUrl}${firstPath}&page=3`);
      expect(overflowResponse.status()).toBe(404);

      const malformedResponse = await request.get(`${site.baseUrl}${firstPath}&page=abc`);
      expect(malformedResponse.status()).toBe(404);
    });

    test('sitemap keeps base URLs and excludes pagination and search URLs', async ({ request }) => {
      const response = await request.get(`${site.baseUrl}/sitemap.xml`);
      expect(response.status()).toBe(200);
      const sitemapXml = await response.text();

      expect(sitemapXml).toContain(`<loc>${site.baseUrl}/</loc>`);
      expect(sitemapXml).toContain(
        `<loc>${site.baseUrl}/category/local-test-category</loc>`
      );
      expect(sitemapXml).not.toContain('?page=');
      expect(sitemapXml).not.toContain('/search');
    });
  });
}

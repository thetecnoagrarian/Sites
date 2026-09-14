import { test, expect } from '@playwright/test';

const sites = [
  {
    name: 'TTA',
    baseUrl: 'http://127.0.0.1:4002',
    homeDescription: 'Exploring the intersection of technology and horticulture',
    renderedHomeDescription: 'Exploring the intersection of technology and horticulture',
    aboutDescription: 'Learn how The Tecnoagrarian explores practical technology, sustainable growing, automation, and the future of food production.'
  },
  {
    name: 'FFG',
    baseUrl: 'http://127.0.0.1:4000',
    homeDescription: 'A blog about our adventure building our homestead on a undeveloped 20 acres in Michigan\'s Upper Peninsula.',
    renderedHomeDescription: 'A blog about our adventure building our homestead on a undeveloped 20 acres in Michigan&#x27;s Upper Peninsula.',
    aboutDescription: 'Meet Mike and Lou and follow their off-grid homestead, forest garden, DIY systems, and self-reliant life in Michigan’s Upper Peninsula.'
  }
];

const descriptionTags = (html) => html.match(/<meta name="description" content="[^"]*">/g) || [];
const normalizeAttributeEntities = (html) => html.replaceAll('&#x3D;', '=');

for (const site of sites) {
  test.describe(`${site.name} conventional meta descriptions`, () => {
    test('homepage has one nonempty description while canonical and Open Graph remain stable', async ({ request }) => {
      const response = await request.get(`${site.baseUrl}/`);
      expect(response.status()).toBe(200);
      const html = await response.text();

      expect(descriptionTags(html)).toHaveLength(1);
      expect(html).toContain(`<meta name="description" content="${site.renderedHomeDescription}">`);
      expect(html).toContain(`<link rel="canonical" href="${site.baseUrl}/">`);
      expect(html).toContain(`<meta property="og:description" content="${site.homeDescription}" />`);
    });

    test('homepage pagination receives a distinct description without changing its canonical', async ({ request }) => {
      const response = await request.get(`${site.baseUrl}/?page=2`);
      expect(response.status()).toBe(200);
      const html = await response.text();

      expect(descriptionTags(html)).toHaveLength(1);
      expect(descriptionTags(html)[0]).toContain('Page 2.');
      expect(normalizeAttributeEntities(html)).toContain(
        `<link rel="canonical" href="${site.baseUrl}/?page=2">`
      );
    });

    test('About has one page-specific description and keeps its canonical', async ({ request }) => {
      const response = await request.get(`${site.baseUrl}/about`);
      expect(response.status()).toBe(200);
      const html = await response.text();

      expect(descriptionTags(html)).toHaveLength(1);
      expect(html).toContain(`<meta name="description" content="${site.aboutDescription}">`);
      expect(html).toContain(`<link rel="canonical" href="${site.baseUrl}/about">`);
    });

    test('posts use editorial description data without changing Open Graph', async ({ request }) => {
      const response = await request.get(`${site.baseUrl}/post/local-pagination-post-1`);
      expect(response.status()).toBe(200);
      const html = await response.text();

      expect(descriptionTags(html)).toEqual([
        '<meta name="description" content="Synthetic pagination description.">'
      ]);
      expect(html).toContain('<meta property="og:description" content="Synthetic pagination description." />');
      expect(html).toContain(`<link rel="canonical" href="${site.baseUrl}/post/local-pagination-post-1">`);
    });

    test('post fallback strips markup and lets Handlebars escape attribute punctuation', async ({ request }) => {
      const response = await request.get(`${site.baseUrl}/post/local-test-post`);
      expect(response.status()).toBe(200);
      const html = await response.text();

      expect(descriptionTags(html)).toEqual([
        '<meta name="description" content="A &quot;quoted&quot; &amp; HTML-like summary for safe metadata.">'
      ]);
      expect(descriptionTags(html)[0]).not.toContain('<em>');
    });

    test('category and noindex pages intentionally omit boilerplate descriptions', async ({ request }) => {
      const populatedResponse = await request.get(`${site.baseUrl}/category/local-test-category`);
      expect(populatedResponse.status()).toBe(200);
      const populatedHtml = await populatedResponse.text();
      expect(descriptionTags(populatedHtml)).toHaveLength(0);
      expect(populatedHtml).toContain(`<link rel="canonical" href="${site.baseUrl}/category/local-test-category">`);

      const emptyResponse = await request.get(`${site.baseUrl}/category/local-empty-category`);
      expect(emptyResponse.status()).toBe(200);
      const emptyHtml = await emptyResponse.text();
      expect(descriptionTags(emptyHtml)).toHaveLength(0);
      expect(emptyHtml).toContain('<meta name="robots" content="noindex,follow">');

      const searchResponse = await request.get(`${site.baseUrl}/search?q=isolated-harness-search-marker`);
      expect(searchResponse.status()).toBe(200);
      const searchHtml = await searchResponse.text();
      expect(descriptionTags(searchHtml)).toHaveLength(0);
      expect(searchHtml).toContain('<meta name="robots" content="noindex,follow">');
    });

    test('login remains outside public description coverage', async ({ request }) => {
      const response = await request.get(`${site.baseUrl}/login`);
      expect(response.status()).toBe(200);
      expect(descriptionTags(await response.text())).toHaveLength(0);
    });
  });
}

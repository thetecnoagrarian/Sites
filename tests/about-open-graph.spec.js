import { test, expect } from '@playwright/test';

const sites = [
  {
    name: 'TTA',
    baseUrl: 'http://127.0.0.1:4002',
    aboutTitle: 'About The Tecnoagrarian',
    aboutDescription: 'Learn how The Tecnoagrarian explores practical technology, sustainable growing, automation, and the future of food production.',
    homeTitle: 'The Tecnoagrarian',
    homeDescription: 'Exploring the intersection of technology and horticulture',
    homeOgUrl: 'https://www.thetecnoagrarian.com/',
    postOgUrl: 'https://www.thetecnoagrarian.com/post/local-pagination-post-1'
  },
  {
    name: 'FFG',
    baseUrl: 'http://127.0.0.1:4000',
    aboutTitle: 'About Fruition Forest Garden',
    aboutDescription: 'Meet Mike and Lou and follow their off-grid homestead, forest garden, DIY systems, and self-reliant life in Michigan’s Upper Peninsula.',
    homeTitle: 'Fruition Forest Garden',
    homeDescription: 'A blog about our adventure building our homestead on a undeveloped 20 acres in Michigan\'s Upper Peninsula.',
    homeOgUrl: 'http://127.0.0.1:4000/',
    postOgUrl: 'http://127.0.0.1:4000/post/local-pagination-post-1'
  }
];

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const propertyValues = (html, property) => (
  [...html.matchAll(new RegExp(`<meta property="${escapeRegex(property)}" content="([^"]*)" \\/>`, 'g'))]
    .map((match) => match[1])
);
const namedValues = (html, name) => (
  [...html.matchAll(new RegExp(`<meta name="${escapeRegex(name)}" content="([^"]*)" \\/>`, 'g'))]
    .map((match) => match[1])
);
const conventionalDescriptions = (html) => html.match(/<meta name="description" content="[^"]*">/g) || [];

test.describe('FFG optimized hero delivery', () => {
  const baseUrl = 'http://127.0.0.1:4000';
  const optimizedHero = `${baseUrl}/images/HeroCamp.webp`;
  const optimizedSocial = `${baseUrl}/images/HeroCamp-og.webp`;

  for (const pageCase of [
    { name: 'homepage', path: '/', selector: '.hero-image' },
    { name: 'About', path: '/about', selector: '.about-image' }
  ]) {
    test(`${pageCase.name} uses the optimized eager hero with intrinsic dimensions`, async ({ page }) => {
      const requestedImages = [];
      page.on('request', (request) => {
        if (request.resourceType() === 'image') requestedImages.push(request.url());
      });

      const heroResponse = page.waitForResponse((response) => response.url() === optimizedHero);
      const response = await page.goto(`${baseUrl}${pageCase.path}`);
      expect(response.status()).toBe(200);
      expect((await heroResponse).status()).toBe(200);

      const hero = page.locator(pageCase.selector);
      await expect(hero).toHaveAttribute('src', '/images/HeroCamp.webp');
      await expect(hero).toHaveAttribute('width', '1920');
      await expect(hero).toHaveAttribute('height', '1440');
      await expect(hero).toHaveAttribute('loading', 'eager');
      await expect(hero).toHaveAttribute('fetchpriority', 'high');
      await expect(hero).toHaveAttribute('decoding', 'async');

      const geometry = await hero.evaluate((image) => ({
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        renderedWidth: image.getBoundingClientRect().width,
        renderedHeight: image.getBoundingClientRect().height,
        top: image.getBoundingClientRect().top,
        viewportHeight: window.innerHeight,
        objectFit: getComputedStyle(image).objectFit
      }));
      expect(geometry.naturalWidth).toBe(1920);
      expect(geometry.naturalHeight).toBe(1440);
      expect(geometry.renderedWidth).toBeGreaterThan(0);
      expect(geometry.renderedHeight).toBeGreaterThan(0);
      expect(geometry.top).toBeLessThan(geometry.viewportHeight);
      if (pageCase.name === 'homepage') {
        expect(geometry.objectFit).toBe('cover');
      } else {
        expect(geometry.renderedWidth / geometry.renderedHeight).toBeCloseTo(4 / 3, 1);
      }

      expect(requestedImages).toContain(optimizedHero);
      expect(requestedImages.some((url) => url.endsWith('/images/HeroCamp.png'))).toBe(false);
    });
  }

  test('homepage and About keep metadata semantics while using the optimized social image', async ({ request }) => {
    for (const pageCase of [
      { path: '/', canonical: `${baseUrl}/` },
      { path: '/about', canonical: `${baseUrl}/about` }
    ]) {
      const response = await request.get(`${baseUrl}${pageCase.path}`);
      expect(response.status()).toBe(200);
      const html = await response.text();

      expect(propertyValues(html, 'og:image')).toEqual([optimizedSocial]);
      expect(namedValues(html, 'twitter:image')).toEqual([optimizedSocial]);
      expect(html).toContain(`<link rel="canonical" href="${pageCase.canonical}">`);
      expect(conventionalDescriptions(html)).toHaveLength(1);
      expect(html).not.toContain('HeroCamp.png');
      expect(html).not.toContain('application/ld+json');
    }
  });
});

for (const site of sites) {
  test.describe(`${site.name} About Open Graph metadata`, () => {
    test('About has one accurate Open Graph identity and preserves canonical and conventional description', async ({ request }) => {
      const response = await request.get(`${site.baseUrl}/about`);
      expect(response.status()).toBe(200);
      const html = await response.text();

      expect(propertyValues(html, 'og:url')).toEqual([`${site.baseUrl}/about`]);
      expect(propertyValues(html, 'og:title')).toEqual([site.aboutTitle]);
      expect(propertyValues(html, 'og:description')).toEqual([site.aboutDescription]);
      expect(propertyValues(html, 'og:type')).toEqual(['website']);
      expect(propertyValues(html, 'og:image')).toHaveLength(1);
      expect(propertyValues(html, 'og:image:alt')).toHaveLength(1);
      expect(namedValues(html, 'twitter:title')).toEqual([site.aboutTitle]);
      expect(namedValues(html, 'twitter:description')).toEqual([site.aboutDescription]);
      expect(html).toContain(`<link rel="canonical" href="${site.baseUrl}/about">`);
      expect(conventionalDescriptions(html)).toEqual([
        `<meta name="description" content="${site.aboutDescription}">`
      ]);
    });

    test('homepage Open Graph defaults remain unchanged and unique', async ({ request }) => {
      const response = await request.get(`${site.baseUrl}/`);
      expect(response.status()).toBe(200);
      const html = await response.text();

      expect(propertyValues(html, 'og:url')).toEqual([site.homeOgUrl]);
      expect(propertyValues(html, 'og:title')).toEqual([site.homeTitle]);
      expect(propertyValues(html, 'og:description')).toEqual([site.homeDescription]);
      expect(propertyValues(html, 'og:type')).toEqual(['website']);
    });

    test('representative post Open Graph metadata remains unchanged and unique', async ({ request }) => {
      const response = await request.get(`${site.baseUrl}/post/local-pagination-post-1`);
      expect(response.status()).toBe(200);
      const html = await response.text();

      expect(propertyValues(html, 'og:url')).toEqual([site.postOgUrl]);
      expect(propertyValues(html, 'og:title')).toEqual(['Local Pagination Post 1']);
      expect(propertyValues(html, 'og:description')).toEqual(['Synthetic pagination description.']);
      expect(propertyValues(html, 'og:type')).toEqual(['article']);
    });
  });
}

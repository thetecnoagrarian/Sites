# SEO Crawlability Notes

This document records the sitemap and canonical URL changes added after the Fruition Forest Garden public crawler fix.

No secrets, private deployment details, real server targets, private key paths, or environment values are included here.

## Sitemap Endpoint

Both sites now get a public `GET /sitemap.xml` endpoint from shared `blog-core` app logic.

The sitemap response:

- returns XML
- uses the sitemap namespace `http://www.sitemaps.org/schemas/sitemap/0.9`
- includes the homepage
- includes `/about`
- includes public category URLs
- includes public post URLs
- includes `lastmod` for posts when `updated_at` or `created_at` is available

The sitemap excludes:

- `/admin`
- login/logout routes
- edit/create/delete routes
- upload/admin tools
- analytics dashboards
- static asset files
- runtime upload file URLs
- search-result URLs

Search pages are intentionally excluded from sitemap output because search result URLs vary by query and are lower-value crawl targets than canonical posts/categories.

## Robots.txt

Shared `robots.txt` generation now includes a `Sitemap:` line when the site has a configured public base URL.

Expected public shapes:

```text
User-agent: *
Allow: /
Sitemap: https://www.fruitionforestgarden.com/sitemap.xml
```

```text
User-agent: *
Allow: /
Sitemap: https://www.thetecnoagrarian.com/sitemap.xml
```

## Canonical URLs

Public page layouts now emit a canonical tag only when a public route provides `canonicalUrl`.

This avoids adding canonical tags to admin/auth pages by default.

Canonical roots:

- Fruition Forest Garden: `https://www.fruitionforestgarden.com`
- The Tecnoagrarian: `https://www.thetecnoagrarian.com`

Each site can override the public base URL with `BASE_URL`. Real `.env` files were not inspected and are not required for this behavior.

Canonical coverage:

- homepage: `/`
- about page: `/about`
- post pages: `/post/:slug`
- category pages: `/category/:slug`
- search page: `/search`

Search pages use the clean `/search` canonical URL and intentionally drop query-string noise.

## Public Versus Private Paths

Public crawlable paths:

- `/`
- `/about`
- `/post/:slug`
- `/category/:slug`
- `/search`
- `/robots.txt`
- `/sitemap.xml`

Private/protected paths that should remain out of the sitemap:

- `/admin`
- `/admin/analytics`
- admin create/edit/delete routes
- login/logout routes
- upload/admin tools
- analytics dashboards

## Data Model Note

Sitemap generation uses the same shared model methods used by public route code:

- `Post.findAll(...)`
- `Category.findAll()`

Safe source inspection did not find a clear published/draft state in the shared model methods used by public routes. The sitemap therefore mirrors currently public route behavior rather than adding a new publication filter.

Needs Review: if draft/private post state is added later, sitemap generation should filter to published public content only.

## Deployment And Verification

This change was not deployed by this documentation/code task.

After deployment, verify with public HTTP checks:

```bash
curl -I https://www.fruitionforestgarden.com/sitemap.xml
curl https://www.fruitionforestgarden.com/sitemap.xml | head -40
curl -L https://www.fruitionforestgarden.com/ | grep -Ei 'canonical|sitemap|noindex|nofollow'

curl -I https://www.thetecnoagrarian.com/sitemap.xml
curl https://www.thetecnoagrarian.com/sitemap.xml | head -40
curl -L https://www.thetecnoagrarian.com/ | grep -Ei 'canonical|sitemap|noindex|nofollow'
```

Expected:

- `/sitemap.xml` returns `200`
- sitemap response is XML
- homepage HTML includes the expected canonical URL
- public pages do not include `noindex` when indexing is intended
- admin/private routes remain protected

After live checks pass, submit these sitemaps in Google Search Console:

- `https://www.fruitionforestgarden.com/sitemap.xml`
- `https://www.thetecnoagrarian.com/sitemap.xml`

## Follow-Up Items

- Decide whether The Tecnoagrarian should be deployed to pick up shared crawler and sitemap behavior.
- Add a formal sitemap/canonical test later if a test harness is selected.
- Review whether canonical URL generation should be consolidated with Open Graph URL generation.
- Review CSP/source config later without exposing operational-sensitive values.
- Add published/draft filtering to sitemap generation if the content model gains explicit publication state.

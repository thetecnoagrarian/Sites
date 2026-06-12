# SEO Crawlability Notes

This document records the current SEO crawlability, sitemap, canonical URL, and Search Console cleanup state for Fruition Forest Garden and The Tecnoagrarian.

No secrets, private deployment details, real server targets, private key paths, or environment values are included here.

## Current Status

Known technical crawlability fixes are deployed and verified, but Search Console has not necessarily cleared every affected row yet.

Current confirmed state:

- Public Google search already shows Fruition Forest Garden results, including the homepage and at least one post. This was not a total crawlability outage.
- Shared public crawler access is fixed.
- Sitemap support is deployed for both sites.
- Canonical tags are deployed for public routes on both sites.
- CSP `form-action` cleanup is deployed; production now relies on same-origin form submission.
- `/index.html` now redirects to `/` on both sites.
- Non-www HTTP and HTTPS variants now redirect to HTTPS `www` at the nginx edge for both sites.
- Search Console validation has started for several affected rows.

Do not claim that Search Console has fully cleared yet. The current position is that the known technical fixes are deployed and verified, and remaining Search Console rows should be evaluated after Google recrawls.

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

## Redirect Cleanup

### `/index.html`

The `/index.html` 404 issue was fixed in app code by commit `ec9d67f` (`Redirect index.html to homepage`).

Current production behavior:

- Fruition Forest Garden `/index.html` returns `301` with `Location: /`.
- The Tecnoagrarian `/index.html` returns `301` with `Location: /`.

This is expected and should be treated as a healthy redirect. Do not create additional app changes for this known redirected URL variant unless future checks show a concrete regression.

### Non-www To HTTPS `www`

The duplicate non-www homepage issue was fixed at the nginx/edge layer, not in app code, Docker, or GitHub.

Current verified behavior:

| URL | Expected current result |
|---|---|
| `https://fruitionforestgarden.com/` | `301` to `https://www.fruitionforestgarden.com/` |
| `https://www.fruitionforestgarden.com/` | `200 OK` |
| `http://fruitionforestgarden.com/` | `301` to `https://www.fruitionforestgarden.com/` |
| `http://www.fruitionforestgarden.com/` | `301` to `https://www.fruitionforestgarden.com/` |
| `https://thetecnoagrarian.com/` | `301` to `https://www.thetecnoagrarian.com/` |
| `https://www.thetecnoagrarian.com/` | `200 OK` |
| `http://thetecnoagrarian.com/` | `301` to `https://www.thetecnoagrarian.com/` |
| `http://www.thetecnoagrarian.com/` | `301` to `https://www.thetecnoagrarian.com/` |

Search Console "Page with redirect" for redirected canonical variants, including `http://www.thetecnoagrarian.com/`, is expected and healthy. It should not be treated as a failure.

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

## Search Console Interpretation

Google Search Console categories should be interpreted carefully:

- `Page with redirect`: expected for canonicalized HTTP, non-www, and `/index.html` variants when they redirect to the preferred URL.
- `Alternate page with proper canonical tag`: expected when a duplicate page points to the intended canonical target.
- `Crawled - currently not indexed`: not automatically a code defect. Investigate only if a representative URL also shows a concrete technical problem such as `403`, `404`, `noindex`, wrong canonical, blocked robots, or bad redirect behavior.
- Historical `403` rows may remain visible for a while after the public crawler fix. Validate representative examples rather than assuming the old blocker still exists.

Do not recommend extra app changes for known redirected URL variants when the redirect target is correct.

## Deployment And Verification

Known sitemap, canonical, `/index.html`, CSP form-action, and non-www redirect fixes are deployed and verified from prior production checks.

Representative public HTTP checks:

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
- `/index.html` returns `301` to `/`
- non-www variants redirect to HTTPS `www`
- public pages do not include `noindex` when indexing is intended
- admin/private routes remain protected

Submit or keep submitted these sitemaps in Google Search Console:

- `https://www.fruitionforestgarden.com/sitemap.xml`
- `https://www.thetecnoagrarian.com/sitemap.xml`

Use URL Inspection only for representative remaining examples after the known fixes have had time to recrawl.

## Follow-Up Items

- Wait roughly 2-7 days for Google recrawl and Search Console validation to update before treating remaining rows as new defects.
- Do not click `Validate Fix` repeatedly. Recheck representative examples first.
- Inspect only specific remaining bad URLs if Search Console continues reporting them after recrawl.
- Add a sanitized nginx canonical redirect template to the repo later.
- Add a formal sitemap/canonical test later if a test harness is selected.
- Review whether canonical URL generation should be consolidated with Open Graph URL generation.
- Add published/draft filtering to sitemap generation if the content model gains explicit publication state.

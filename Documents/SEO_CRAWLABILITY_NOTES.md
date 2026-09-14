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
- includes public category URLs that have at least one publicly exposed post
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
- empty category URLs

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

- homepage page 1: `/`
- homepage page 2 and later: self-canonical URL including `?page=N`
- about page: `/about`
- post pages: `/post/:slug`
- category page 1: `/category/:slug`
- category page 2 and later: self-canonical URL including `?page=N`
- search pages: the current `/search?q=...` result URL, including `page=N` after page 1

Search pages emit `noindex,follow`. Their query and page parameters are retained
in canonical and pagination URLs so people can move through distinct result
sets without creating misleading duplicate pages for crawlers.

## Pagination Policy

Homepage, category, and search listings use six posts per page. Page numbers
must be positive decimal integers without alternate forms such as `0`, `01`,
negative values, decimals, or nonnumeric text. Invalid page values and pages
beyond the available result count return `404`.

`/?page=1` remains a compatible `200` response canonicalized to `/`. Templates
link page 1 directly to the clean base route. Valid homepage and category pages
from page 2 onward return `200`, show distinct offset results, use a
self-referencing canonical that includes `?page=N`, and expose crawlable
Previous, numbered-page, and Next links. Search pagination follows the same
result and navigation rules but remains `noindex,follow` and excluded from the
sitemap.

Paginated homepage, category, and search URLs are not added to `sitemap.xml`.
Their base indexable pages and post URLs continue using the existing sitemap
policy.

As of 2026-09-14, this pagination policy is implemented in the repository for
review but has not been deployed. Production retains the prior behavior until
a separately approved deployment.

## Conventional Meta Description Policy

The repository emits one conventional HTML meta description on homepage,
About, and individual post pages for both sites. Homepage descriptions reuse
each site's existing Open Graph site description; paginated homepage results
add their page number so indexable pages do not receive identical descriptions.
About pages use concise page-specific copy.

Post descriptions use the existing editorial `description` field, with
`excerpt` and sanitized post body text as fallbacks. Output is whitespace
normalized, stripped of HTML, limited to 160 characters, and escaped by the
page template. No new database or editor field is required.

Category records have no editorial description field. Category pages therefore
omit conventional meta descriptions instead of emitting repetitive generated
boilerplate. Empty categories retain `noindex,follow`; search pages remain
`noindex,follow`; and login/admin pages remain outside public description
coverage. Canonical, robots, sitemap, Open Graph, and Twitter policies are not
changed by this description policy.

As of 2026-09-14, this policy is implemented in the repository for review but
has not been deployed.

## About Open Graph Policy

About pages provide route-specific Open Graph metadata for both sites. Their
`og:url` matches the canonical `/about` URL, `og:title` identifies the About
page, and `og:description` reuses the same route-level description as the
conventional meta description. `og:type` remains `website`, and the existing
site-default image and image-alt behavior remains in place.

Homepage defaults and individual-post Open Graph behavior are unchanged.
Category and search social metadata remain outside this policy. Route-specific
static-page values are escaped before the Open Graph and matching Twitter
metadata strings are inserted into the rendered head.

As of 2026-09-14, this About Open Graph policy is implemented in the repository
for review but has not been deployed.

## Empty Category Policy

The repository implementation keeps configured empty categories available to
people and linked from normal category navigation. An empty category remains a
valid `200` route with its self-referencing canonical URL, but emits
`noindex,follow` and is excluded from `sitemap.xml` until it contains at least
one publicly exposed post.

This preserves intentional future taxonomy without presenting an empty listing
as indexable search content. Populated categories remain indexable and
sitemap-listed. `robots.txt` continues allowing category crawling so crawlers
can observe the robots directive and follow normal site links.

As of 2026-09-11, this behavior is implemented in the repository but has not
been deployed. Production remains unchanged until a separately approved
deployment.

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

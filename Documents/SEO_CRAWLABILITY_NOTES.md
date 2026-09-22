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
- The Tecnoagrarian domain-property sitemap was submitted on 2026-09-14 and
  reported `Success` with 12 discovered pages. This confirms sitemap processing,
  not indexing of every discovered URL.

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

As of 2026-09-14, this pagination policy is deployed and production-verified on
both sites.

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
boilerplate. Search pages also intentionally omit a conventional description
where no editorial source exists and remain `noindex,follow`. Empty categories
retain `noindex,follow`, and login/admin pages remain outside public description
coverage. Canonical, robots, sitemap, Open Graph, and Twitter policies are not
changed by this description policy.

As of 2026-09-14, this policy is deployed and production-verified on both sites.

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

As of production commit `f3fe658c1989634fe1d3fba4b20c8928e42571a8`, this
About Open Graph policy is deployed and verified. The production values are:

- The Tecnoagrarian: `og:url` is
  `https://www.thetecnoagrarian.com/about`, `og:title` is
  `About The Tecnoagrarian`, and `og:description` reuses the existing About
  description: `Learn how The Tecnoagrarian explores practical technology,
  sustainable growing, automation, and the future of food production.`
- Fruition Forest Garden: `og:url` is
  `https://www.fruitionforestgarden.com/about`, `og:title` is
  `About Fruition Forest Garden`, and `og:description` reuses the existing About
  description: `Meet Mike and Lou and follow their off-grid homestead, forest
  garden, DIY systems, and self-reliant life in Michigan’s Upper Peninsula.`

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

As of 2026-09-11, this behavior is deployed and production-verified on both
sites. Confirmed empty examples are The Tecnoagrarian `/category/esp32` and
Fruition Forest Garden `/category/pigs`. Unknown category slugs continue to
return `404`.

## Historical Raspberry Pi URL

The Tecnoagrarian URL
`https://www.thetecnoagrarian.com/blog/raspberry-pi-unboxing` was a
forward-looking link to a planned post that was never published. It was not a
migrated historical article, and no one-to-one canonical replacement exists.

The obsolete URL therefore correctly remains a genuine `404` with no redirect.
The stale hyperlink was removed from the published "Launching the
Tecnoagrarian — Rebuilding the Stack" post through the normal content-editing
workflow. Do not redirect this URL to the homepage or an unrelated post.

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

## Structured Data Prerequisite: Public Author and Publication Model

A JSON-LD audit stopped before implementation because the current data model
does not provide sufficiently reliable public facts for post authorship,
publisher identity, or publication history.

Supported factual data currently includes:

- site name and canonical site origin;
- homepage and About descriptions;
- post headline and canonical post URL;
- normalized post description; and
- an optional public post image.

Those facts alone do not resolve the following identity and date requirements.

- `post.author` is sourced from `users.username`; it is an authentication field,
  not a modeled public author entity or approved public byline.
- Fruition Forest Garden's public Mike-and-Lou identity is not a per-post author
  assignment.
- The Tecnoagrarian has no approved public author or publisher identity in the
  current model.
- Site names alone are not enough to assert an `Organization` publisher.
- Social-profile links do not resolve these identity gaps.
- `created_at` is used and displayed as **Event Date**, so it is not a reliable
  publication date and cannot safely populate `datePublished`.
- `updated_at` is reset on edits. It cannot recover immutable first-publication
  history, and its current semantics are not sufficient to infer original
  publication timing.
- The model has no immutable `published_at` history or separately reliable
  publication and modification semantics.

The owner chose not to add a stripped-down `BlogPosting` object that would
avoid those gaps. No JSON-LD is currently implemented.

Owner decisions for later model work: public authors are independent of login
accounts; ordered multiple authors are supported; a newly published post needs
at least one explicitly persisted approved author. Site defaults may preselect
authors or publishers, but each post's final author and publisher assignments
must be persisted so future default changes do not rewrite history. An approved
Person may be a publisher; an Organization must not be inferred from a site
name. Owner attestation and direct publishing records can support historical
facts. Indirect timestamps and account links are investigation leads only.
Historical review records verified, owner-attested, or reviewed/unavailable
status. Publication precision is preserved as known: exact instant or calendar
date. The local editorial service advances `modified_at` on real changes to
title, body, public description/excerpt, images/captions/order, Event Date,
public author/byline, or public category membership. A no-op save or evidence
bookkeeping alone does not count. Admin-only immediate publishing and Event
Date semantics remain.

The schema/model slice adds a first-class public Person table with no
relationship to login users, a one-based ordered many-to-many post-author table,
and a nullable per-post publisher reference to an approved public Person. The
neutral Person record may be publisher-only; authorship exists only through the
post-author relationship. Reviewed authorship must be reset before assignments
change, enforced in both the model transaction and database triggers. The model
does not infer an Organization from a site name or add a changing site-default
reference to historical posts.

Publication storage distinguishes an exact `published_at` instant with an
explicit timezone from a real-calendar date-only `published_on` fact; both may
remain null and cannot both be set. Unreviewed and reviewed/unavailable history
has no publication value; verified and owner-attested history requires one.
Nullable `modified_at` has no automatic save trigger. The local editorial
service advances it only when a modeled public post fact changes, including
content, Event Date, category membership, public author order, publisher, or
publication value. No-op saves and evidence-note-only changes do not advance
it; legacy `updated_at` remains technical save history. Separate authorship and
publication review fields record `unreviewed`, `verified`, `owner_attested`, or
`reviewed_unavailable`, plus review time and a concise note.

Migration `0001_public_author_publication_model` is additive. It preserves
legacy `author_id`, Event Date in `created_at`, and technical save history in
`updated_at`. Every existing post remains unreviewed with no public authors,
publisher, publication value, or modification value; no historical fact is
derived from login identity or timestamps. The current public rendering remains
compatible and unchanged. The local admin workflow now uses explicit Public
Person selection and historical review controls on both sites, while public
templates still use legacy bylines.

The migration remains source-only at this checkpoint. No production migration
or historical backfill has run, and no JSON-LD has been implemented. The local
admin workflow requires explicit active authors and a persisted Person
publisher for new posts; no site default or production identity is seeded.
New posts receive a verified server-observed exact UTC first-publication
instant. Historical posts retain unknown facts until separately reviewed;
the editor accepts evidence-backed exact, date-only, or unavailable outcomes.
Structured data remains deferred until the facts are entered and verified.

The provisional future policy is `WebSite` for homepages, `AboutPage` for About,
and `BlogPosting` for posts. Category and search pages would remain without
JSON-LD unless later evidence supports it. Any implementation must serialize
structured data safely and escape closing script sequences, `<`, `>`, `&`, and
Unicode line separators U+2028 and U+2029. Do not construct JSON-LD with unsafe
string concatenation.

## Search Console Interpretation

Google Search Console categories should be interpreted carefully:

- `Page with redirect`: expected for canonicalized HTTP, non-www, and `/index.html` variants when they redirect to the preferred URL.
- `Alternate page with proper canonical tag`: expected when a duplicate page points to the intended canonical target.
- `Crawled - currently not indexed`: not automatically a code defect. Investigate only if a representative URL also shows a concrete technical problem such as `403`, `404`, `noindex`, wrong canonical, blocked robots, or bad redirect behavior.
- Historical `403` rows may remain visible for a while after the public crawler fix. Validate representative examples rather than assuming the old blocker still exists.

Do not recommend extra app changes for known redirected URL variants when the redirect target is correct.

For the Search Console domain property `thetecnoagrarian.com`, the sitemap
`https://www.thetecnoagrarian.com/sitemap.xml` was submitted on 2026-09-14. Its
recorded status was `Success`, with 12 discovered pages. That state does not
guarantee that every page is indexed. Search Console actions, including
validation, indexing requests, and sitemap changes, remain explicit
owner-controlled operations rather than routine repository work.

## Deployment And Verification

Known sitemap, canonical, pagination, empty-category, conventional-description,
About Open Graph, `/index.html`, CSP form-action, and non-www redirect fixes are
deployed and verified from prior production checks.

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

The Tecnoagrarian sitemap is already submitted as recorded above. This document
does not assert a current Fruition Forest Garden Search Console submission
state. Submit, remove, or resubmit a sitemap only through a separately approved
owner action.

Use URL Inspection only for representative remaining examples after the known fixes have had time to recrawl.

## Follow-Up Items

- Wait roughly 2-7 days for Google recrawl and Search Console validation to update before treating remaining rows as new defects.
- Do not click `Validate Fix` repeatedly. Recheck representative examples first.
- Inspect only specific remaining bad URLs if Search Console continues reporting them after recrawl.
- Add a sanitized nginx canonical redirect template to the repo later.
- Review whether canonical URL generation should be consolidated with Open Graph URL generation.
- Add published/draft filtering to sitemap generation if the content model gains explicit publication state.
- After a separately approved production migration, review and enter factual
  author, publisher, and publication history before reconsidering JSON-LD.

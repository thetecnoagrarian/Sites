# Google Indexing Diagnostic

This document diagnoses the Fruition Forest Garden public `403 Forbidden` / Google indexing block using user-provided external test results and safe local source/config inspection.

No code changes were made. No deployment, Docker, network, Git, install, test, SSH, SCP, rsync, delete, move, or secret-inspection commands were run.

## 1. Summary

The public Fruition Forest Garden homepage and `robots.txt` currently return `HTTP 403` for the external requests provided by the user.

Googlebot also receives `HTTP 403`.

This prevents crawling and indexing regardless of whether DNS verification is still processing separately. Google cannot index pages it cannot fetch.

The likely blocker is app-level middleware in `blog-core/src/app.js`, not nginx. The provided response includes nginx as the front server, but also Express/security-style headers and a `blog.sid` session cookie. Safe source inspection found the exact JSON body `{"error":"Access denied"}` in shared Express middleware.

## 2. External Evidence Provided by User

The user reported that these public requests return `HTTP/1.1 403 Forbidden` with JSON body `{"error":"Access denied"}`:

- `curl -I https://www.fruitionforestgarden.com/`
- `curl -I https://fruitionforestgarden.com/`
- `curl -I https://www.fruitionforestgarden.com/robots.txt`
- `curl -I https://fruitionforestgarden.com/robots.txt`
- `curl -I -A "Googlebot" https://www.fruitionforestgarden.com/`
- `curl -I -A "Googlebot" https://fruitionforestgarden.com/`
- `curl -A "Googlebot" https://www.fruitionforestgarden.com/`

The `robots.txt` body also returns:

```text
{"error":"Access denied"}
```

Additional evidence:

- Googlebot user agent is blocked.
- normal curl user agent is blocked.
- `robots.txt` is blocked.
- a `blog.sid` session cookie is present.
- response headers indicate nginx is in front, while the body and session cookie indicate the request reached the Node/Express app.

## 3. Safe Files Inspected

Safe files and folders inspected:

- `AGENTS.md`
- `blog-core/src/app.js`
- `blog-core/src/middleware/auth.js`
- `fruitionforestgarden/src/app.js`
- `fruitionforestgarden/src/routes/home.js`
- `fruitionforestgarden/src/routes/auth.js`
- `fruitionforestgarden/src/routes/admin.js`
- `fruitionforestgarden/src/middleware/analytics.js`
- `fruitionforestgarden/src/middleware/ogTags.js`
- `fruitionforestgarden/src/views/layouts/main.hbs`
- `thetecnoagrarian/src/app.js`
- `thetecnoagrarian/src/routes/home.js`
- `thetecnoagrarian/src/middleware/analytics.js`
- `thetecnoagrarian/src/middleware/ogTags.js`
- `thetecnoagrarian/src/views/layouts/main.hbs`
- safe listings under `fruitionforestgarden/src/public/` and `thetecnoagrarian/src/public/`
- `nginx/blog.conf`
- `docker-compose.yml`
- `docker-compose.prod.yml`
- `docker-compose.local-prod.yml`
- `docker/Dockerfile.prod.site`
- package manifests via safe search context

Searches performed against safe source/config paths:

- exact `Access denied`
- `res.status(403)`
- `403`
- `trusted`
- `TRUSTED_IPS`
- `allowlist`
- `deny`
- `block`
- `bot`
- `crawler`
- `user-agent`
- `Googlebot`
- `analytics`
- `rateLimit`
- `roleGuard`
- `isAuthenticated`
- `auth`
- `admin`
- `csrf`
- `robots`
- `sitemap`
- `noindex`
- `nofollow`
- `canonical`
- `X-Robots`

## 4. Files Intentionally Avoided

The following were intentionally not opened or inspected:

- `.env`
- `.env.*`
- `.env` backups
- `Documents/SECRETS.md`
- database files such as `*.db`, `*.sqlite`, and `*.sqlite3`
- uploads
- backups
- private keys
- certificates
- credential exports
- any file that appeared to contain real secret values

## 5. Likely Request Path

Inferred request flow:

1. Public browser, curl, or Googlebot requests `https://www.fruitionforestgarden.com/` or `https://www.fruitionforestgarden.com/robots.txt`.
2. nginx receives the HTTPS request.
3. nginx proxies the request to the Fruition Forest Garden Node/Express service.
4. `createBlogApp()` in `blog-core/src/app.js` installs shared middleware before site-specific routes.
5. Shared bot protection middleware inspects the user agent.
6. If the user agent matches a blocked bot pattern, the middleware returns:

```json
{"error":"Access denied"}
```

7. Site routes such as `/`, `/robots.txt`, or final 404 handling are never reached for blocked user agents.

This flow is strongly supported by the exact response body in `blog-core/src/app.js` and by the reported session cookie.

## 6. Candidate Blockers Found

### Candidate 1: Shared Bot Protection Middleware

- File path: `blog-core/src/app.js`
- Function/middleware: inline "Bot protection middleware" installed with `app.use(...)`
- Source reference: `blog-core/src/app.js` lines around 310-381
- Why it could produce 403: it checks the request `User-Agent` against broad patterns and returns `res.status(403).json({ error: 'Access denied' })`.
- Likely affects public homepage: yes. It runs before site-specific public routes are mounted.
- Likely affects `robots.txt`: yes. It runs before static fallback, route handling, or 404 handling.
- Confidence: high.
- Recommended next inspection or fix: change this middleware so public routes and crawler resources are not blocked merely because the user agent contains `bot`, `crawler`, `spider`, `curl`, etc. Keep sensitive-path blocking and admin protection separate.

Important detail: the pattern list includes broad crawler terms, including `bot`, so `"Googlebot"` matches. It also includes `curl`, so curl health/indexing checks match.

### Candidate 2: Missing `robots.txt`

- File path: no `robots.txt` file or route was found under the inspected safe source/public paths.
- Function/middleware/route: none found.
- Why it could produce 403: missing `robots.txt` would normally produce 404, but bot protection runs before the final 404 and returns 403 for curl/Googlebot user agents.
- Likely affects public homepage: no, not directly.
- Likely affects `robots.txt`: yes. Without an explicit allowlisted route or static file, `robots.txt` depends on generic middleware/404 behavior.
- Confidence: medium.
- Recommended next inspection or fix: add or serve an explicit public `robots.txt` before restrictive middleware, or adjust middleware so `/robots.txt` is always allowed and returns an appropriate response.

### Candidate 3: Middleware Ordering

- File paths:
  - `blog-core/src/app.js`
  - `fruitionforestgarden/src/app.js`
- Function/middleware/route:
  - `createBlogApp()` installs security/session/CSRF/static/attachUser/bot protection/rate-limit middleware.
  - Fruition Forest Garden then mounts analytics and site routes.
- Why it could produce 403: bot protection is installed before `fruitionforestgarden/src/routes/home.js` is mounted, so public route handlers do not get a chance to respond to blocked crawler user agents.
- Likely affects public homepage: yes.
- Likely affects `robots.txt`: yes.
- Confidence: high.
- Recommended next inspection or fix: define public crawler allowances before the bot block, or narrow the bot block to sensitive/probing paths instead of blocking public content globally.

### Candidate 4: Analytics Middleware

- File path: `fruitionforestgarden/src/middleware/analytics.js`
- Function/middleware: `analyticsMiddleware`
- Why it could produce 403: safe inspection did not find any response-blocking behavior here. It initializes analytics, skips static/admin routes, records page views asynchronously, catches errors, and calls `next()`.
- Likely affects public homepage: it runs on public pages, but does not appear to block them.
- Likely affects `robots.txt`: it would run after bot protection, but only if bot protection allows the request.
- Confidence: low as blocker.
- Recommended next inspection or fix: analytics should continue to log/classify bots rather than block public crawlers. No analytics-specific fix appears first.

### Candidate 5: Auth / Role Guard / Admin Middleware

- File paths:
  - `blog-core/src/middleware/auth.js`
  - `fruitionforestgarden/src/routes/auth.js`
  - `fruitionforestgarden/src/routes/admin.js`
- Function/middleware:
  - `isAuthenticated`
  - `isAdmin`
  - admin router `router.use(isAuthenticated)`
- Why it could produce 403: safe inspection did not find this middleware returning `{"error":"Access denied"}` for public pages. Admin routes redirect unauthenticated users; they are mounted under `/admin`.
- Likely affects public homepage: no.
- Likely affects `robots.txt`: no.
- Confidence: low as blocker.
- Recommended next inspection or fix: keep admin/auth protection intact. Do not loosen admin protections while fixing public crawlability.

### Candidate 6: nginx Routing

- File path: `nginx/blog.conf`
- Function/config area: server blocks and `location /` proxying.
- Why it could produce 403: safe inspection did not find nginx `deny`, `return 403`, or special `/robots.txt` handling. nginx proxies `/` to upstream services and serves some static directories by alias.
- Likely affects public homepage: nginx routes to app, but source does not show nginx itself generating the JSON body.
- Likely affects `robots.txt`: nginx has no explicit `robots.txt` location in the inspected file, so it likely proxies to Express.
- Confidence: low as direct blocker.
- Recommended next inspection or fix: after app middleware is fixed, verify nginx still routes `robots.txt` and static crawl assets correctly.

### Candidate 7: Domain / Host Checks

- File paths:
  - `fruitionforestgarden/src/middleware/ogTags.js`
  - `nginx/blog.conf`
  - `fruitionforestgarden/src/app.js`
- Function/config area:
  - OG base URL generation.
  - nginx `server_name`.
  - site config.
- Why it could produce 403: safe inspection did not find host allowlist or canonical-host rejection logic that would return 403.
- Likely affects public homepage: low.
- Likely affects `robots.txt`: low.
- Confidence: low.
- Recommended next inspection or fix: decide canonical `www` versus non-`www` separately from the 403 fix.

## 7. Exact Source References

- `blog-core/src/app.js` around lines 310-381: shared bot protection middleware checks user agent patterns and returns `403` with JSON body `{"error":"Access denied"}`.
- `blog-core/src/app.js` around lines 351-357: blocked user-agent patterns include broad bot/crawler/scraper terms and curl-style tooling.
- `blog-core/src/app.js` around lines 368-372: matching user agents are logged as bots and receive the exact `Access denied` JSON response.
- `blog-core/src/app.js` around lines 383-430: rate limiting runs after bot protection. It is probably not the current 403 source because its configured message is different.
- `fruitionforestgarden/src/app.js` around lines 22-39: `createBlogApp()` runs before analytics and route mounting, so shared middleware is earlier than public routes.
- `fruitionforestgarden/src/routes/home.js` around lines 29-71: homepage route exists and is public if reached.
- `fruitionforestgarden/src/routes/home.js`: no `robots.txt` or `sitemap.xml` route was found.
- `fruitionforestgarden/src/public/`: safe listing did not show `robots.txt` or `sitemap.xml`.
- `fruitionforestgarden/src/middleware/analytics.js` around lines 6-52: analytics middleware calls `next()` and catches analytics errors; it does not appear to block requests.
- `fruitionforestgarden/src/routes/admin.js` around lines 23-27: admin routes are protected under `/admin`, not globally applied to `/`.
- `nginx/blog.conf`: `location /` proxies to the app; no inspected nginx rule returns the `Access denied` JSON body.

Sensitive default values found in source/config are intentionally not reproduced here.

## 8. Public Routes That Should Remain Crawlable

These should return `200` or appropriate non-403 statuses for public users and legitimate search crawlers:

- `/`
- `/robots.txt`
- `/sitemap.xml` if supported
- public post URLs such as `/post/:slug`
- public category pages such as `/category/:slug`
- public search pages if intended
- `/about`
- static CSS needed for rendering
- static JavaScript needed for rendering
- public images needed for rendering and social previews

Public crawlability does not require granting access to admin, analytics dashboards, edit tools, upload tools, or destructive actions.

## 9. Admin / Private Routes That Should Remain Protected

These should remain protected:

- `/admin`
- `/admin/dashboard`
- admin post create/edit/delete routes
- admin category create/edit/delete routes
- admin user-management routes
- analytics dashboard routes
- upload/admin tools
- hero-image management routes
- any credential-changing route
- any destructive or database mutation route

Do not rely on user-agent strings for private access decisions. User agents are spoofable.

## 10. Safe Fix Strategy, No Code Changes Yet

Recommended fix strategy:

- Do not require trusted-IP allowlist membership for public content routes.
- Keep admin/auth protection separate from public crawlability.
- Change bot analytics behavior so bots/crawlers can be logged or classified without blocking public pages.
- Do not block search crawlers from `/`, `/robots.txt`, `/sitemap.xml`, public posts, categories, or needed static assets.
- Serve `robots.txt` before restrictive middleware, or explicitly allow it through restrictive middleware.
- Add or verify `sitemap.xml` support if the site needs sitemap submission.
- Allow Googlebot/search crawlers only for public pages. Do not grant admin access based on user agent.
- Keep sensitive-path blocking for requests like env/config/adminer/probing paths.
- Consider narrowing bot protection to suspicious paths and abusive rate patterns rather than broad user-agent strings.
- Remove or replace source-level operational defaults with environment-driven configuration in a separate security cleanup task.

Potential implementation approach for a future approved code task:

1. Add an allowlist for public crawler paths before the bot block.
2. Remove broad `/bot/i` blocking from public routes, or scope it only to suspicious/sensitive paths.
3. Add explicit `robots.txt` and optional `sitemap.xml` route/static files.
4. Preserve admin route protection with `isAuthenticated` and `isAdmin`.
5. Verify with curl and Googlebot user-agent requests after deployment.

## 11. Manual Verification Checklist After a Future Fix

Run these only after a fix is approved and deployed:

```bash
curl -I https://www.fruitionforestgarden.com/
curl -I https://fruitionforestgarden.com/
curl https://www.fruitionforestgarden.com/robots.txt
curl -I -A "Googlebot" https://www.fruitionforestgarden.com/
curl -L https://www.fruitionforestgarden.com/ | grep -Ei 'robots|noindex|canonical|sitemap|nofollow'
```

Expected future behavior:

- homepage returns `200`
- `robots.txt` returns `200` or at least not `403`
- Googlebot homepage request returns `200` for public pages
- no `X-Robots-Tag: noindex`
- no `<meta name="robots" content="noindex">`
- canonical URL is sensible

Optional follow-up checks:

```bash
curl -I https://www.fruitionforestgarden.com/sitemap.xml
curl -I https://www.fruitionforestgarden.com/admin
```

Expected:

- `sitemap.xml` returns `200` if supported, otherwise a non-403 status that matches the intended design.
- `/admin` remains protected.

## 12. Google Search Console Follow-Up

After a fix is deployed:

1. Use URL Inspection for the homepage.
2. Use Test Live URL.
3. Confirm Page fetch is successful.
4. Confirm Indexing allowed is Yes.
5. Submit sitemap if available.
6. Request indexing only after live test passes.

Do not treat DNS verification success as proof that crawling works. Fetch and indexing checks must pass after the 403 is fixed.

## 13. Open Questions

- Which middleware returns `{"error":"Access denied"}`? Likely `blog-core/src/app.js` bot protection; confirm during fix.
- Is analytics lockdown applied globally? Safe inspection suggests no; analytics logs asynchronously and does not block.
- Is trusted-IP logic blocking all public users? Trusted-IP logic allows bypass for known IPs, but the observed public block appears caused by user-agent matching, not by lack of trusted IP alone.
- Should Googlebot be allowed only for public pages? Yes; user-agent allow should not affect admin/private routes.
- Does `robots.txt` exist or need to be created? Safe listing found no `robots.txt`.
- Does `sitemap.xml` exist or need to be created? Safe listing found no `sitemap.xml`.
- Should `www` or non-`www` be canonical?
- Does The Tecnoagrarian have the same issue? The same shared bot protection is used by both sites, so Googlebot/curl may be affected there too unless deployment or environment differs.
- Should bot protection be replaced with rate limiting plus sensitive-path blocking rather than broad user-agent blocking?
- Should crawler files be served statically or through explicit routes?

## 14. Recommended Next Codex Task

Recommended next task after this diagnostic:

1. Create a targeted fix plan for public crawlability and bot-protection refactoring, or
2. If the user approves code changes, modify the exact middleware/route ordering so:
   - public pages are crawlable,
   - `robots.txt` is served or explicitly allowed,
   - `sitemap.xml` is supported if desired,
   - admin/private routes remain protected,
   - sensitive probing paths remain blocked,
   - no deployment is performed without separate approval.

Do not change code until the user approves a code-change task.

# Environment Template

This file is a public-safe reference for environment variable structure. It
documents variable names, purposes, and placeholder shapes only.

Do not put real environment values in this file.

## 1. Purpose

Use this document when setting up or reviewing environment configuration for the
monorepo.

It is intended to help future maintainers understand which values may be needed
without exposing secrets, private paths, private hosts, runtime data locations,
or deployment-specific details.

Real values belong in ignored `.env*` files, an approved secret store, a password
manager, or private ignored operator notes.

## 2. Safety Rules

- Do not commit real `.env` files.
- Do not inspect real `.env*` files unless the user explicitly approves that
  exact task.
- Do not commit passwords, tokens, cookies, private keys, session secrets, CSRF
  secrets, database URLs, SMTP credentials, API keys, private hosts, private
  paths, deploy users, or IP allowlists.
- Do not pair secret variable names with real values in tracked docs.
- Do not document password manager item names if they reveal private structure.
- Use clear placeholders for every value that might be secret or
  operational-sensitive.

## 3. Placeholder Conventions

Use angle-bracket placeholders in examples:

- `<NODE_ENV>`
- `<APP_PORT>`
- `<APP_ROLE>`
- `<PUBLIC_BASE_URL>`
- `<DATABASE_PATH>`
- `<DATABASE_URL>`
- `<UPLOADS_PATH>`
- `<LOG_LEVEL>`
- `<MAX_FILE_SIZE_BYTES>`
- `<RATE_LIMIT_WINDOW_MS>`
- `<RATE_LIMIT_MAX_REQUESTS>`
- `<TRUSTED_IPS>`
- `<REQUIRED_RANDOM_SECRET>`
- `<SESSION_SECRET>`
- `<CSRF_SECRET>`
- `<ADMIN_PASSWORD>`
- `<SMTP_HOST>`
- `<SMTP_USERNAME>`
- `<SMTP_PASSWORD>`
- `<API_KEY>`
- `<TOKEN>`
- `<COOKIE_SECRET>`
- `<SERVER_HOST>`
- `<PASSWORD_MANAGER>`

Placeholders describe the shape of a value, not the value itself.

## 4. Required Environment Variables

These variables appear to be core runtime configuration for the application or
production-like containers. Confirm exact requirements against the active source,
Compose files, and deployment runbook before using them.

```env
NODE_ENV=<NODE_ENV>
PORT=<APP_PORT>
APP_ROLE=<APP_ROLE>
SESSION_SECRET=<SESSION_SECRET>
DATABASE_PATH=<DATABASE_PATH>
UPLOADS_PATH=<UPLOADS_PATH>
LOG_LEVEL=<LOG_LEVEL>
MAX_FILE_SIZE=<MAX_FILE_SIZE_BYTES>
RATE_LIMIT_WINDOW_MS=<RATE_LIMIT_WINDOW_MS>
RATE_LIMIT_MAX_REQUESTS=<RATE_LIMIT_MAX_REQUESTS>
TRUSTED_IPS=<TRUSTED_IPS>
```

Variable notes:

| Variable | Purpose | Classification | Notes |
|---|---|---|---|
| `NODE_ENV` | Runtime mode | Non-secret config | Typical values describe environment mode, not credentials. |
| `PORT` | Application listen port | Non-secret config | Site-specific and environment-specific. |
| `APP_ROLE` | Site/application role flag | Non-secret config | Needs Review: confirm accepted values in source and Compose. |
| `SESSION_SECRET` | Session signing secret | Secret | Must be a strong private value from an approved secret store. |
| `DATABASE_PATH` | Runtime database file path | Operational-sensitive | Path points to runtime state and should not expose private server layout. |
| `UPLOADS_PATH` | Runtime upload/media directory | Operational-sensitive | Upload contents are runtime/user-generated data. |
| `LOG_LEVEL` | Logging verbosity | Non-secret config | Avoid verbose production logging of sensitive data. |
| `MAX_FILE_SIZE` | Upload size limit | Non-secret config | Numeric value only. |
| `RATE_LIMIT_WINDOW_MS` | Rate-limit window | Non-secret config | Numeric value only. |
| `RATE_LIMIT_MAX_REQUESTS` | Rate-limit threshold | Non-secret config | Numeric value only. |
| `TRUSTED_IPS` | Trusted IP allowlist | Operational-sensitive | Never commit real allowlist values. |

## 5. Optional Environment Variables

These variables may be used by templates, docs, site-specific examples, scripts,
or future workflows. Treat unresolved variables as Needs Review before relying on
them.

```env
CSRF_SECRET=<CSRF_SECRET>
ADMIN_PASSWORD=<ADMIN_PASSWORD>
DATABASE_URL=<DATABASE_URL>
BASE_URL=<PUBLIC_BASE_URL>
TEST_URL=<PUBLIC_BASE_URL>
BACKUP_RETENTION_DAYS=<RETENTION_DAYS>
BACKUP_SCHEDULE=<SCHEDULE_EXPRESSION>
HEALTH_CHECK_INTERVAL=<INTERVAL_MS>
SMTP_HOST=<SMTP_HOST>
SMTP_USERNAME=<SMTP_USERNAME>
SMTP_PASSWORD=<SMTP_PASSWORD>
API_KEY=<API_KEY>
TOKEN=<TOKEN>
COOKIE_SECRET=<COOKIE_SECRET>
```

Variable notes:

| Variable | Purpose | Classification | Notes |
|---|---|---|---|
| `CSRF_SECRET` | CSRF secret or related security config | Secret | Needs Review: may be future-facing or unused if CSRF is session-derived. |
| `ADMIN_PASSWORD` | Admin password seed/setup value | Secret | Use only through approved private setup flow. |
| `DATABASE_URL` | Database connection/location value | Secret or operational-sensitive | Needs Review: source may prefer `DATABASE_PATH`. |
| `BASE_URL` | Public site base URL | Non-secret config if intentionally public | Use only public canonical domains. |
| `TEST_URL` | Test target URL | Non-secret config if intentionally public | CI/test use only. |
| `BACKUP_RETENTION_DAYS` | Backup retention setting | Non-secret config | Needs Review: may belong in private backup procedure. |
| `BACKUP_SCHEDULE` | Backup schedule setting | Operational-sensitive | Needs Review: avoid exposing exact private operations cadence if sensitive. |
| `HEALTH_CHECK_INTERVAL` | Health-check timing | Non-secret config | Needs Review: Compose may define health checks directly. |
| `SMTP_HOST` | Mail server hostname | Operational-sensitive | Use placeholder unless intentionally public. |
| `SMTP_USERNAME` | Mail/account credential identifier | Secret or operational-sensitive | Do not commit real value. |
| `SMTP_PASSWORD` | Mail credential | Secret | Do not commit real value. |
| `API_KEY` | External API key | Secret | Do not commit real value. |
| `TOKEN` | Access token | Secret | Do not commit real value. |
| `COOKIE_SECRET` | Cookie signing/encryption secret | Secret | Do not commit real value. |

## 6. Public Values Versus Secret Values

Public-safe values may include:

- variable names
- non-secret numeric limits
- non-secret mode names
- intentionally public canonical URLs
- placeholder examples

Private values include:

- session secrets
- CSRF secrets
- passwords
- API keys
- access tokens
- cookie secrets
- database URLs with credentials
- trusted IP allowlists
- private hostnames
- private server paths
- private deploy usernames
- password manager item details

When unsure, classify the value as private and use a placeholder.

## 7. Local Development Notes

Local development may use different ports, paths, log levels, and rate limits
than production.

Local values should still remain outside tracked docs unless they are generic,
non-secret examples. Real local `.env*` files are private and should not be
opened, copied, summarized, or committed.

Use placeholders in tracked docs:

```env
NODE_ENV=<LOCAL_NODE_ENV>
PORT=<LOCAL_APP_PORT>
DATABASE_PATH=<LOCAL_DATABASE_PATH>
UPLOADS_PATH=<LOCAL_UPLOADS_PATH>
SESSION_SECRET=<LOCAL_SESSION_SECRET>
```

## 8. Production and Private Notes Boundary

Production configuration should be documented in two layers:

- tracked public docs: variable names, purpose, classification, placeholders,
  and safety rules
- private ignored notes or secret store: real values, real paths, real hosts,
  real deploy users, and recovery details

Production runtime values should not be copied into chat, diffs, screenshots,
commit messages, or tracked documentation.

## 9. Validation Checklist

Before using or committing environment documentation:

- No real `.env*` files were inspected.
- No real secrets are present.
- No real database URLs are present.
- No real API keys, tokens, passwords, cookies, session values, or CSRF values
  are present.
- No real private hostnames, server IPs, deploy users, or private paths are
  present.
- Every sensitive value is represented by a placeholder.
- Variable names match active source, Compose files, or documented Needs Review
  status.
- Runtime state paths are classified as operational-sensitive.
- Public values are intentionally public.

## 10. Redaction Note

This template has been sanitized to be public-safe and placeholder-only. Future
updates should preserve that boundary.

If a real value is needed, store it in an ignored `.env*` file, an approved
secret store, `<PASSWORD_MANAGER>`, or private ignored operator notes. Do not
commit it to this document.

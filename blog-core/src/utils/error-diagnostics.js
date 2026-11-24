import { randomUUID } from 'node:crypto';
import logger from './logger.js';

const errorNames = new Set(['Error', 'TypeError', 'RangeError', 'SyntaxError',
    'ReferenceError', 'URIError', 'AggregateError', 'SqliteError', 'MulterError']);
const errorCodes = new Set(['SQLITE_BUSY', 'SQLITE_LOCKED', 'SQLITE_FULL', 'SQLITE_IOERR',
    'SQLITE_CORRUPT', 'SQLITE_NOTADB', 'SQLITE_CANTOPEN', 'SQLITE_READONLY',
    'SQLITE_CONSTRAINT', 'SQLITE_ERROR', 'MEDIA_REJECTED', 'MEDIA_OUTCOME_UNKNOWN',
    'PENDING_INPUT_TOO_LARGE', 'LIMIT_FILE_SIZE', 'LIMIT_FILE_COUNT', 'LIMIT_FIELD_KEY',
    'LIMIT_FIELD_VALUE', 'LIMIT_FIELD_COUNT', 'LIMIT_PART_COUNT', 'LIMIT_UNEXPECTED_FILE',
    'EACCES', 'ENOENT', 'ENOSPC', 'ERR_HTTP_HEADERS_SENT', 'ERR_TRUSTED_INGRESS_PEERS']);
const httpMethods = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);

export function readDiagnosticProperty(value, key) {
    try { return value?.[key]; }
    catch { return undefined; }
}

function errorRoute(req) {
    // Emit fixed route families, never paths, IDs or query strings from a request.
    const originalUrl = readDiagnosticProperty(req, 'originalUrl');
    const raw = typeof originalUrl === 'string' ? originalUrl : readDiagnosticProperty(req, 'url');
    const pathname = typeof raw === 'string' ? raw.slice(0, 256).split('?', 1)[0] : '';
    if (pathname === '/admin/posts/confirm-overwrite') return 'overwrite-confirmation';
    if (pathname === '/admin/dashboard/posts/create') return 'editorial-create';
    if (/^\/admin\/dashboard\/posts\/[1-9][0-9]*\/update$/.test(pathname)) return 'editorial-update';
    if (/^\/admin\/dashboard\/posts\/[1-9][0-9]*\/delete$/.test(pathname)) return 'editorial-delete';
    if (/^\/admin(?:\/|$)/.test(pathname)) return 'admin';
    return 'application';
}

const events = new Map([
    ['global', 'Global Error Handler'], ['editorial', 'Editorial admin action failed'],
    ['post-model', 'Post operation failed'], ['media-processing', 'Image processing failed'],
    ['authentication', 'Authentication action failed'], ['admin', 'Administrative action failed'],
    ['public', 'Public page action failed'], ['hero', 'Hero action failed'],
    ['session', 'Session persistence failed'], ['sitemap', 'Sitemap generation failed'],
    ['analytics', 'Analytics operation failed'], ['upload-cleanup', 'Temporary upload retained'],
    ['startup', 'Application startup failed'],
    ['rate-limit-configuration', 'Trusted rate-limit configuration rejected']
]);

export function logSafeError(err, options = {}, log = logger) {
    const req = readDiagnosticProperty(options, 'request') ?? {};
    const requestedEvent = readDiagnosticProperty(options, 'event');
    const event = events.has(requestedEvent) ? requestedEvent : 'editorial';
    const rawCode = readDiagnosticProperty(err, 'code');
    const sqliteCode = typeof rawCode === 'string' && rawCode.startsWith('SQLITE_')
        ? rawCode.slice(0, 64).split('_', 2).join('_') : null;
    const code = errorCodes.has(rawCode) ? rawCode
        : errorCodes.has(sqliteCode) ? sqliteCode : 'UNCLASSIFIED';
    const rawName = readDiagnosticProperty(err, 'name');
    const method = readDiagnosticProperty(req, 'method');
    // Neither messages/stacks nor custom Error fields are safe diagnostic data.
    const record = Object.freeze({
        errorId: randomUUID(),
        errorName: errorNames.has(rawName) ? rawName : 'Error',
        errorCode: code,
        errorCategory: code.startsWith('LIMIT_') ? 'upload' : code.startsWith('SQLITE_') ? 'database'
            : code.startsWith('MEDIA_') || code === 'PENDING_INPUT_TOO_LARGE' ? 'media' : 'application',
        method: httpMethods.has(method) ? method : 'OTHER',
        route: ['post-model', 'media-processing', 'hero', 'analytics', 'upload-cleanup', 'startup', 'rate-limit-configuration'].includes(event)
            ? event : errorRoute(req)
    });
    try { log.error(record, events.get(event)); }
    catch {
        // A diagnostic sink failure must not replace the original editorial outcome.
        // Never dump the sink exception, which may itself contain sensitive values.
        try { console.error('Diagnostic logger unavailable', record); }
        catch { /* The original failure still reaches its existing HTTP/caller path. */ }
    }
}

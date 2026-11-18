import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import pino from 'pino';
import { createGlobalErrorHandler } from '../src/app.js';
import { logSafeError } from '../src/utils/error-diagnostics.js';

const sentinels = {
    article: 'SYNTHETIC_UNPUBLISHED_ARTICLE', snapshot: 'SYNTHETIC_PENDING_SNAPSHOT',
    password: 'SYNTHETIC_PASSWORD', cookie: 'SYNTHETIC_COOKIE', csrf: 'SYNTHETIC_CSRF',
    query: 'SYNTHETIC_QUERY_CONTENT', token: 'SYNTHETIC_TOKEN', raw: 'SYNTHETIC_RAW_MULTIPART',
    file: 'SYNTHETIC_FILE_CONTENT', requestId: 'SYNTHETIC_CLIENT_REQUEST_ID'
};

for (const production of [true, false]) for (const [route, family] of [
    ['/admin/dashboard/posts/create', 'editorial-create'], ['/admin/posts/confirm-overwrite', 'overwrite-confirmation']]) {
    test(`${production ? 'production' : 'development'} global error handler protects ${family} content`, async t => {
        const previous = process.env.NODE_ENV;
        process.env.NODE_ENV = production ? 'production' : 'test';
        const logs = [];
        const logger = pino({ level: 'error' }, { write: line => logs.push(line) });
        const app = express();
        app.use(express.json());
        let error;
        app.post(route, (req, res, next) => {
            req.id = sentinels.requestId;
            req.files = [{ buffer: sentinels.file }];
            req.rawBody = sentinels.raw;
            // Render only is intercepted; the production error handler controls status and locals.
            res.render = (view, locals = {}) => res.json({ view, ...locals });
            error = new Error(Object.values(sentinels).join('|'));
            error.code = 'SQLITE_IOERR_FSYNC';
            error.stack = Object.values(sentinels).join('\n');
            error.cause = new Error(sentinels.password);
            error.body = req.body;
            error.cookie = sentinels.cookie;
            error.toJSON = () => ({ secret: sentinels.token });
            next(error);
        });
        app.use(createGlobalErrorHandler(logger));
        const server = app.listen(0, '127.0.0.1');
        try {
            await new Promise(resolve => server.once('listening', resolve));
            const response = await fetch(`http://127.0.0.1:${server.address().port}${route}?content=${sentinels.query}`, {
                method: 'POST', headers: { 'content-type': 'application/json', cookie: `session=${sentinels.cookie}`,
                    'x-csrf-token': sentinels.csrf, 'x-request-id': sentinels.requestId },
                body: JSON.stringify({ body: sentinels.article, pending_input: sentinels.snapshot,
                    password: sentinels.password, _csrf: sentinels.csrf, token: sentinels.token }) });
            assert.equal(response.status, 500);
            const data = await response.json();
            assert.equal(data.view, '500');
            if (production) assert.deepEqual(Object.keys(data), ['view']);
            else { assert.equal(data.error, error.message); assert.equal(data.stack, error.stack); }
            assert.equal(logs.length, 1);
            for (const sentinel of Object.values(sentinels)) assert.equal(logs.join('').includes(sentinel), false, 'Submitted content must never enter error logs');
            const logged = JSON.parse(logs[0]);
            assert.equal(logged.msg, 'Global Error Handler');
            assert.equal(logged.method, 'POST');
            assert.equal(logged.route, family);
            assert.equal(logged.errorCode, 'SQLITE_IOERR');
            assert.equal(logged.errorCategory, 'database');
            assert.equal(logged.errorName, 'Error');
            assert.match(logged.errorId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
            for (const key of ['err', 'stack', 'body', 'query', 'url', 'cookie', 'headers', 'requestId']) assert.equal(logged[key], undefined);
        } finally {
            await new Promise(resolve => server.close(resolve));
            if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous;
        }
    });
}

test('unknown errors and paths cannot smuggle arbitrary values into diagnostic fields', async () => {
    const logs = [];
    const logger = pino({ level: 'error' }, { write: line => logs.push(line) });
    const error = new Error(sentinels.article);
    Object.assign(error, { name: sentinels.password.repeat(10000), code: sentinels.token.repeat(10000) });
    const response = { status(value) { assert.equal(value, 500); return this; }, render() { return this; } };
    const handler = createGlobalErrorHandler(logger);
    handler(error, { method: sentinels.cookie, url: `/${sentinels.article}?q=${sentinels.query}`,
        id: sentinels.requestId, body: sentinels.snapshot, query: sentinels.query }, response, () => {});
    const logged = JSON.parse(logs[0]);
    assert.equal(logged.errorName, 'Error'); assert.equal(logged.errorCode, 'UNCLASSIFIED');
    assert.equal(logged.method, 'OTHER'); assert.equal(logged.route, 'application');
    for (const sentinel of Object.values(sentinels)) assert.equal(logs[0].includes(sentinel), false);
    assert.ok(logs[0].length < 600, 'Logged diagnostics stay bounded');
});

test('validated diagnostic properties are read once before logging', () => {
    const logs = [];
    const logger = pino({ level: 'error' }, { write: line => logs.push(line) });
    const error = new Error(sentinels.article);
    let names = 0, methods = 0;
    // Avoid V8's lazy stack formatter reading name for the unchanged debug response.
    error.stack = 'Synthetic diagnostic stack';
    Object.defineProperty(error, 'name', { get: () => ++names === 1 ? 'Error' : sentinels.password });
    const req = { url: '/admin/posts/confirm-overwrite', get method() { return ++methods === 1 ? 'POST' : sentinels.cookie; } };
    createGlobalErrorHandler(logger)(error, req, { status() { return this; }, render() { return this; } }, () => {});
    assert.equal(names, 1); assert.equal(methods, 1);
    assert.equal(JSON.parse(logs[0]).errorName, 'Error');
    assert.equal(JSON.parse(logs[0]).method, 'POST');
    assert.equal(logs[0].includes(sentinels.password), false);
    assert.equal(logs[0].includes(sentinels.cookie), false);
});

test('a failing diagnostic sink preserves the HTTP failure and uses a content-safe fallback', () => {
    const captured = [];
    const original = console.error;
    console.error = (...args) => captured.push(JSON.stringify(args));
    let status, view;
    const response = { status(value) { status = value; return this; }, render(value) { view = value; return this; } };
    try {
        createGlobalErrorHandler({ error() { throw new Error(sentinels.password); } })(new Error(sentinels.article),
            { method: 'POST', url: '/admin/posts/confirm-overwrite' }, response, () => {});
        assert.equal(status, 500); assert.equal(view, '500');
        assert.match(captured[0], /Diagnostic logger unavailable/);
        assert.match(captured[0], /overwrite-confirmation/);
        for (const sentinel of Object.values(sentinels)) assert.equal(captured.join('').includes(sentinel), false);
    } finally { console.error = original; }
});

for (const field of ['name', 'code']) for (const inherited of [false, true]) {
    test(`throwing ${inherited ? 'prototype' : 'own'} ${field} getter cannot escape diagnostics`, () => {
        const logs = [], error = {};
        const target = inherited ? Object.create(null) : error;
        Object.defineProperty(target, field, { get() { throw new Error(sentinels.snapshot); } });
        if (inherited) Object.setPrototypeOf(error, target);
        let status, view;
        createGlobalErrorHandler({ error: record => logs.push(record) })(error,
            { method: 'POST', url: '/admin/posts/confirm-overwrite' },
            { status(n) { status = n; return this; }, render(v) { view = v; } }, () => assert.fail('No raw fallback'));
        assert.equal(status, 500); assert.equal(view, '500'); assert.equal(logs.length, 1);
        assert.equal(JSON.stringify(logs).includes(sentinels.snapshot), false);
        assert.equal(logs[0].errorName, 'Error'); assert.equal(logs[0].errorCode, 'UNCLASSIFIED');
    });
}

for (const field of ['method', 'url', 'originalUrl']) {
    test(`throwing request ${field} getter uses bounded defaults`, () => {
        const logs = [], request = {};
        Object.defineProperty(request, field, { get() { throw new Error(sentinels.password); } });
        logSafeError(null, { request }, { error: record => logs.push(record) });
        assert.equal(logs.length, 1); assert.equal(logs[0].method, 'OTHER');
        assert.equal(logs[0].route, 'application');
        assert.equal(JSON.stringify(logs).includes(sentinels.password), false);
    });
}

test('changing code/URL getters are read once and arbitrary thrown values stay bounded', () => {
    let codes = 0, urls = 0;
    const logs = [], error = { get code() { return ++codes === 1 ? 'SQLITE_BUSY' : sentinels.password; } };
    logSafeError(error, { request: { get originalUrl() { return ++urls === 1 ? '/admin/posts/confirm-overwrite' : sentinels.query; } } },
        { error: record => logs.push(record) });
    assert.equal(codes, 1); assert.equal(urls, 1); assert.equal(logs[0].errorCode, 'SQLITE_BUSY');
    assert.equal(logs[0].route, 'overwrite-confirmation');
    const revocable = Proxy.revocable({}, {}); revocable.revoke();
    for (const value of [null, undefined, sentinels.article, 42, revocable.proxy, {
        toJSON() { throw new Error(sentinels.token); }, toString() { throw new Error(sentinels.cookie); }
    }]) logSafeError(value, {}, { error: record => logs.push(record) });
    assert.equal(logs.length, 7);
    for (const sentinel of Object.values(sentinels)) assert.equal(JSON.stringify(logs).includes(sentinel), false);
});

test('an error after headers closes the response without raw fallback', () => {
    const logs = []; let closed = 0;
    createGlobalErrorHandler({ error: record => logs.push(record) })(new Error(sentinels.article), {}, {
        headersSent: true, destroy() { closed++; }, status() { assert.fail('Cannot rewrite sent headers'); }
    }, () => assert.fail('No raw fallback'));
    assert.equal(closed, 1); assert.equal(logs.length, 1);
    assert.equal(JSON.stringify(logs).includes(sentinels.article), false);
});

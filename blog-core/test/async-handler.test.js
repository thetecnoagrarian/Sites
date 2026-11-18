import assert from 'node:assert/strict';
import test from 'node:test';
import { isNativeError } from 'node:util/types';
import { asyncHandler } from '../src/utils/asyncHandler.js';

const privateText = 'SYNTHETIC_REJECTED_PRIVATE_CONTENT';
const rejected = [
    ['undefined', () => undefined], ['null', () => null], ['false', () => false],
    ['zero', () => 0], ['empty string', () => ''], ['route', () => 'route'],
    ['router', () => 'router'], ['private string', () => privateText],
    ['truthy object', () => ({ message: privateText, stack: privateText })],
    ['throwing getters', () => Object.defineProperties({}, Object.fromEntries(
        ['message', 'stack', 'name', 'code', 'toString', 'toJSON'].map(key =>
            [key, { get() { assert.fail('Non-Error rejection properties must not be read'); } }])))],
    ['spoofed Error prototype', () => Object.create(Error.prototype)],
    ['revoked proxy', () => { const p = Proxy.revocable({}, {}); p.revoke(); return p.proxy; }],
    ['hostile proxy', () => new Proxy({}, {
        get() { assert.fail('No property inspection'); },
        getPrototypeOf() { assert.fail('No prototype inspection'); }
    })]
];

for (const [name, reason] of rejected) {
    test(`asyncHandler normalizes ${name} exactly once without inspecting it`, async () => {
        const calls = [];
        await asyncHandler(() => Promise.reject(reason()))({}, {}, (...args) => calls.push(args));
        assert.equal(calls.length, 1);
        const [error] = calls[0];
        assert.equal(isNativeError(error), true);
        assert.equal(error.message, 'Asynchronous handler failed');
        assert.equal(error.stack.includes(privateText), false);
        assert.deepEqual(Object.keys(error), [], 'Rejection properties are never copied');
    });
}

test('asyncHandler preserves a native Error instance and synchronous throws', async () => {
    const error = new Error(privateText);
    for (const handler of [() => Promise.reject(error), () => { throw error; }]) {
        const calls = [];
        await asyncHandler(handler)({}, {}, value => calls.push(value));
        assert.deepEqual(calls, [error]);
        assert.equal(calls[0], error);
    }
});

test('asyncHandler allocates a fresh generic Error for each non-Error rejection', async () => {
    const calls = [];
    for (let i = 0; i < 2; i++) await asyncHandler(() => Promise.reject(null))({}, {}, e => calls.push(e));
    assert.notEqual(calls[0], calls[1]);
});

test('asyncHandler resolution does not automatically call next', async () => {
    const req = {}, res = {}; let ran = 0;
    await asyncHandler((request, response) => {
        assert.equal(request, req); assert.equal(response, res); ran++;
        return Promise.resolve('complete');
    })(req, res, () => assert.fail('Resolved handlers do not advance routing'));
    assert.equal(ran, 1);
});

for (const value of [undefined, 'route', 'router', new Error(privateText)]) {
    test(`asyncHandler preserves explicit next(${value === undefined ? 'void' : isNativeError(value) ? 'Error' : value})`, async () => {
        const calls = [];
        await asyncHandler(async (req, res, next) => next(value))({}, {}, (...args) => calls.push(args));
        assert.deepEqual(calls, [[value]]);
    });
}

test('asyncHandler forwards only once when callback completion precedes rejection', async () => {
    for (const first of [undefined, 'route', 'router', new Error('Synthetic first error')]) {
        const calls = [];
        await asyncHandler(async (req, res, next) => {
            next(first);
            await Promise.resolve();
            throw new Error(privateText);
        })({}, {}, (...args) => calls.push(args));
        assert.deepEqual(calls, [[first]], 'A late rejection cannot advance Express twice');
    }
});

test('asyncHandler ignores a late callback after forwarding a rejection', async () => {
    const calls = []; let callback;
    await asyncHandler((req, res, next) => {
        callback = next;
        return Promise.reject(null);
    })({}, {}, (...args) => calls.push(args));
    callback(new Error(privateText));
    assert.equal(calls.length, 1);
    assert.equal(isNativeError(calls[0][0]), true);
});

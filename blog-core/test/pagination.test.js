import assert from 'node:assert/strict';
import test from 'node:test';

import { buildPagination, parsePageNumber } from '../src/utils/pagination.js';

test('page parsing accepts only positive safe integers', () => {
    assert.equal(parsePageNumber(undefined), 1);
    assert.equal(parsePageNumber('1'), 1);
    assert.equal(parsePageNumber('2'), 2);

    for (const value of ['0', '-1', '1.5', 'abc', '01', '9007199254740992', '', ['1', '2']]) {
        assert.equal(parsePageNumber(value), null);
    }
});

test('pagination creates canonical page URLs and rejects out-of-range pages', () => {
    const firstPage = buildPagination({
        currentPage: 1,
        totalItems: 8,
        limit: 6,
        basePath: '/'
    });
    assert.equal(firstPage.currentUrl, '/');
    assert.equal(firstPage.previousUrl, null);
    assert.equal(firstPage.nextUrl, '/?page=2');
    assert.deepEqual(firstPage.pages.map(({ url }) => url), ['/', '/?page=2']);

    const secondPage = buildPagination({
        currentPage: 2,
        totalItems: 8,
        limit: 6,
        basePath: '/category/example'
    });
    assert.equal(secondPage.currentUrl, '/category/example?page=2');
    assert.equal(secondPage.previousUrl, '/category/example');
    assert.equal(secondPage.nextUrl, null);

    assert.equal(buildPagination({
        currentPage: 3,
        totalItems: 8,
        limit: 6,
        basePath: '/'
    }), null);
});

test('search pagination retains an encoded query in every navigation URL', () => {
    const pagination = buildPagination({
        currentPage: 2,
        totalItems: 13,
        limit: 6,
        basePath: '/search',
        query: { q: 'soil health' }
    });

    assert.equal(pagination.currentUrl, '/search?q=soil+health&page=2');
    assert.equal(pagination.previousUrl, '/search?q=soil+health');
    assert.equal(pagination.nextUrl, '/search?q=soil+health&page=3');
});

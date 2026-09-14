import assert from 'node:assert/strict';
import test from 'node:test';

import {
    getPagedMetaDescription,
    getPostMetaDescription,
    META_DESCRIPTION_MAX_LENGTH,
    normalizeMetaDescription
} from '../src/utils/metaDescription.js';

test('post descriptions prefer editorial metadata and normalize markup safely', () => {
    const description = getPostMetaDescription({
        description: '  A "quoted" & <em>editorial</em> description.  ',
        excerpt: 'Fallback excerpt.',
        body: 'Fallback body.'
    });

    assert.equal(description, 'A "quoted" & editorial description.');
});

test('post descriptions fall back through excerpt and sanitized body content', () => {
    assert.equal(getPostMetaDescription({
        description: '<span> </span>',
        excerpt: '  Useful <strong>excerpt</strong> text. ',
        body: 'Body fallback.'
    }), 'Useful excerpt text.');

    assert.equal(getPostMetaDescription({
        description: '',
        excerpt: '',
        body: '<p>Safe body copy.</p><script>not metadata</script>'
    }), 'Safe body copy.');
});

test('meta descriptions are capped without cutting a normal word when practical', () => {
    const source = 'A durable description with enough words to exercise deterministic truncation. '.repeat(4);
    const description = normalizeMetaDescription(source);

    assert.ok(description.length <= META_DESCRIPTION_MAX_LENGTH);
    assert.ok(description.endsWith('…'));
    assert.ok(!description.endsWith(' …'));
});

test('paginated homepage descriptions remain distinct after page one', () => {
    assert.equal(getPagedMetaDescription('Site description.', 1), 'Site description.');
    assert.equal(getPagedMetaDescription('Site description.', 2), 'Site description. Page 2.');

    const longPagedDescription = getPagedMetaDescription('Long homepage description. '.repeat(10), 12);
    assert.ok(longPagedDescription.length <= META_DESCRIPTION_MAX_LENGTH);
    assert.ok(longPagedDescription.endsWith(' Page 12.'));
});

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    buildBlogPostingJsonLd,
    resolveAbsoluteWebUrl,
    serializeJsonLd
} from '../src/utils/blogPostingJsonLd.js';

const base = (overrides = {}) => ({
    headline: 'A factual post title',
    description: 'A normalized factual description.',
    canonicalUrl: 'https://example.test/post/factual-post',
    imageUrl: 'https://example.test/uploads/factual.webp',
    authorshipReviewState: 'owner_attested',
    authors: [{
        display_name: 'Alex', profile_url: '', is_active: 1, position: 1
    }],
    publication: {
        state: 'owner_attested', publishedOn: '2024-09-22', publishedAt: null
    },
    ...overrides
});

test('valid factual input builds the expected BlogPosting base and optional facts', () => {
    assert.deepEqual(buildBlogPostingJsonLd(base()), {
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: 'A factual post title',
        description: 'A normalized factual description.',
        url: 'https://example.test/post/factual-post',
        mainEntityOfPage: {
            '@type': 'WebPage',
            '@id': 'https://example.test/post/factual-post'
        },
        image: 'https://example.test/uploads/factual.webp',
        author: [{ '@type': 'Person', name: 'Alex' }],
        datePublished: '2024-09-22'
    });
    assert.equal(buildBlogPostingJsonLd(base({ headline: '' })), null);
    assert.equal(buildBlogPostingJsonLd(base({ canonicalUrl: '/relative' })), null);
    const noDescription = buildBlogPostingJsonLd(base({ description: '' }));
    assert.ok(!Object.hasOwn(noDescription, 'description'));
});

test('reviewed ordered authors remain Persons, including archived identities and safe profiles', () => {
    const result = buildBlogPostingJsonLd(base({
        authorshipReviewState: 'verified',
        authors: [
            { display_name: 'Alex', profile_url: 'https://example.test/alex', is_active: 1, position: 1 },
            { display_name: 'Blair', profile_url: '', is_active: 0, position: 2 },
            { display_name: 'Casey', profile_url: 'javascript:alert(1)', is_active: 1, position: 3 }
        ]
    }));
    assert.deepEqual(result.author, [
        { '@type': 'Person', name: 'Alex', url: 'https://example.test/alex' },
        { '@type': 'Person', name: 'Blair' },
        { '@type': 'Person', name: 'Casey' }
    ]);
    assert.ok(!result.author[1].url);
    assert.ok(!result.author[2].url);
});

test('unreviewed, unavailable, missing, or malformed authorship never falls back', () => {
    for (const input of [
        base({ authorshipReviewState: 'unreviewed' }),
        base({ authorshipReviewState: 'reviewed_unavailable' }),
        base({ authors: [] }),
        base({ authors: [{ display_name: 'Gap', position: 2 }] })
    ]) {
        const result = buildBlogPostingJsonLd({
            ...input, legacyUsername: 'login-name', author_id: 99
        });
        assert.ok(!Object.hasOwn(result, 'author'));
        assert.doesNotMatch(JSON.stringify(result), /login-name/);
    }
});

test('publisher is emitted only as an explicitly supplied factual Person', () => {
    const absent = buildBlogPostingJsonLd(base({ publisher: null }));
    assert.ok(!Object.hasOwn(absent, 'publisher'));
    const explicit = buildBlogPostingJsonLd(base({
        publisher: {
            display_name: 'Publisher Person',
            profile_url: 'https://example.test/publisher'
        }
    }));
    assert.deepEqual(explicit.publisher, {
        '@type': 'Person',
        name: 'Publisher Person',
        url: 'https://example.test/publisher'
    });
    assert.notEqual(explicit.publisher['@type'], 'Organization');
});

test('datePublished accepts reviewed date-only or exact facts independent of Event display policy', () => {
    assert.equal(buildBlogPostingJsonLd(base()).datePublished, '2024-09-22');
    const exact = '2024-09-22T23:15:30-04:00';
    assert.equal(buildBlogPostingJsonLd(base({
        publication: { state: 'verified', publishedOn: null, publishedAt: exact }
    })).datePublished, exact);
    assert.equal(buildBlogPostingJsonLd(base({
        eventDate: '2024-09-22',
        publication: { state: 'verified', publishedOn: '2024-09-23', publishedAt: null }
    })).datePublished, '2024-09-23', 'no visible-display threshold applies to JSON-LD');
});

test('unsupported, contradictory, and malformed publication facts are omitted', () => {
    const cases = [
        { state: 'unreviewed', publishedOn: '2024-09-22', publishedAt: null },
        { state: 'reviewed_unavailable', publishedOn: null, publishedAt: null },
        { state: 'owner_attested', publishedOn: null, publishedAt: null },
        { state: 'verified', publishedOn: '2024-09-22', publishedAt: '2024-09-22T00:00:00Z' },
        { state: 'verified', publishedOn: '2024-02-30', publishedAt: null },
        { state: 'verified', publishedOn: null, publishedAt: '2024-09-22T00:00:00' }
    ];
    for (const publication of cases) {
        const result = buildBlogPostingJsonLd(base({ publication }));
        assert.ok(!Object.hasOwn(result, 'datePublished'));
    }
});

test('Event, updated_at, and modified_at inputs never create publication or modification claims', () => {
    const result = buildBlogPostingJsonLd(base({
        publication: null,
        eventDate: '2022-07-18',
        created_at: '2022-07-18',
        updated_at: '2025-11-11 01:55:24',
        modified_at: '2026-01-01T00:00:00Z'
    }));
    assert.ok(!Object.hasOwn(result, 'datePublished'));
    assert.ok(!Object.hasOwn(result, 'dateModified'));
    assert.doesNotMatch(JSON.stringify(result), /2022-07-18|2025-11-11|2026-01-01/);
});

test('image and profile URLs require absolute HTTP or HTTPS facts', () => {
    assert.equal(resolveAbsoluteWebUrl('/uploads/post.webp',
        'https://example.test/post/item'), 'https://example.test/uploads/post.webp');
    assert.equal(resolveAbsoluteWebUrl('javascript:alert(1)',
        'https://example.test/post/item'), null);
    assert.ok(!Object.hasOwn(buildBlogPostingJsonLd(base({ imageUrl: '/relative.webp' })), 'image'));
    assert.ok(!Object.hasOwn(buildBlogPostingJsonLd(base({ imageUrl: 'data:image/png,x' })), 'image'));
});

test('safe serialization prevents script breakout while preserving parseable factual strings', () => {
    const hostile = '</script><script>alert("x")</script> <tag> & \u2028 \u2029';
    const object = buildBlogPostingJsonLd(base({
        headline: hostile,
        description: hostile,
        authors: [{
            display_name: hostile,
            profile_url: 'https://example.test/person?x=</script>&y=>',
            position: 1
        }]
    }));
    const serialized = serializeJsonLd(object);
    assert.ok(!serialized.includes('</script>'));
    assert.ok(!serialized.includes('<'));
    assert.ok(!serialized.includes('>'));
    assert.ok(!serialized.includes('&'));
    assert.ok(!serialized.includes('\u2028'));
    assert.ok(!serialized.includes('\u2029'));
    assert.match(serialized, /\\u003C/);
    assert.match(serialized, /\\u003E/);
    assert.match(serialized, /\\u0026/);
    assert.deepEqual(JSON.parse(serialized), object);
    const extracted = `<script type="application/ld+json">${serialized}</script>`
        .match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1];
    assert.deepEqual(JSON.parse(extracted), object);
    assert.equal(serializeJsonLd(null), null);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { BODY_GALLERY_LIMITS as limits, normalizeBodyGallery, serializeBodyGallery,
    readStoredBodyGallery, storedBodyGalleryKey } from '../src/models/body-gallery.js';

// Historical filenames deliberately do not share an inferred variant basename.
function gallery(count = 1) {
    return { version: 1, items: Array.from({ length: count }, (_, index) => ({
        id: `12345678-1234-4234-8234-${String(index).padStart(12, '0')}`,
        asset: { thumbnail: `/uploads/thumb-${index}.webp`,
            medium: `/uploads/documentary-${index}.webp`, large: `/uploads/legacy-photo-${index}.webp`,
            originalWidth: 3000, originalHeight: 4000 },
        alt: `Construction detail ${index}`, caption: `Process photograph ${index}`
    })) };
}

test('null and empty galleries canonicalize to SQL NULL', () => {
    assert.equal(normalizeBodyGallery(null), null);
    assert.equal(serializeBodyGallery(null), null);
    assert.equal(normalizeBodyGallery({ version: 1, items: [] }), null);
    assert.equal(serializeBodyGallery({ version: 1, items: [] }), null);
});

for (const count of [1, 65, 100]) {
    test(`${count} images retain stable IDs, order, alt, captions, and exact derivative URLs`, () => {
        const input = gallery(count);
        const before = structuredClone(input);
        const value = normalizeBodyGallery(input);
        assert.deepEqual(value, input);
        assert.deepEqual(input, before, 'normalizer must not mutate input');
        input.items.reverse();
        assert.deepEqual(normalizeBodyGallery(input).items, [...value.items].reverse());
        assert.notEqual(normalizeBodyGallery(input), input);
        assert.deepEqual(readStoredBodyGallery(serializeBodyGallery(value)), { value, error: null });
        assert.ok(Buffer.byteLength(serializeBodyGallery(value)) < limits.serializedBytes);
    });
}

test('101 images, invalid versions/shapes, unexpected keys and sparse arrays are rejected', () => {
    assert.throws(() => normalizeBodyGallery(gallery(101)), /100/);
    for (const value of [undefined, 'null', '{}', 1, false, [], {}, { version: 2, items: [] },
        { version: '1', items: [] }, { version: 1, items: null },
        { version: 1, items: [], extra: true }, { version: 1, items: [null] },
        { version: 1, items: new Array(1) }, new Date()]) {
        assert.throws(() => normalizeBodyGallery(value), TypeError);
    }
    const input = gallery();
    input.items[0].position = 1;
    assert.throws(() => normalizeBodyGallery(input), /properties/);
    delete input.items[0].position;
    input.items[0].asset.originalAspectRatio = 0.75;
    assert.throws(() => normalizeBodyGallery(input), /properties/);
});

test('UUIDs normalize case and reject invalid or repeated identities', () => {
    const input = gallery(2);
    input.items[0].id = 'ABCDEFAB-1234-4234-8234-123456789ABC';
    assert.equal(normalizeBodyGallery(input).items[0].id, input.items[0].id.toLowerCase());
    input.items[1].id = input.items[0].id.toLowerCase();
    assert.throws(() => normalizeBodyGallery(input), /Duplicate.*ID/);
    for (const id of ['', null, 1, 'not-a-uuid', '00000000-0000-0000-0000-000000000000']) {
        input.items[0].id = id;
        assert.throws(() => normalizeBodyGallery(input), /UUID/);
    }
});

test('repeated assets are rejected by any shared derivative, independent of item IDs', () => {
    for (const variant of ['thumbnail', 'medium', 'large']) {
        const input = gallery(2);
        input.items[1].asset[variant] = input.items[0].asset[variant];
        assert.throws(() => normalizeBodyGallery(input), /Duplicate gallery asset/);
    }
    // Reuse across different galleries is permitted by this pure contract.
    assert.deepEqual(normalizeBodyGallery(gallery()), normalizeBodyGallery(gallery()));
});

test('asset references exclude external, encoded, filesystem, nested and protected paths', () => {
    for (const url of [undefined, null, '', 'https://example.test/photo.webp', '//example.test/a.webp',
        'javascript:alert(1)', 'file:///tmp/a.webp', '/app/data/uploads/a.webp', '/etc/passwd',
        '/uploads/../a.webp', '/uploads/a/../../b.webp', '/uploads/%2e%2e.webp',
        '/uploads/a%20b.webp', '/uploads/a\\b.webp', '/uploads/.source/a.webp',
        '/uploads/hero/image.webp', '/uploads/.private.webp', '/uploads/a.webp?x=1',
        '/uploads/a.webp#x', '/uploads/a?b.webp', '/uploads/a\u0000.webp', '/uploads/<a>.webp',
        `/uploads/${'a'.repeat(limits.url)}.webp`]) {
        const input = gallery();
        input.items[0].asset.medium = url;
        assert.throws(() => normalizeBodyGallery(input), /asset URL/);
    }
    const input = gallery();
    input.items[0].asset.medium = '/uploads/Older Photo (2)-medium.webp';
    assert.equal(normalizeBodyGallery(input).items[0].asset.medium, input.items[0].asset.medium);
    input.items[0].asset.medium = `/uploads/${'a'.repeat(limits.url - 14)}.webp`;
    assert.equal(input.items[0].asset.medium.length, limits.url);
    normalizeBodyGallery(input);
});

test('dimensions are optional pairs of positive safe integers', () => {
    const input = gallery();
    delete input.items[0].asset.originalWidth;
    assert.throws(() => normalizeBodyGallery(input), /together/);
    delete input.items[0].asset.originalHeight;
    normalizeBodyGallery(input);
    for (const value of [0, -1, 1.5, '3000', null, Number.MAX_SAFE_INTEGER + 1]) {
        input.items[0].asset.originalWidth = value;
        input.items[0].asset.originalHeight = 4000;
        assert.throws(() => normalizeBodyGallery(input), /positive safe integers/);
    }
});

test('alt is required and captions are explicit plain text with individual bounds', () => {
    for (const field of ['alt', 'caption']) {
        for (const value of [undefined, null, 42, {}, '<b>Photo</b>', 'bad\u0000text',
            'x'.repeat(limits[field] + 1)]) {
            const input = gallery();
            input.items[0][field] = value;
            assert.throws(() => normalizeBodyGallery(input), /plain text/);
        }
        const input = gallery();
        input.items[0][field] = 'x'.repeat(limits[field]);
        normalizeBodyGallery(input);
    }
    const input = gallery();
    input.items[0].alt = ' \n\t ';
    assert.throws(() => normalizeBodyGallery(input), /required/);
    input.items[0].alt = ' e\u0301 ';
    input.items[0].caption = ' First\r\nSecond ';
    assert.equal(normalizeBodyGallery(input).items[0].alt, 'é');
    assert.equal(normalizeBodyGallery(input).items[0].caption, 'First\nSecond');
    input.items[0].caption = '';
    normalizeBodyGallery(input);
    input.items[0].alt = '\u0344'.repeat(limits.alt);
    assert.throws(() => normalizeBodyGallery(input), /plain text/,
        'Unicode normalization must not produce text longer than the contract bound');
});

test('canonical serialization ignores object key order while preserving array order', () => {
    const input = gallery(2);
    const equivalent = { items: input.items.map(item => ({ caption: ` ${item.caption} `,
        alt: item.alt, asset: Object.fromEntries(Object.entries(item.asset).reverse()),
        id: item.id.toUpperCase() })), version: 1 };
    assert.equal(serializeBodyGallery(equivalent), serializeBodyGallery(input));
    assert.equal(storedBodyGalleryKey(JSON.stringify(equivalent)), serializeBodyGallery(input));
    equivalent.items.reverse();
    assert.notEqual(serializeBodyGallery(equivalent), serializeBodyGallery(input));
});

test('total serialized payload accepts exactly 256 KiB and rejects one byte more', () => {
    const input = gallery(100);
    let remaining = limits.serializedBytes - Buffer.byteLength(serializeBodyGallery(input));
    for (const item of input.items) {
        const added = Math.min(remaining, limits.caption - item.caption.length);
        item.caption += 'x'.repeat(added);
        remaining -= added;
        if (!remaining) break;
    }
    for (const item of input.items) {
        const added = Math.min(remaining, limits.alt - item.alt.length);
        item.alt += 'x'.repeat(added);
        remaining -= added;
        if (!remaining) break;
    }
    assert.equal(remaining, 0);
    assert.equal(Buffer.byteLength(serializeBodyGallery(input)), limits.serializedBytes);
    input.items.at(-1).alt += 'x';
    assert.throws(() => serializeBodyGallery(input), /serialized UTF-8 bytes/);
    const multibyte = gallery(65);
    for (const item of multibyte.items) item.caption = '森'.repeat(limits.caption);
    assert.throws(() => serializeBodyGallery(multibyte), /serialized UTF-8 bytes/);
});

test('malformed storage is marked, never treated as valid absence or echoed in diagnostics', () => {
    for (const stored of ['{bad', '{"version":2,"items":[]}', '[]', '"secret-like-content"',
        ' '.repeat(limits.serializedBytes + 1), 1]) {
        assert.deepEqual(readStoredBodyGallery(stored), {
            value: null, error: 'invalid_stored_body_gallery'
        });
        assert.notEqual(storedBodyGalleryKey(stored), null);
    }
    assert.notDeepEqual(storedBodyGalleryKey('{bad'), storedBodyGalleryKey('{different'));
    assert.equal(readStoredBodyGallery(null).error, null);
});

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { initializeDatabase } from '../src/database/init.js';
import { setDatabase } from '../src/models/db.js';
import Post from '../src/models/post.js';

test('fresh database supports the post body lifecycle', (t) => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'blog-core-post-schema-'));
    const databasePath = join(tempDirectory, 'test.db');
    let db;

    t.after(() => {
        setDatabase(null);
        if (db) db.close();
        rmSync(tempDirectory, { recursive: true, force: true });
    });

    db = initializeDatabase(databasePath);
    setDatabase(db);

    const postColumns = db.pragma('table_info(posts)').map(({ name }) => name);
    assert.ok(postColumns.includes('body'));
    assert.ok(!postColumns.includes('content'));
    assert.ok(postColumns.includes('body_gallery'));

    const originalBody = 'Synthetic fresh-database body marker.';
    const createResult = Post.create({
        title: 'Synthetic lifecycle post',
        body: originalBody,
        description: 'Synthetic regression-test description.',
        excerpt: 'Synthetic regression-test excerpt.',
        author_id: null
    });

    assert.equal(createResult.changes, 1);

    const postId = Number(createResult.lastInsertRowid);
    const createdPost = Post.findById(postId);
    assert.equal(createdPost.body, originalBody);
    assert.equal(createdPost.body_gallery, null);

    const updatedBody = 'Updated synthetic body searchable marker.';
    const updateResult = Post.update(postId, {
        title: createdPost.title,
        body: updatedBody,
        description: createdPost.description,
        excerpt: createdPost.excerpt,
        images: createdPost.images,
        captions: createdPost.captions,
        author_id: null
    });

    assert.equal(updateResult.changes, 1);

    const updatedPost = Post.findById(postId);
    assert.equal(updatedPost.body, updatedBody);

    const searchResults = Post.search('searchable marker');
    assert.equal(searchResults.length, 1);
    assert.equal(searchResults[0].id, postId);
    assert.equal(searchResults[0].body, updatedBody);

    const gallery = { version: 1, items: [{
        id: 'abcdefab-1234-4234-8234-123456789abc',
        asset: { thumbnail: '/uploads/thumb.webp', medium: '/uploads/medium.webp', large: '/uploads/large.webp' },
        alt: 'Synthetic detail', caption: ''
    }] };
    const content = { title: createdPost.title, body: updatedBody, description: '', excerpt: '', author_id: null };
    const withGallery = Post.create({ ...content, title: 'Gallery without explicit Event Date', body_gallery: gallery });
    assert.deepEqual(Post.findById(Number(withGallery.lastInsertRowid)).body_gallery, gallery);
    Post.update(postId, { ...content, body_gallery: gallery });
    assert.deepEqual(Post.findById(postId).body_gallery, gallery);
    Post.update(postId, { ...content, created_at: '2020-01-01' });
    assert.deepEqual(Post.findById(postId).body_gallery, gallery);
    Post.create({ ...content, overwriteExisting: true });
    assert.deepEqual(Post.findById(postId).body_gallery, gallery);
    const before = db.prepare('SELECT * FROM posts WHERE id = ?').get(postId);
    assert.throws(() => Post.update(postId, { ...content, body: 'Invalid edit', body_gallery: {} }), TypeError);
    assert.throws(() => Post.create({ ...content, title: 'Invalid create', body_gallery: {} }), TypeError);
    assert.deepEqual(db.prepare('SELECT * FROM posts WHERE id = ?').get(postId), before);
    assert.throws(() => db.prepare('UPDATE posts SET body_gallery = ? WHERE id = ?').run('{bad', postId), /CHECK/);
    Post.update(postId, { ...content, body_gallery: null });
    assert.equal(Post.findById(postId).body_gallery, null);
    Post.update(postId, { ...content, created_at: '2020-01-02', body_gallery: gallery });
    assert.deepEqual(Post.findById(postId).body_gallery, gallery);
    Post.create({ ...content, overwriteExisting: true, body_gallery: null });
    assert.equal(Post.findById(postId).body_gallery, null);
});

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { initializeDatabase } from '../src/database/init.js';
import Category from '../src/models/category.js';
import { setDatabase } from '../src/models/db.js';
import Post from '../src/models/post.js';

test('category post count follows public post membership', (t) => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'blog-core-category-count-'));
    const databasePath = join(tempDirectory, 'test.db');
    const db = initializeDatabase(databasePath);
    setDatabase(db);

    t.after(() => {
        setDatabase(null);
        db.close();
        rmSync(tempDirectory, { recursive: true, force: true });
    });

    const categoryId = Number(Category.create('Synthetic Category').lastInsertRowid);
    assert.equal(Category.countPosts(categoryId), 0);

    const postId = Number(Post.create({
        title: 'Synthetic Category Post',
        body: 'Synthetic body.',
        description: 'Synthetic description.',
        excerpt: 'Synthetic excerpt.',
        author_id: null
    }).lastInsertRowid);

    Post.addCategory(postId, categoryId);
    assert.equal(Category.countPosts(categoryId), 1);

    Post.removeCategory(postId, categoryId);
    assert.equal(Category.countPosts(categoryId), 0);
});

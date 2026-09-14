import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { initializeDatabase } from '../src/database/init.js';
import { setDatabase } from '../src/models/db.js';
import Post from '../src/models/post.js';

test('search count, limit, and offset produce distinct deterministic pages', (t) => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'blog-core-search-pagination-'));
    const databasePath = join(tempDirectory, 'test.db');
    const db = initializeDatabase(databasePath);
    setDatabase(db);

    t.after(() => {
        setDatabase(null);
        db.close();
        rmSync(tempDirectory, { recursive: true, force: true });
    });

    for (let index = 1; index <= 8; index += 1) {
        Post.create({
            title: `Synthetic Search Post ${index}`,
            body: 'Shared pagination-marker body.',
            description: 'Synthetic description.',
            excerpt: 'Synthetic excerpt.',
            created_at: `2026-01-${String(index).padStart(2, '0')} 12:00:00`,
            author_id: null
        });
    }

    assert.equal(Post.countSearch('pagination-marker'), 8);

    const firstPage = Post.search('pagination-marker', 6, 0);
    const secondPage = Post.search('pagination-marker', 6, 6);
    assert.equal(firstPage.length, 6);
    assert.equal(secondPage.length, 2);
    assert.deepEqual(firstPage.map(({ id }) => id), [8, 7, 6, 5, 4, 3]);
    assert.deepEqual(secondPage.map(({ id }) => id), [2, 1]);
});

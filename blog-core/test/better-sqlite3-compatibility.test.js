import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import session from 'express-session';
import SQLiteStoreFactory from 'better-sqlite3-session-store';

import { createDatabase, initializeDatabase } from '../src/database/init.js';

const SQLiteStore = SQLiteStoreFactory(session);

const createTemporaryDatabase = (t, prefix) => {
    const tempDirectory = mkdtempSync(join(tmpdir(), prefix));
    const databasePath = join(tempDirectory, 'compatibility.db');
    let db = initializeDatabase(databasePath);

    t.after(() => {
        if (db?.open) db.close();
        rmSync(tempDirectory, { recursive: true, force: true });
    });

    return {
        databasePath,
        get db() {
            return db;
        },
        reopen() {
            if (db?.open) db.close();
            db = createDatabase(databasePath);
            return db;
        }
    };
};

const assertDatabaseIntegrity = (db) => {
    assert.deepEqual(db.pragma('integrity_check'), [{ integrity_check: 'ok' }]);
    assert.deepEqual(db.pragma('foreign_key_check'), []);
};

const callStore = (store, method, ...args) => new Promise((resolve, reject) => {
    store[method](...args, (error, result) => {
        if (error) reject(error);
        else resolve(result);
    });
});

const createSessionStore = (client, intervalHandles) => {
    const originalSetInterval = globalThis.setInterval;
    globalThis.setInterval = (...args) => {
        const handle = originalSetInterval(...args);
        handle.unref();
        intervalHandles.push(handle);
        return handle;
    };

    try {
        return new SQLiteStore({
            client,
            expired: {
                clear: true,
                intervalMs: 900000
            }
        });
    } finally {
        globalThis.setInterval = originalSetInterval;
    }
};

test('database lifecycle supports active CRUD APIs, reopen, and integrity checks', (t) => {
    const fixture = createTemporaryDatabase(t, 'blog-core-better-sqlite3-lifecycle-');
    let { db } = fixture;
    db.pragma('foreign_keys = ON');

    const userResult = db.prepare(`
        INSERT INTO users (username, password_hash, role, isAdmin)
        VALUES (?, ?, ?, ?)
    `).run('compatibility-user', 'synthetic-test-hash', 'admin', 1);
    assert.equal(userResult.changes, 1);
    assert.equal(typeof userResult.lastInsertRowid, 'number');
    const userId = userResult.lastInsertRowid;

    const categoryResult = db.prepare(`
        INSERT INTO categories (name, slug)
        VALUES (?, ?)
    `).run('Compatibility Category', 'compatibility-category');
    assert.equal(categoryResult.changes, 1);
    assert.equal(typeof categoryResult.lastInsertRowid, 'number');
    const categoryId = categoryResult.lastInsertRowid;

    const postResult = db.prepare(`
        INSERT INTO posts (
            title, slug, body, description, excerpt, images, captions, author_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        'Compatibility Post',
        'compatibility-post',
        'Synthetic compatibility body.',
        'Synthetic description.',
        'Synthetic excerpt.',
        JSON.stringify(['/uploads/synthetic-image.webp']),
        JSON.stringify(['Synthetic caption.']),
        userId
    );
    assert.equal(postResult.changes, 1);
    assert.equal(typeof postResult.lastInsertRowid, 'number');
    const postId = postResult.lastInsertRowid;

    assert.equal(
        db.prepare('INSERT INTO post_categories (post_id, category_id) VALUES (?, ?)')
            .run(postId, categoryId).changes,
        1
    );

    const createdPost = db.prepare(`
        SELECT id, title, slug, body, images, captions, author_id
        FROM posts
        WHERE id = ?
    `).get(postId);
    assert.deepEqual(Object.keys(createdPost), [
        'id', 'title', 'slug', 'body', 'images', 'captions', 'author_id'
    ]);
    assert.equal(createdPost.id, postId);
    assert.equal(createdPost.author_id, userId);
    assert.deepEqual(JSON.parse(createdPost.images), ['/uploads/synthetic-image.webp']);
    assert.deepEqual(JSON.parse(createdPost.captions), ['Synthetic caption.']);

    const updateResult = db.prepare(`
        UPDATE posts SET title = ?, body = ? WHERE id = ?
    `).run('Updated Compatibility Post', 'Updated synthetic body.', postId);
    assert.equal(updateResult.changes, 1);

    assert.equal(
        db.prepare('DELETE FROM post_categories WHERE post_id = ? AND category_id = ?')
            .run(postId, categoryId).changes,
        1
    );
    assert.equal(
        db.prepare('INSERT INTO post_categories (post_id, category_id) VALUES (?, ?)')
            .run(postId, categoryId).changes,
        1
    );

    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM posts').get().count, 1);
    assert.equal(db.prepare('SELECT id FROM categories ORDER BY id').all().length, 1);
    assertDatabaseIntegrity(db);

    db = fixture.reopen();
    db.pragma('foreign_keys = ON');

    const reopenedPost = db.prepare(`
        SELECT id, title, body, author_id FROM posts WHERE id = ?
    `).get(postId);
    assert.deepEqual(reopenedPost, {
        id: postId,
        title: 'Updated Compatibility Post',
        body: 'Updated synthetic body.',
        author_id: userId
    });
    assert.equal(
        db.prepare('SELECT COUNT(*) AS count FROM post_categories WHERE post_id = ?')
            .get(postId).count,
        1
    );
    assertDatabaseIntegrity(db);
});

test('transaction rolls back all synthetic writes after an application error', (t) => {
    const fixture = createTemporaryDatabase(t, 'blog-core-better-sqlite3-transaction-');
    const { db } = fixture;
    const rollbackMarker = new Error('synthetic rollback marker');

    const insertFixture = db.transaction(() => {
        const userId = db.prepare(`
            INSERT INTO users (username, password_hash) VALUES (?, ?)
        `).run('rollback-user', 'synthetic-test-hash').lastInsertRowid;

        db.prepare(`
            INSERT INTO posts (title, slug, body, author_id) VALUES (?, ?, ?, ?)
        `).run('Rollback Post', 'rollback-post', 'Should not persist.', userId);

        throw rollbackMarker;
    });

    assert.throws(() => insertFixture(), (error) => error === rollbackMarker);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM users').get().count, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM posts').get().count, 0);
    assertDatabaseIntegrity(db);
});

test('session store persists, touches, expires, reopens, and destroys sessions', async (t) => {
    const fixture = createTemporaryDatabase(t, 'blog-core-better-sqlite3-session-');
    const intervalHandles = [];
    t.after(() => intervalHandles.forEach(clearInterval));

    let store = createSessionStore(fixture.db, intervalHandles);
    const validSession = {
        cookie: {
            maxAge: 60000,
            expires: new Date(Date.now() + 60000)
        },
        userId: 42,
        marker: 'synthetic-session'
    };
    const storedSession = JSON.parse(JSON.stringify(validSession));

    const setResult = await callStore(store, 'set', 'valid-session', validSession);
    assert.equal(setResult.changes, 1);
    assert.deepEqual(await callStore(store, 'get', 'valid-session'), storedSession);
    assert.equal(await callStore(store, 'length'), 1);

    validSession.cookie.expires = new Date(Date.now() + 120000);
    assert.equal((await callStore(store, 'touch', 'valid-session', validSession)).changes, 1);
    assert.deepEqual(await callStore(store, 'get', 'valid-session'), storedSession);

    await callStore(store, 'set', 'expired-session', {
        cookie: { maxAge: -1000 },
        marker: 'expired'
    });
    assert.equal(await callStore(store, 'get', 'expired-session'), null);
    store.clearExpiredSessions();
    assert.equal(await callStore(store, 'length'), 1);

    const reopenedDb = fixture.reopen();
    store = createSessionStore(reopenedDb, intervalHandles);
    assert.deepEqual(await callStore(store, 'get', 'valid-session'), storedSession);
    assert.equal((await callStore(store, 'destroy', 'valid-session')).changes, 1);
    assert.equal(await callStore(store, 'get', 'valid-session'), null);
    assert.equal(await callStore(store, 'length'), 0);
    assertDatabaseIntegrity(reopenedDb);
});

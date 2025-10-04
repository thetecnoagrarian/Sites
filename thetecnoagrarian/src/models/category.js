const db = require('./db');
const slugify = require('slugify');

class Category {
    static create(name) {
        const slug = slugify(name, { lower: true, strict: true });
        const stmt = db.prepare(`
            INSERT INTO categories (name, slug)
            VALUES (?, ?)
        `);
        return stmt.run(name, slug);
    }

    static findById(id) {
        const stmt = db.prepare('SELECT * FROM categories WHERE id = ?');
        return stmt.get(id);
    }

    static findBySlug(slug) {
        const stmt = db.prepare('SELECT * FROM categories WHERE slug = ?');
        return stmt.get(slug);
    }

    static findAll() {
        const stmt = db.prepare('SELECT * FROM categories ORDER BY name');
        return stmt.all();
    }

    static update(id, name) {
        const slug = slugify(name, { lower: true, strict: true });
        const stmt = db.prepare(`
            UPDATE categories 
            SET name = ?, slug = ?
            WHERE id = ?
        `);
        return stmt.run(name, slug, id);
    }

    static delete(id) {
        const stmt = db.prepare('DELETE FROM categories WHERE id = ?');
        return stmt.run(id);
    }

    static getPosts(categoryId, limit = 5, offset = 0) {
        const stmt = db.prepare(`
            SELECT p.* FROM posts p
            JOIN post_categories pc ON p.id = pc.post_id
            WHERE pc.category_id = ?
            ORDER BY p.created_at DESC
            LIMIT ? OFFSET ?
        `);
        const posts = stmt.all(categoryId, limit, offset);
        return posts.map(post => ({
            ...post,
            images: JSON.parse(post.images),
            captions: JSON.parse(post.captions)
        }));
    }

    static countPosts(categoryId) {
        return db.prepare(`
            SELECT COUNT(*) as count 
            FROM post_categories 
            WHERE category_id = ?
        `).get(categoryId).count;
    }
}

module.exports = Category; 
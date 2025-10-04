import slugify from 'slugify';
import { getDatabase } from './db.js';

class Category {
    static findAll() {
        const db = getDatabase();
        const stmt = db.prepare('SELECT * FROM categories ORDER BY name');
        return stmt.all();
    }

    static findById(id) {
        const db = getDatabase();
        const stmt = db.prepare('SELECT * FROM categories WHERE id = ?');
        return stmt.get(id);
    }

    static findBySlug(slug) {
        const db = getDatabase();
        const stmt = db.prepare('SELECT * FROM categories WHERE slug = ?');
        return stmt.get(slug);
    }

    static create(name) {
        const db = getDatabase();
        const slug = slugify(name, { lower: true, strict: true });
        const stmt = db.prepare('INSERT INTO categories (name, slug) VALUES (?, ?)');
        return stmt.run(name, slug);
    }

    static update(id, name) {
        const db = getDatabase();
        const slug = slugify(name, { lower: true, strict: true });
        const stmt = db.prepare('UPDATE categories SET name = ?, slug = ? WHERE id = ?');
        return stmt.run(name, slug, id);
    }

    static delete(id) {
        const db = getDatabase();
        // First remove all post-category relationships
        const deleteRelationsStmt = db.prepare('DELETE FROM post_categories WHERE category_id = ?');
        deleteRelationsStmt.run(id);
        
        // Then delete the category
        const stmt = db.prepare('DELETE FROM categories WHERE id = ?');
        return stmt.run(id);
    }

    static getPosts(categoryId, limit = 10, offset = 0) {
        const db = getDatabase();
        const stmt = db.prepare(`
            SELECT posts.*, users.username as author 
            FROM posts 
            LEFT JOIN users ON posts.author_id = users.id
            JOIN post_categories ON posts.id = post_categories.post_id
            WHERE post_categories.category_id = ?
            ORDER BY posts.created_at DESC 
            LIMIT ? OFFSET ?
        `);
        const posts = stmt.all(categoryId, limit, offset);
        return posts.map(post => ({
            ...post,
            images: JSON.parse(post.images || '[]'),
            captions: JSON.parse(post.captions || '[]')
        }));
    }
}

export default Category;


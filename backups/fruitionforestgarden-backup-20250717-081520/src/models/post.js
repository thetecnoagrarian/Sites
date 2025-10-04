const db = require('./db');
const slugify = require('slugify');

class Post {
    static get count() {
        const stmt = db.prepare('SELECT COUNT(*) as count FROM posts');
        const result = stmt.get();
        return result.count;
    }

    static create({ title, body, description, excerpt, images = [], captions = [], created_at, author_id }) {
        try {
            console.log('Creating post with:', { title, body, description, excerpt, images, captions, created_at, author_id });
            const slug = slugify(title, { lower: true, strict: true });
            let stmt, result;
            if (created_at) {
                stmt = db.prepare(`
                    INSERT INTO posts (title, slug, body, description, excerpt, images, captions, created_at, author_id)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `);
                result = stmt.run(
                    title,
                    slug,
                    body,
                    description,
                    excerpt,
                    JSON.stringify(images),
                    JSON.stringify(captions),
                    created_at,
                    author_id
                );
            } else {
                stmt = db.prepare(`
                    INSERT INTO posts (title, slug, body, description, excerpt, images, captions, author_id)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `);
                result = stmt.run(
                    title,
                    slug,
                    body,
                    description,
                    excerpt,
                    JSON.stringify(images),
                    JSON.stringify(captions),
                    author_id
                );
            }
            console.log('Post creation result:', result);
            return result;
        } catch (error) {
            console.error('Error creating post:', error);
            throw error;
        }
    }

    static findById(id) {
        const stmt = db.prepare('SELECT posts.*, users.username as author FROM posts LEFT JOIN users ON posts.author_id = users.id WHERE posts.id = ?');
        const post = stmt.get(id);
        if (post) {
            post.images = JSON.parse(post.images || '[]');
            post.captions = JSON.parse(post.captions || '[]');
        }
        return post;
    }

    static findBySlug(slug) {
        const stmt = db.prepare('SELECT posts.*, users.username as author FROM posts LEFT JOIN users ON posts.author_id = users.id WHERE posts.slug = ?');
        const post = stmt.get(slug);
        if (post) {
            post.images = JSON.parse(post.images || '[]');
            post.captions = JSON.parse(post.captions || '[]');
        }
        return post;
    }

    static findAll(limit = 5, offset = 0) {
        const stmt = db.prepare(`
            SELECT posts.*, users.username as author FROM posts 
            LEFT JOIN users ON posts.author_id = users.id
            ORDER BY posts.created_at DESC 
            LIMIT ? OFFSET ?
        `);
        const posts = stmt.all(limit, offset);
        return posts.map(post => ({
            ...post,
            images: JSON.parse(post.images || '[]'),
            captions: JSON.parse(post.captions || '[]')
        }));
    }

    static update(id, { title, body, description, excerpt, images = [], captions = [], created_at, author_id }) {
        const slug = slugify(title, { lower: true, strict: true });
        let stmt, result;
        if (created_at) {
            stmt = db.prepare(`
                UPDATE posts 
                SET title = ?, slug = ?, body = ?, description = ?, 
                    excerpt = ?, images = ?, captions = ?, created_at = ?, author_id = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `);
            result = stmt.run(
                title,
                slug,
                body,
                description,
                excerpt,
                JSON.stringify(images),
                JSON.stringify(captions),
                created_at,
                author_id,
                id
            );
        } else {
            stmt = db.prepare(`
                UPDATE posts 
                SET title = ?, slug = ?, body = ?, description = ?, 
                    excerpt = ?, images = ?, captions = ?, author_id = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `);
            result = stmt.run(
                title,
                slug,
                body,
                description,
                excerpt,
                JSON.stringify(images),
                JSON.stringify(captions),
                author_id,
                id
            );
        }
        return result;
    }

    static delete(id) {
        const stmt = db.prepare('DELETE FROM posts WHERE id = ?');
        return stmt.run(id);
    }

    static addCategory(postId, categoryId) {
        const stmt = db.prepare(`
            INSERT INTO post_categories (post_id, category_id)
            VALUES (?, ?)
        `);
        return stmt.run(postId, categoryId);
    }

    static removeCategory(postId, categoryId) {
        const stmt = db.prepare(`
            DELETE FROM post_categories 
            WHERE post_id = ? AND category_id = ?
        `);
        return stmt.run(postId, categoryId);
    }

    static getCategories(postId) {
        const stmt = db.prepare(`
            SELECT c.* FROM categories c
            JOIN post_categories pc ON c.id = pc.category_id
            WHERE pc.post_id = ?
        `);
        return stmt.all(postId);
    }

    static search(query) {
        const stmt = db.prepare(`
            SELECT * FROM posts 
            WHERE title LIKE ? OR body LIKE ? OR description LIKE ?
            ORDER BY created_at DESC
        `);
        const searchPattern = `%${query}%`;
        const posts = stmt.all(searchPattern, searchPattern, searchPattern);
        return posts.map(post => ({
            ...post,
            images: JSON.parse(post.images || '[]'),
            captions: JSON.parse(post.captions || '[]')
        }));
    }

    // Add an instance destroy method for backward compatibility
    destroy() {
        return Post.delete(this.id);
    }
}

module.exports = Post; 
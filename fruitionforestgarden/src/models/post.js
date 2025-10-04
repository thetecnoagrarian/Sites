const db = require('./db');
const slugify = require('slugify');

// Helper function to check for existing post with same title
const checkExistingPost = (title, excludeId = null) => {
    let stmt;
    if (excludeId) {
        stmt = db.prepare('SELECT id, title, slug FROM posts WHERE title = ? AND id != ?');
        return stmt.get(title, excludeId);
    } else {
        stmt = db.prepare('SELECT id, title, slug FROM posts WHERE title = ?');
        return stmt.get(title);
    }
};

// Helper function to generate unique slug (only for truly unique titles)
const generateUniqueSlug = (title) => {
    let baseSlug = slugify(title, { lower: true, strict: true });
    let slug = baseSlug;
    let counter = 1;
    
    // Check if slug exists and increment counter if needed
    while (true) {
        const stmt = db.prepare('SELECT id FROM posts WHERE slug = ?');
        const existing = stmt.get(slug);
        
        if (!existing) {
            break; // Slug is unique
        }
        
        slug = `${baseSlug}-${counter}`;
        counter++;
    }
    
    return slug;
};

class Post {
    static get count() {
        const stmt = db.prepare('SELECT COUNT(*) as count FROM posts');
        const result = stmt.get();
        return result.count;
    }

    // Check if a post with the same title already exists
    static checkForDuplicateTitle(title, excludeId = null) {
        return checkExistingPost(title, excludeId);
    }

    static create({ title, body, description, excerpt, images = [], captions = [], created_at, author_id, overwriteExisting = false }) {
        try {
            console.log('Creating post with:', { title, body, description, excerpt, images, captions, created_at, author_id, overwriteExisting });
            
            // Check if a post with the same title already exists
            const existingPost = checkExistingPost(title);
            let slug;
            
            if (existingPost && !overwriteExisting) {
                // Return error info instead of creating
                throw new Error(`DUPLICATE_TITLE: A post with the title "${title}" already exists (ID: ${existingPost.id})`);
            } else if (existingPost && overwriteExisting) {
                // Update the existing post instead of creating a new one
                // Update created_at to reflect when the new content was created
                return Post.update(existingPost.id, { title, body, description, excerpt, images, captions, created_at, author_id });
            } else {
                // Generate new unique slug
                slug = generateUniqueSlug(title);
            }
            
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
        console.log('Updating post ID:', id, 'with data:', { title, body, description, excerpt, images, captions, created_at, author_id });
        // For updates, we need to check if the slug would conflict with other posts
        const currentPost = Post.findById(id);
        const baseSlug = slugify(title, { lower: true, strict: true });
        
        let slug;
        // If the title hasn't changed, keep the same slug
        if (currentPost && currentPost.title === title) {
            slug = currentPost.slug;
        } else {
            // Generate unique slug, but exclude current post from conflict check
            slug = baseSlug;
            let counter = 1;
            
            while (true) {
                const stmt = db.prepare('SELECT id FROM posts WHERE slug = ? AND id != ?');
                const existing = stmt.get(slug, id);
                
                if (!existing) {
                    break; // Slug is unique
                }
                
                slug = `${baseSlug}-${counter}`;
                counter++;
            }
        }
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
        console.log('Update result:', result);
        return result;
    }

    static delete(id) {
        // First delete associated category relationships
        const deleteCategoriesStmt = db.prepare('DELETE FROM post_categories WHERE post_id = ?');
        deleteCategoriesStmt.run(id);
        
        // Then delete the post
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
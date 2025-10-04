const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const db = new Database(path.join(__dirname, '../database/blog.db'));

class User {
    static findAll() {
        const stmt = db.prepare('SELECT id, username, role, isAdmin FROM users');
        return stmt.all();
    }

    static create(username, password, role) {
        const hashed = bcrypt.hashSync(password, 10);
        const stmt = db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)');
        return stmt.run(username, hashed, role);
    }

    static findByUsername(username) {
        const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
        return stmt.get(username);
    }

    static findById(id) {
        const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
        return stmt.get(id);
    }

    static verifyPassword(plainPassword, hashedPassword) {
        return bcrypt.compareSync(plainPassword, hashedPassword);
    }

    static validateCredentials(username, password) {
        const user = this.findByUsername(username);
        if (!user) return null;
        
        const isValid = bcrypt.compareSync(password, user.password);
        return isValid ? user : null;
    }

    static updatePassword(id, newPassword) {
        const hashedPassword = bcrypt.hashSync(newPassword, 10);
        db.prepare(`
            UPDATE users 
            SET password = ?
            WHERE id = ?
        `).run(hashedPassword, id);
        return this.findById(id);
    }

    static delete(id) {
        const stmt = db.prepare('DELETE FROM users WHERE id = ?');
        return stmt.run(id);
    }
}

module.exports = User; 
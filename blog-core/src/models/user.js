import bcrypt from 'bcryptjs';
import { getDatabase } from './db.js';

class User {
    static findAll() {
        const db = getDatabase();
        const stmt = db.prepare('SELECT id, username, role, isAdmin FROM users');
        return stmt.all();
    }

    static create(username, password, role = 'user') {
        const db = getDatabase();
        const hashed = bcrypt.hashSync(password, 10);
        const stmt = db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)');
        return stmt.run(username, hashed, role);
    }

    static findByUsername(username) {
        const db = getDatabase();
        const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
        return stmt.get(username);
    }

    static findById(id) {
        const db = getDatabase();
        const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
        return stmt.get(id);
    }

    static verifyPassword(plainPassword, hashedPassword) {
        return bcrypt.compareSync(plainPassword, hashedPassword);
    }

    static validateCredentials(username, password) {
        const user = this.findByUsername(username);
        if (!user) return null;
        
        const isValid = bcrypt.compareSync(password, user.password_hash);
        return isValid ? user : null;
    }

    static updatePassword(id, newPassword) {
        const db = getDatabase();
        const hashedPassword = bcrypt.hashSync(newPassword, 10);
        db.prepare(`
            UPDATE users 
            SET password_hash = ?
            WHERE id = ?
        `).run(hashedPassword, id);
        return this.findById(id);
    }

    static delete(id) {
        const db = getDatabase();
        const stmt = db.prepare('DELETE FROM users WHERE id = ?');
        return stmt.run(id);
    }
}

export default User;


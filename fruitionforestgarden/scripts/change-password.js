import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use DATABASE_PATH environment variable if set (production), otherwise use local path
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'src', 'database', 'blog.db');
const db = new Database(dbPath);

const username = process.argv[2];
const newPassword = process.argv[3];

if (!username || !newPassword) {
  console.error('Usage: node change-password.js <username> <new_password>');
  process.exit(1);
}

console.log(`Attempting to change password for user: ${username}`);

try {
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

  if (!user) {
    console.error(`Error: User '${username}' not found.`);
    process.exit(1);
  }

  const hashedPassword = bcrypt.hashSync(newPassword, 10);

  const stmt = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?');
  const info = stmt.run(hashedPassword, user.id);

  if (info.changes > 0) {
    console.log(`Successfully updated password for user: ${username}`);
  } else {
    console.error('Error: Password could not be updated. No changes were made.');
  }
} catch (error) {
  console.error('An unexpected error occurred:', error);
} 
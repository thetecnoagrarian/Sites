const path = require('path');
const Database = require('better-sqlite3');
const db = new Database(path.join(__dirname, 'src', 'database', 'blog.db'));

const username = process.argv[2];

if (!username) {
  console.error('Usage: node set-admin-role.js <username>');
  process.exit(1);
}

console.log(`Attempting to set admin role for user: ${username}`);

try {
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

  if (!user) {
    console.error(`Error: User '${username}' not found.`);
    process.exit(1);
  }

  const stmt = db.prepare('UPDATE users SET role = ? WHERE id = ?');
  const info = stmt.run('admin', user.id);

  if (info.changes > 0) {
    console.log(`Successfully set role to 'admin' for user: ${username}`);
  } else {
    console.error(`Error: The user's role was already 'admin'. No changes were made.`);
  }
} catch (error) {
  console.error('An unexpected error occurred:', error);
} 
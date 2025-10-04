const path = require('path');
const Database = require('better-sqlite3');
const db = new Database(path.join(__dirname, 'src', 'database', 'blog.db'));

const oldUsername = process.argv[2];
const newUsername = process.argv[3];

if (!oldUsername || !newUsername) {
  console.error('Usage: node change-username.js <old_username> <new_username>');
  process.exit(1);
}

if (newUsername.toLowerCase() === 'admin') {
    console.error("Error: For security, please choose a username other than 'admin'.");
    process.exit(1);
}

console.log(`Attempting to change username from '${oldUsername}' to '${newUsername}'`);

try {
  const existingNewUser = db.prepare('SELECT * FROM users WHERE username = ?').get(newUsername);
  if (existingNewUser) {
    console.error(`Error: Username '${newUsername}' already exists. Please choose a different one.`);
    process.exit(1);
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(oldUsername);
  if (!user) {
    console.error(`Error: User '${oldUsername}' not found.`);
    process.exit(1);
  }

  const stmt = db.prepare('UPDATE users SET username = ? WHERE id = ?');
  const info = stmt.run(newUsername, user.id);

  if (info.changes > 0) {
    console.log(`Successfully changed username from '${oldUsername}' to '${newUsername}'`);
  } else {
    console.error('Error: Username could not be updated. No changes were made.');
  }
} catch (error) {
  console.error('An unexpected error occurred:', error);
} 
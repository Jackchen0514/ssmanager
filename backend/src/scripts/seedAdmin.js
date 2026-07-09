import bcrypt from 'bcryptjs';
import { db } from '../db/index.js';
import { config } from '../config.js';

const count = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
if (count > 0) {
  console.log(`users table already has ${count} row(s), skipping seed`);
  process.exit(0);
}

const passwordHash = bcrypt.hashSync(config.adminPassword, 10);
db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(
  config.adminUsername,
  passwordHash
);

console.log(`created admin user "${config.adminUsername}"`);

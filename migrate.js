require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../db');

async function run() {
  await db.initDb();
  if (!db.isEnabled()) {
    console.log('DATABASE_URL not set, nothing to migrate');
    process.exit(0);
  }
  const usersFile = path.join(__dirname, '..', 'data', 'users.json');
  if (!fs.existsSync(usersFile)) {
    console.log('No users.json found');
    process.exit(0);
  }
  const users = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
  console.log(`Found ${users.length} users in file`);
  for (const u of users) {
    try {
      const exists = await db.getUserByUsername(u.username);
      if (exists) {
        console.log(`Skip ${u.username} - already exists`);
        continue;
      }
      await db.createUser({
        id: u.id,
        username: u.username,
        passwordHash: u.passwordHash,
        avatar: u.avatar || '😎',
        bio: u.bio || '',
      });
      console.log(`Migrated ${u.username}`);
    } catch (e) {
      console.error(`Failed ${u.username}:`, e.message);
    }
  }
  console.log('Done');
  process.exit(0);
}
run();

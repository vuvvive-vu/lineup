const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;
let pool = null;
let enabled = !!DATABASE_URL;

if (enabled) {
  pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
  });
  pool.on('error', (e) => console.error('PG pool error', e.message));
}

async function initDb() {
  if (!enabled) {
    console.log('DB: file mode (no DATABASE_URL)');
    return false;
  }
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        avatar TEXT DEFAULT '😎',
        bio TEXT DEFAULT '',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_idx ON users (lower(username));
    `);
    console.log('DB: connected & users table ready');
    return true;
  } catch (e) {
    console.error('DB init failed, fallback to file:', e.message);
    enabled = false;
    return false;
  }
}

function isEnabled() { return enabled && !!pool; }

async function getUserByUsername(username) {
  if (!isEnabled()) return null;
  const r = await pool.query('SELECT id, username, password_hash as "passwordHash", avatar, bio FROM users WHERE lower(username)=lower($1) LIMIT 1', [username]);
  return r.rows[0] || null;
}

async function getAllUsers() {
  if (!isEnabled()) return null;
  const r = await pool.query('SELECT id, username, password_hash as "passwordHash", avatar, bio FROM users ORDER BY created_at');
  return r.rows;
}

async function createUser({ id, username, passwordHash, avatar, bio }) {
  if (!isEnabled()) return null;
  const r = await pool.query(
    'INSERT INTO users (id, username, password_hash, avatar, bio) VALUES ($1,$2,$3,$4,$5) RETURNING id, username, password_hash as "passwordHash", avatar, bio',
    [id, username, passwordHash, avatar || '😎', bio || '']
  );
  return r.rows[0];
}

async function updateUser(oldUsername, { username, avatar, bio }) {
  if (!isEnabled()) return null;
  // build dynamic set
  const fields = [];
  const vals = [];
  let idx = 1;
  if (username && username !== oldUsername) { fields.push(`username=$${idx++}`); vals.push(username); }
  if (avatar !== undefined) { fields.push(`avatar=$${idx++}`); vals.push(avatar); }
  if (bio !== undefined) { fields.push(`bio=$${idx++}`); vals.push(bio); }
  if (fields.length === 0) return getUserByUsername(oldUsername);
  vals.push(oldUsername);
  const q = `UPDATE users SET ${fields.join(', ')} WHERE lower(username)=lower($${idx}) RETURNING id, username, password_hash as "passwordHash", avatar, bio`;
  const r = await pool.query(q, vals);
  return r.rows[0] || null;
}

async function checkUsernameAvailable(username) {
  if (!isEnabled()) return null;
  const r = await pool.query('SELECT 1 FROM users WHERE lower(username)=lower($1) LIMIT 1', [username]);
  return r.rows.length === 0;
}

module.exports = { pool, isEnabled, initDb, getUserByUsername, getAllUsers, createUser, updateUser, checkUsernameAvailable };

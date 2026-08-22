const { Pool } = require('pg');

let pool = null;
let enabled = false;

function isEnabled() { return enabled && !!pool; }

async function initDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log('DB: DATABASE_URL не задан — режим памяти');
    return false;
  }
  try {
    pool = new Pool({
      connectionString: url,
      ssl: { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 8000,
    });
    await initSchema();
    enabled = true;
    const u = new URL(url);
    console.log(`DB: подключено ${u.hostname}/${u.pathname.slice(1)}`);
    return true;
  } catch (e) {
    console.error('DB: не удалось подключиться, работаем в режиме памяти —', e.message);
    pool = null;
    enabled = false;
    return false;
  }
}

async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(32) PRIMARY KEY,
      username VARCHAR(64) NOT NULL,
      password_hash VARCHAR(255) DEFAULT '',
      avatar TEXT,
      bio VARCHAR(255) DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

async function getUserByUsername(username) {
  const { rows } = await pool.query(
    'SELECT id, username, password_hash AS "passwordHash", avatar, bio FROM users WHERE username=$1 LIMIT 1',
    [username]
  );
  return rows[0] || null;
}

async function upsertUser({ username, avatar, bio }) {
  await pool.query(
    `INSERT INTO users (id, username, password_hash, avatar, bio) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (username) DO NOTHING`,
    [String(Date.now()), username, '', avatar || '\uD83D\uDE0E', bio || '']
  );
  return getUserByUsername(username);
}

async function updateUserProfile(oldUsername, { username, avatar, bio }) {
  const sets = [];
  const vals = [];
  let idx = 1;
  if (username && username !== oldUsername) { sets.push(`username=$${idx++}`); vals.push(username); }
  if (avatar !== undefined && avatar !== null && avatar !== '') { sets.push(`avatar=$${idx++}`); vals.push(avatar); }
  if (bio !== undefined && bio !== null) { sets.push(`bio=$${idx++}`); vals.push(bio); }
  if (!sets.length) return getUserByUsername(oldUsername);
  vals.push(oldUsername);
  await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE username=$${idx}`, vals);
  return getUserByUsername(username || oldUsername);
}

async function countUsers() {
  const { rows } = await pool.query('SELECT COUNT(*) AS c FROM users');
  return Number(rows[0].c);
}

module.exports = { isEnabled, initDb, getUserByUsername, upsertUser, updateUserProfile, countUsers };

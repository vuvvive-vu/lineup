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
      avatar TEXT,
      bio VARCHAR(255) DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

async function getUserById(id) {
  const { rows } = await pool.query(
    'SELECT id, username, avatar, bio FROM users WHERE id=$1',
    [id]
  );
  return rows[0] || null;
}

async function getUserByUsername(username) {
  const { rows } = await pool.query(
    'SELECT id, username, avatar, bio FROM users WHERE username=$1 ORDER BY created_at DESC LIMIT 1',
    [username]
  );
  return rows[0] || null;
}

async function createAccount({ username, avatar, bio }) {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  await pool.query(
    'INSERT INTO users (id, username, avatar, bio) VALUES ($1,$2,$3,$4)',
    [id, username, avatar || '\uD83D\uDE0E', bio || '']
  );
  return getUserById(id);
}

async function deleteAccount(id) {
  await pool.query('DELETE FROM users WHERE id=$1', [id]);
}

async function updateUserProfileById(id, { username, avatar, bio }) {
  await pool.query('UPDATE users SET username=$1, avatar=$2, bio=$3 WHERE id=$4', [username, avatar || '\uD83D\uDE0E', bio || '', id]);
  return getUserById(id);
}

async function countUsers() {
  const { rows } = await pool.query('SELECT COUNT(*) AS c FROM users');
  return Number(rows[0].c);
}

async function getAllUsers() {
  const { rows } = await pool.query('SELECT id, username, avatar, bio, created_at FROM users ORDER BY created_at DESC');
  return rows;
}

module.exports = { isEnabled, initDb, getUserById, getUserByUsername, createAccount, deleteAccount, updateUserProfileById, countUsers, getAllUsers };

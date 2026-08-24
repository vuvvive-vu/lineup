const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

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
      email VARCHAR(255) UNIQUE,
      password_hash VARCHAR(255),
      avatar TEXT,
      bio VARCHAR(255) DEFAULT '',
      email_verified BOOLEAN DEFAULT false,
      verify_token VARCHAR(64),
      reset_token VARCHAR(64),
      reset_expires TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  // Add columns if table already existed without them
  const cols = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='users'`);
  const existing = cols.rows.map(r => r.column_name);
  if (!existing.includes('email')) await pool.query('ALTER TABLE users ADD COLUMN email VARCHAR(255) UNIQUE');
  if (!existing.includes('password_hash')) await pool.query('ALTER TABLE users ADD COLUMN password_hash VARCHAR(255)');
  if (!existing.includes('email_verified')) await pool.query('ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT false');
  if (!existing.includes('verify_token')) await pool.query('ALTER TABLE users ADD COLUMN verify_token VARCHAR(64)');
  if (!existing.includes('reset_token')) await pool.query('ALTER TABLE users ADD COLUMN reset_token VARCHAR(64)');
  if (!existing.includes('reset_expires')) await pool.query('ALTER TABLE users ADD COLUMN reset_expires TIMESTAMP');
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function genToken() {
  return crypto.randomBytes(32).toString('hex');
}

// --- existing functions ---

async function getUserById(id) {
  const { rows } = await pool.query(
    'SELECT id, username, email, avatar, bio, email_verified FROM users WHERE id=$1',
    [id]
  );
  return rows[0] || null;
}

async function getUserByUsername(username) {
  const { rows } = await pool.query(
    'SELECT id, username, email, avatar, bio, email_verified FROM users WHERE username=$1 ORDER BY created_at DESC LIMIT 1',
    [username]
  );
  return rows[0] || null;
}

async function createAccount({ username, avatar, bio }) {
  const id = genId();
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
  const { rows } = await pool.query('SELECT id, username, email, avatar, bio, email_verified, created_at FROM users ORDER BY created_at DESC');
  return rows;
}

// --- new auth functions ---

async function getUserByEmail(email) {
  const { rows } = await pool.query(
    'SELECT id, username, email, password_hash, avatar, bio, email_verified FROM users WHERE email=$1 LIMIT 1',
    [email]
  );
  return rows[0] || null;
}

async function createAccountWithAuth({ username, email, password }) {
  const id = genId();
  const passwordHash = await bcrypt.hash(password, 10);
  const verifyToken = genToken();
  await pool.query(
    'INSERT INTO users (id, username, email, password_hash, verify_token) VALUES ($1,$2,$3,$4,$5)',
    [id, username, email, passwordHash, verifyToken]
  );
  return { user: await getUserById(id), verifyToken };
}

async function setVerifyToken(userId, token) {
  await pool.query('UPDATE users SET verify_token=$1 WHERE id=$2', [token, userId]);
}

async function verifyEmail(token) {
  const { rows } = await pool.query(
    'UPDATE users SET email_verified=true, verify_token=null WHERE verify_token=$1 RETURNING id, username, email',
    [token]
  );
  return rows[0] || null;
}

async function setResetToken(email) {
  const user = await getUserByEmail(email);
  if (!user) return null;
  const token = genToken();
  const expires = new Date(Date.now() + 3600000); // 1 hour
  await pool.query('UPDATE users SET reset_token=$1, reset_expires=$2 WHERE id=$3', [token, expires, user.id]);
  return { userId: user.id, token, email: user.email };
}

async function resetPassword(token, newPassword) {
  const { rows } = await pool.query(
    'SELECT id FROM users WHERE reset_token=$1 AND reset_expires > NOW()',
    [token]
  );
  if (!rows[0]) return null;
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await pool.query('UPDATE users SET password_hash=$1, reset_token=null, reset_expires=null WHERE id=$2', [passwordHash, rows[0].id]);
  return rows[0].id;
}

async function verifyPassword(email, password) {
  const user = await getUserByEmail(email);
  if (!user || !user.password_hash) return null;
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return null;
  return user;
}

module.exports = {
  isEnabled, initDb,
  getUserById, getUserByUsername, getUserByEmail,
  createAccount, createAccountWithAuth,
  deleteAccount, updateUserProfileById,
  countUsers, getAllUsers,
  setVerifyToken, verifyEmail,
  setResetToken, resetPassword, verifyPassword,
  genToken, genId
};

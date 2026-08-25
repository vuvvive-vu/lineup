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
  if (!existing.includes('display_name')) await pool.query('ALTER TABLE users ADD COLUMN display_name VARCHAR(64)');
  // ensure username is lowercase unique index
  try { await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_idx ON users (lower(username))'); } catch {}
  // backfill display_name for old rows
  try { await pool.query("UPDATE users SET display_name = username WHERE display_name IS NULL OR display_name = ''"); } catch {}
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
    'SELECT id, username, display_name, email, avatar, bio, email_verified FROM users WHERE id=$1',
    [id]
  );
  return rows[0] || null;
}

async function getUserByUsername(username) {
  const { rows } = await pool.query(
    'SELECT id, username, display_name, email, avatar, bio, email_verified FROM users WHERE lower(username)=lower($1) ORDER BY created_at DESC LIMIT 1',
    [username]
  );
  return rows[0] || null;
}

function isValidHandle(s){ return /^[a-z0-9_-]{3,20}$/.test(s); }

async function createAccount({ displayName, username, avatar, bio }) {
  // guest: only displayName, generate fallback username if not provided
  const handle = username ? username.toLowerCase() : null;
  const dname = (displayName || username || 'guest').slice(0,20);
  const id = genId();
  if (handle) {
    await pool.query(
      'INSERT INTO users (id, username, display_name, avatar, bio) VALUES ($1,$2,$3,$4,$5)',
      [id, handle, dname, avatar || '', bio || '']
    );
  } else {
    // guest fallback - should not hit DB when enabled, but keep for compat
    await pool.query(
      'INSERT INTO users (id, username, display_name, avatar, bio) VALUES ($1,$2,$3,$4,$5)',
      [id, 'guest_'+id.slice(0,6), dname, avatar || '', bio || '']
    );
  }
  return getUserById(id);
}

async function deleteAccount(id) {
  await pool.query('DELETE FROM users WHERE id=$1', [id]);
}

async function updateUserProfileById(id, { displayName, username, avatar, bio }) {
  const fields = [];
  const vals = [];
  let idx=1;
  if (displayName !== undefined) { fields.push(`display_name=$${idx++}`); vals.push(displayName.slice(0,20)); }
  if (username !== undefined) { fields.push(`username=$${idx++}`); vals.push(username.toLowerCase()); }
  if (avatar !== undefined) { fields.push(`avatar=$${idx++}`); vals.push(avatar || ''); }
  if (bio !== undefined) { fields.push(`bio=$${idx++}`); vals.push((bio||'').slice(0,120)); }
  if (!fields.length) return getUserById(id);
  vals.push(id);
  await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id=$${idx}`, vals);
  return getUserById(id);
}

async function countUsers() {
  const { rows } = await pool.query('SELECT COUNT(*) AS c FROM users');
  return Number(rows[0].c);
}

async function getAllUsers() {
  const { rows } = await pool.query('SELECT id, username, display_name, email, avatar, bio, email_verified, created_at FROM users ORDER BY created_at DESC');
  return rows;
}

// --- new auth functions ---

async function getUserByEmail(email) {
  const { rows } = await pool.query(
    'SELECT id, username, display_name, email, password_hash, avatar, bio, email_verified, verify_token, reset_token, reset_expires FROM users WHERE email=$1 LIMIT 1',
    [email]
  );
  return rows[0] || null;
}

async function createAccountWithAuth({ displayName, username, email, password }) {
  const id = genId();
  const passwordHash = await bcrypt.hash(password, 10);
  const verifyToken = genToken();
  const dname = (displayName || username).slice(0,20);
  const handle = username.toLowerCase();
  await pool.query(
    'INSERT INTO users (id, username, display_name, email, password_hash, verify_token) VALUES ($1,$2,$3,$4,$5,$6)',
    [id, handle, dname, email, passwordHash, verifyToken]
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

async function verifyEmailByCode(email, code) {
  const { rowCount } = await pool.query(
    'UPDATE users SET email_verified=true, verify_token=null WHERE email=$1 AND verify_token=$2',
    [email, code]
  );
  return rowCount > 0;
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
  get pool(){ return pool; },
  get poolRef(){ return pool; },
  getUserById, getUserByUsername, getUserByEmail,
  createAccount, createAccountWithAuth,
  deleteAccount, updateUserProfileById,
  countUsers, getAllUsers,
  setVerifyToken, verifyEmail, verifyEmailByCode,
  setResetToken, resetPassword, verifyPassword,
  genToken, genId, isValidHandle
};

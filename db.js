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
  if (!existing.includes('badge')) await pool.query("ALTER TABLE users ADD COLUMN badge TEXT DEFAULT NULL");
  if (!existing.includes('badges')) await pool.query("ALTER TABLE users ADD COLUMN badges TEXT DEFAULT '[]'");
  if (!existing.includes('active_badge')) await pool.query("ALTER TABLE users ADD COLUMN active_badge TEXT DEFAULT NULL");
  if (!existing.includes('last_seen')) await pool.query("ALTER TABLE users ADD COLUMN last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP");
  // ensure username is lowercase unique index
  try { await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_idx ON users (lower(username))'); } catch {}
  // backfill display_name for old rows
  try { await pool.query("UPDATE users SET display_name = username WHERE display_name IS NULL OR display_name = ''"); } catch {}
  // friend requests
  await pool.query(`
    CREATE TABLE IF NOT EXISTS friend_requests (
      id VARCHAR(32) PRIMARY KEY,
      sender_id VARCHAR(32) NOT NULL,
      receiver_id VARCHAR(32) NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      responded_at TIMESTAMP,
      CONSTRAINT fk_fr_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_fr_receiver FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT uq_fr_pair UNIQUE (sender_id, receiver_id)
    );
  `);
  try { await pool.query('CREATE INDEX IF NOT EXISTS fr_receiver_idx ON friend_requests (receiver_id, status)'); } catch {}
  try { await pool.query('CREATE INDEX IF NOT EXISTS fr_sender_idx ON friend_requests (sender_id, status)'); } catch {}
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
    'SELECT id, username, display_name, email, avatar, bio, email_verified, badge, badges, active_badge, created_at, last_seen FROM users WHERE id=$1',
    [id]
  );
  return rows[0] || null;
}

async function getUserByUsername(username) {
  const { rows } = await pool.query(
    'SELECT id, username, display_name, email, avatar, bio, email_verified, badge, badges, active_badge, created_at, last_seen FROM users WHERE lower(username)=lower($1) ORDER BY created_at DESC LIMIT 1',
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

async function setUserBadge(id, badge) {
  const val = badge ? String(badge).toLowerCase().slice(0,32) : null;
  await pool.query('UPDATE users SET badge=$1 WHERE id=$2', [val, id]);
  return getUserById(id);
}

async function setUserBadges(id, badges, activeBadge) {
  const list = [...new Set((Array.isArray(badges) ? badges : []).map(v => String(v).toLowerCase().slice(0,32)))];
  const active = list.includes(activeBadge) ? activeBadge : (list[0] || null);
  await pool.query('UPDATE users SET badges=$1, active_badge=$2, badge=$2 WHERE id=$3', [JSON.stringify(list), active, id]);
  return getUserById(id);
}

async function countUsers() {
  const { rows } = await pool.query('SELECT COUNT(*) AS c FROM users');
  return Number(rows[0].c);
}

async function getAllUsers() {
  const { rows } = await pool.query('SELECT id, username, display_name, email, avatar, bio, email_verified, badge, badges, active_badge, created_at FROM users ORDER BY created_at DESC');
  return rows;
}

// --- new auth functions ---

async function getUserByEmail(email) {
  const { rows } = await pool.query(
    'SELECT id, username, display_name, email, password_hash, avatar, bio, email_verified, badge, badges, active_badge, verify_token, reset_token, reset_expires, created_at, last_seen FROM users WHERE email=$1 LIMIT 1',
    [email]
  );
  return rows[0] || null;
}

async function touchLastSeen(id) {
  try { await pool.query('UPDATE users SET last_seen=NOW() WHERE id=$1', [id]); } catch {}
}

async function createAccountWithAuth({ displayName, username, email, password }) {
  const id = genId();
  const passwordHash = await bcrypt.hash(password, 12);
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
  const passwordHash = await bcrypt.hash(newPassword, 12);
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

// --- friends ---

async function searchUsersByPrefix(q, excludeId, limit = 8) {
  const { rows } = await pool.query(
    `SELECT id, username, display_name, avatar FROM users
     WHERE lower(username) LIKE $1||'%'
       AND id <> $2
       AND email IS NOT NULL
       AND username NOT LIKE 'guest\_%' ESCAPE '\'
     ORDER BY username LIMIT $3`,
    [q.toLowerCase(), excludeId, limit]
  );
  return rows.map(r => ({ id: r.id, username: r.username, displayName: r.display_name || r.username, avatar: r.avatar || '' }));
}

async function frGetById(id) {
  const { rows } = await pool.query('SELECT * FROM friend_requests WHERE id=$1', [id]);
  return rows[0] || null;
}

async function frListBetween(aId, bId) {
  const { rows } = await pool.query(
    `SELECT * FROM friend_requests
     WHERE (sender_id=$1 AND receiver_id=$2) OR (sender_id=$2 AND receiver_id=$1)`,
    [aId, bId]
  );
  return rows;
}

async function frInsert(senderId, receiverId) {
  const id = genId();
  await pool.query('INSERT INTO friend_requests (id, sender_id, receiver_id) VALUES ($1,$2,$3)', [id, senderId, receiverId]);
  return frGetById(id);
}

async function frSetStatus(id, status) {
  const { rows } = await pool.query(
    'UPDATE friend_requests SET status=$1, responded_at=NOW() WHERE id=$2 RETURNING *',
    [status, id]
  );
  return rows[0] || null;
}

async function frDelete(id) {
  await pool.query('DELETE FROM friend_requests WHERE id=$1', [id]);
}

async function frIncoming(userId) {
  const { rows } = await pool.query(
    `SELECT fr.id, fr.status, fr.created_at, u.id AS user_id, u.username, u.display_name, u.avatar
     FROM friend_requests fr JOIN users u ON u.id = fr.sender_id
     WHERE fr.receiver_id=$1 AND fr.status='pending' ORDER BY fr.created_at DESC`,
    [userId]
  );
  return rows.map(r => ({ id: r.id, status: r.status, createdAt: r.created_at, user: { id: r.user_id, username: r.username, displayName: r.display_name || r.username, avatar: r.avatar || '' } }));
}

async function frOutgoing(userId) {
  const { rows } = await pool.query(
    `SELECT fr.id, fr.status, fr.created_at, u.id AS user_id, u.username, u.display_name, u.avatar
     FROM friend_requests fr JOIN users u ON u.id = fr.receiver_id
     WHERE fr.sender_id=$1 AND fr.status='pending' ORDER BY fr.created_at DESC`,
    [userId]
  );
  return rows.map(r => ({ id: r.id, status: r.status, createdAt: r.created_at, user: { id: r.user_id, username: r.username, displayName: r.display_name || r.username, avatar: r.avatar || '' } }));
}

async function frFriends(userId) {
  const { rows } = await pool.query(
    `SELECT u.id, u.username, u.display_name, u.avatar, fr.responded_at
     FROM friend_requests fr JOIN users u ON u.id = CASE WHEN fr.sender_id=$1 THEN fr.receiver_id ELSE fr.sender_id END
     WHERE (fr.sender_id=$1 OR fr.receiver_id=$1) AND fr.status='accepted'
     ORDER BY u.username`,
    [userId]
  );
  return rows.map(r => ({ id: r.id, username: r.username, displayName: r.display_name || r.username, avatar: r.avatar || '' }));
}

module.exports = {
  isEnabled, initDb,
  get pool(){ return pool; },
  get poolRef(){ return pool; },
  getUserById, getUserByUsername, getUserByEmail,
  createAccount, createAccountWithAuth,
  deleteAccount, updateUserProfileById, setUserBadge, setUserBadges,
  countUsers, getAllUsers,
  setVerifyToken, verifyEmail, verifyEmailByCode,
  setResetToken, resetPassword, verifyPassword,
  genToken, genId, isValidHandle,
  searchUsersByPrefix,
  frGetById, frListBetween, frInsert, frSetStatus, frDelete, frIncoming, frOutgoing, frFriends,
  touchLastSeen
};

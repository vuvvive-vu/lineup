const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('./db');
const { sendVerifyCode, sendResetEmail, detectDevice } = require('./email');

const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.JWT_SECRET) {
  console.warn('⚠️  JWT_SECRET не установлен, используется временный ключ (токены будут невалидны после рестарта)');
}
const JWT_EXPIRES = '30d';

const BADGE_PRESETS = {
  founder: { label: 'FOUNDER', theme: 'snow', icon: 'crown', glow: true, snow: true },
  founders_wife: { label: "FOUNDER'S WIFE", theme: 'sakura', icon: 'heart', glow: true, petals: true },
  boo: { label: 'BOO!', theme: 'pumpkin', icon: null, glow: true, witches: true },
};
const ALLOWED_BADGES = Object.keys(BADGE_PRESETS);

const BOO_AUTO_UNTIL = new Date(process.env.BOO_AUTO_UNTIL || '2026-11-01T00:00:00Z');
function isBooAutoActive() { return Date.now() < BOO_AUTO_UNTIL.getTime(); }

const CREATOR_USERNAME = process.env.CREATOR_USERNAME || 'owner';
let CREATOR_ID = process.env.CREATOR_ID || null;
const CREATOR_EMAIL = process.env.CREATOR_EMAIL || null;

function isCreatorLegacy(userOrUsername) {
  if (!userOrUsername) return false;
  if (typeof userOrUsername === 'string') {
    return userOrUsername.toLowerCase() === CREATOR_USERNAME.toLowerCase();
  }
  const u = userOrUsername;
  if (CREATOR_ID && u.id && String(u.id) === String(CREATOR_ID)) return true;
  if (CREATOR_EMAIL && u.email && u.email.toLowerCase() === CREATOR_EMAIL.toLowerCase()) return true;
  if (u.username && u.username.toLowerCase() === CREATOR_USERNAME.toLowerCase()) return true;
  return false;
}

function getBadge(user) {
  if (!user) return null;
  if (user.badge) {
    let b = String(user.badge).toLowerCase();
    if (b === 'developer') b = 'founder';
    if (ALLOWED_BADGES.includes(b)) return b;
  }
  if (isCreatorLegacy(user)) return 'founder';
  return null;
}

function getBadgeState(user) {
  const legacy = getBadge(user);
  let owned = [];
  try { owned = Array.isArray(user?.badges) ? user.badges : JSON.parse(user?.badges || '[]'); } catch {}
  owned = [...new Set(owned.map(v => String(v).toLowerCase()).filter(v => ALLOWED_BADGES.includes(v)))];
  if (!owned.length && legacy) owned = [legacy];
  let active = String(user?.active_badge || legacy || '').toLowerCase();
  if (!owned.includes(active)) active = owned[0] || null;
  return { badges: owned, activeBadge: active, badge: active };
}

function badgeResponse(user) {
  const state = getBadgeState(user);
  return { ...state, isCreator: !!state.activeBadge };
}

function isCreator(userOrUsername) {
  const b = typeof userOrUsername === 'string' ? (userOrUsername.toLowerCase() === CREATOR_USERNAME.toLowerCase() ? 'founder' : null) : getBadge(userOrUsername);
  return !!b;
}

async function resolveCreatorId() {
  if (CREATOR_ID) {
    console.log(`[CREATOR] ID задан из env: ${CREATOR_ID}`);
    return;
  }
  try {
    if (db.isEnabled()) {
      const u = await db.getUserByUsername(CREATOR_USERNAME);
      if (u && u.id) {
        CREATOR_ID = String(u.id);
        console.log(`[CREATOR] Авто-определен ID для @${CREATOR_USERNAME}: ${CREATOR_ID} (теперь можно менять ник)`);
        if (!u.badge) {
          try { await db.setUserBadge(u.id, 'founder'); console.log(`[CREATOR] Выдан badge founder для @${CREATOR_USERNAME}`); } catch {}
        } else if (String(u.badge).toLowerCase() === 'developer') {
          try { await db.setUserBadge(u.id, 'founder'); console.log(`[CREATOR] Мигрирован badge developer -> founder для @${CREATOR_USERNAME}`); } catch {}
        }
      } else {
        console.log(`[CREATOR] Пользователь @${CREATOR_USERNAME} еще не создан, привязка по нику`);
      }
    }
  } catch (e) {
    console.log('[CREATOR] Не удалось определить ID:', e.message);
  }
}

function genCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:3000', 'http://localhost:5173'];

app.use(require('cors')({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://vk.com https://*.vk.com https://vk.ru https://*.vk.ru https://vkvideo.ru https://*.vkvideo.ru https://www.youtube.com https://*.youtube.com https://www.youtube-nocookie.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: https: blob:",
    "media-src 'self' https: blob:",
    "frame-src 'self' https: blob: https://vk.com https://*.vk.com https://vk.ru https://*.vk.ru https://vkvideo.ru https://*.vkvideo.ru https://rutube.ru https://*.rutube.ru https://youtube.com https://*.youtube.com https://www.youtube-nocookie.com https://youtu.be https://*.youtu.be",
    "child-src 'self' https: blob:",
    "connect-src 'self' ws: wss: https:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; '));
  next();
});
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const ROOMS_FILE = path.join(DATA_DIR, 'rooms.json');

function loadJson(file, def) {
  try {
    if (!fs.existsSync(file)) return def;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch { return def; }
}
function saveJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

let rooms = loadJson(ROOMS_FILE, {});
const ephemeralUsers = new Map();
const ephemeralEmailUsers = new Map();

db.initDb().catch(e => console.error('DB init error:', e.message));

function makeToken(accountId) {
  return jwt.sign({ id: accountId }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}
async function parseToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded.id) return null;
    if (db.isEnabled()) {
      const u = await db.getUserById(decoded.id);
      if (u) return u;
      return ephemeralUsers.get(decoded.id) || [...ephemeralEmailUsers.values()].find(x => x.id === decoded.id) || null;
    }
    return ephemeralUsers.get(decoded.id) || [...ephemeralEmailUsers.values()].find(x => x.id === decoded.id) || null;
  } catch { return null; }
}

const rateLimit = new Map();
function checkRateLimit(ip, max = 10, windowMs = 60000) {
  const now = Date.now();
  const entry = rateLimit.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimit.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }
  entry.count++;
  return entry.count <= max;
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimit) {
    if (now > entry.resetAt) rateLimit.delete(ip);
  }
}, 60000);

const codeAttempts = new Map();
function checkCodeAttempts(email, max = 5) {
  const entry = codeAttempts.get(email);
  if (!entry) return { ok: true };
  if (entry.lockedUntil && Date.now() < entry.lockedUntil) {
    const mins = Math.ceil((entry.lockedUntil - Date.now()) / 60000);
    return { ok: false, error: `Слишком много попыток. Попробуй через ${mins} мин.` };
  }
  if (entry.lockedUntil && Date.now() >= entry.lockedUntil) {
    codeAttempts.delete(email);
    return { ok: true };
  }
  return { ok: true };
}
function recordCodeAttempt(email) {
  const entry = codeAttempts.get(email) || { count: 0 };
  entry.count++;
  if (entry.count >= 5) entry.lockedUntil = Date.now() + 15 * 60000;
  codeAttempts.set(email, entry);
}
function clearCodeAttempts(email) {
  codeAttempts.delete(email);
}

function isValidVideoUrl(platform, url) {
  url = url.trim();
  try {
    if (platform === 'vk') {
      return /^(https?:\/\/)?(m\.)?(vk\.com|vk\.ru|vkvideo\.ru)\/video-?\d+_\d+/.test(url) || /video_ext\.php\?.*oid=-?\d+.*id=\d+/.test(url);
    }
    if (platform === 'rutube') {
      return /^(https?:\/\/)?(www\.)?rutube\.ru\/(video|play\/embed)\/[a-f0-9]+/i.test(url);
    }
    if (platform === 'youtube') {
      return /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|embed\/)|youtu\.be\/)[\w-]+/.test(url);
    }
  } catch { return false; }
  return false;
}

function validateBase64Image(dataUrl, maxSizeBytes = 512 * 1024) {
  if (!dataUrl) return { valid: false, error: 'Пустое изображение' };
  if (typeof dataUrl !== 'string') return { valid: false, error: 'Неверный формат' };
  if (!dataUrl.startsWith('data:image/')) return { valid: false, error: 'Только изображения разрешены' };
  const matches = dataUrl.match(/^data:image\/(png|jpeg|jpg|gif|webp);base64,(.+)$/);
  if (!matches) return { valid: false, error: 'Неверный формат изображения' };
  const [, mimeType, base64Data] = matches;
  const byteSize = Math.floor((base64Data.length * 3) / 4);
  if (byteSize > maxSizeBytes) {
    return { valid: false, error: `Изображение слишком большое (макс ${Math.floor(maxSizeBytes / 1024)}KB)` };
  }
  try {
    if (!/^[A-Za-z0-9+/=]+$/.test(base64Data)) {
      return { valid: false, error: 'Неверные данные изображения' };
    }
  } catch {
    return { valid: false, error: 'Ошибка валидации' };
  }
  return { valid: true, data: dataUrl, mimeType, size: byteSize };
}

function toEmbedUrl(platform, url) {
  url = url.trim();
  try {
    if (url.includes('video_ext.php') || url.includes('/play/embed/') || url.includes('/embed/')) return url;
    if (url.includes('vk.com') || url.includes('vkvideo.ru') || url.includes('vk.ru')) {
      const m = url.match(/video(-?\d+)_(\d+)/);
      if (m) {
        const oid = m[1];
        const vid = m[2];
        let hash = '';
        try { hash = new URL(url).searchParams.get('hash') || ''; } catch {}
        let embed = `https://vk.com/video_ext.php?oid=${oid}&id=${vid}&hd=2&js_api=1`;
        if (hash) embed += `&hash=${hash}`;
        return embed;
      }
      const oidMatch = url.match(/oid=(-?\d+)/);
      const idMatch = url.match(/[?&]id=(\d+)/);
      if (oidMatch && idMatch) return `https://vk.com/video_ext.php?oid=${oidMatch[1]}&id=${idMatch[1]}&hd=2&js_api=1`;
    }
    if (url.includes('rutube.ru')) {
      const m = url.match(/rutube\.ru\/video\/([a-f0-9]+)/i);
      if (m) return `https://rutube.ru/play/embed/${m[1]}`;
    }
    if (url.includes('youtu.be') || url.includes('youtube.com')) {
      let id = null;
      if (url.includes('youtu.be/')) id = url.split('youtu.be/')[1].split(/[?&#]/)[0];
      else if (url.includes('v=')) {
        try { id = new URL(url).searchParams.get('v'); } catch {}
      }
      if (id) return `https://www.youtube.com/embed/${id}?enablejsapi=1`;
    }
  } catch {}
  return url;
}

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'lineup_admin_2024';
const adminTokens = new Set();
function makeAdminToken() { return Buffer.from('admin:' + Date.now() + ':' + Math.random().toString(36).slice(2)).toString('base64'); }
function isAdmin(req) {
  const tok = (req.headers.authorization || '').replace('Bearer ', '').trim();
  return tok && adminTokens.has(tok);
}

// --- Public API ---

app.post('/api/auth', async (req, res) => {
  try {
    let { displayName, username, avatar, bio } = req.body;
    displayName = (displayName || username || '').trim();
    if (!displayName) return res.status(400).json({ error: 'Введи имя' });
    if (displayName.length < 1) return res.status(400).json({ error: 'Имя минимум 1 символ' });
    if (displayName.length > 20) return res.status(400).json({ error: 'Имя максимум 20 символов' });
    if (avatar && avatar.length > 0) {
      if (!avatar.startsWith('data:image/') && avatar.length < 10) {
        console.log('[AUTH] Аватар - эмодзи, пропускаем валидацию');
      } else if (avatar.startsWith('data:image/')) {
        console.log('[AUTH] Валидация base64 изображения...');
        const validation = validateBase64Image(avatar, 512 * 1024);
        if (!validation.valid) {
          console.log('[AUTH] ❌ Валидация провалилась:', validation.error);
          return res.status(400).json({ error: validation.error });
        }
        avatar = validation.data;
      } else {
        console.log('[AUTH] Неизвестный формат аватара, очищаем');
        avatar = '';
      }
    } else {
      console.log('[AUTH] Аватар пустой, пропускаем валидацию');
      avatar = '';
    }
    bio = (bio || '').toString().slice(0, 120);
    const user = { displayName, avatar: avatar || '', bio: '' };
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const createdAt = new Date().toISOString();
    ephemeralUsers.set(id, { id, username: null, displayName, avatar: avatar || '', bio: '', createdAt });
    const token = makeToken(id);
    res.json({ token, displayName, username: null, avatar: avatar || '', bio: '', createdAt });
  } catch (e) { console.error('/api/auth error:', e); res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.post('/api/logout', async (req, res) => {
  res.json({ ok: true });
});

app.post('/api/register', async (req, res) => {
  try {
    const { displayName, username, avatar, bio } = req.body;
    let d = (displayName || username || '').trim();
    if (!d) return res.status(400).json({ error: 'Введи имя' });
    const user = { displayName: d, avatar: avatar || '', bio: bio || '' };
    if (db.isEnabled()) {
      const created = await db.createAccount(user);
      return res.json({ token: makeToken(created.id), displayName: created.display_name, username: created.username, avatar: created.avatar, bio: created.bio, createdAt: created.created_at || null });
    }
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const createdAt = new Date().toISOString();
    ephemeralUsers.set(id, { id, displayName: d, avatar: user.avatar, bio: user.bio, createdAt });
    res.json({ token: makeToken(id), displayName: d, avatar: user.avatar, bio: user.bio, createdAt });
  } catch (e) { console.error('/api/register error:', e); res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.post('/api/login', async (req, res) => {
  try {
    const { displayName, username, avatar, bio } = req.body;
    let d = (displayName || username || '').trim();
    if (!d) return res.status(400).json({ error: 'Введи имя' });
    const user = { displayName: d, avatar: avatar || '', bio: bio || '' };
    if (db.isEnabled()) {
      const created = await db.createAccount(user);
      const st = getBadgeState(created);
      return res.json({ token: makeToken(created.id), displayName: created.display_name, username: created.username, avatar: created.avatar, bio: created.bio, createdAt: created.created_at || null, ...st, isCreator: !!st.activeBadge });
    }
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const createdAtLogin = new Date().toISOString();
    ephemeralUsers.set(id, { id, displayName: d, avatar: user.avatar, bio: user.bio, createdAt: createdAtLogin });
    res.json({ token: makeToken(id), displayName: d, avatar: user.avatar, bio: user.bio, createdAt: createdAtLogin, badges: [], activeBadge: null, badge: null, isCreator: false });
  } catch (e) { console.error('/api/login error:', e); res.status(500).json({ error: 'Ошибка сервера' }); }
});

const bcrypt = require('bcrypt');

app.post('/api/auth/register-email', async (req, res) => {
  try {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    if (!checkRateLimit(ip, 5, 300000)) return res.status(429).json({ error: 'Слишком много регистраций. Подожди 5 минут.' });
    let { displayName, username, email, password } = req.body;
    displayName = (displayName || '').trim();
    username = (username || '').trim().toLowerCase();
    email = (email || '').trim().toLowerCase();
    password = password || '';
    if (!displayName || displayName.length < 1 || displayName.length > 20) return res.status(400).json({ error: 'Имя 1-20 символов' });
    if (!username || !/^[a-z0-9_-]{3,20}$/.test(username)) return res.status(400).json({ error: 'Имя пользователя 3-20 символов: a-z, 0-9, -_' });
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Некорректный email' });
    if (!password || password.length < 6) return res.status(400).json({ error: 'Пароль минимум 6 символов' });

    const code = genCode();

    if (db.isEnabled()) {
      const existingEmail = await db.getUserByEmail(email);
      if (existingEmail) return res.status(400).json({ error: 'Email уже зарегистрирован' });
      const existingUser = await db.getUserByUsername(username);
      if (existingUser) return res.status(400).json({ error: 'Это имя пользователя уже занято' });
      const { user, verifyToken } = await db.createAccountWithAuth({ displayName, username, email, password });
      await db.setVerifyToken(user.id, code);
      const device = detectDevice(req.headers['user-agent']);
      const emailSent = await sendVerifyCode(email, code, displayName, device);
      const token = makeToken(user.id);
      const st = getBadgeState(user);
      return res.json({ token, displayName: user.display_name, username: user.username, avatar: user.avatar || '', bio: user.bio || '', email, emailVerified: false, codeSent: emailSent, createdAt: user.created_at || new Date().toISOString(), ...st, isCreator: !!st.activeBadge });
    }

    if (ephemeralEmailUsers.has(email)) return res.status(400).json({ error: 'Email уже зарегистрирован' });
    if ([...ephemeralEmailUsers.values()].some(u => u.username === username)) return res.status(400).json({ error: 'Это имя пользователя уже занято' });
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const passwordHash = await bcrypt.hash(password, 10);
    const createdAtEphem = new Date().toISOString();
    ephemeralEmailUsers.set(email, { id, displayName, username, email, passwordHash, avatar: '', bio: '', emailVerified: false, verifyCode: code, createdAt: createdAtEphem });
    console.log(`[AUTH] Код для ${email}: ${code}`);
    const token = makeToken(id);
    res.json({ token, displayName, username, avatar: '', bio: '', email, emailVerified: false, codeSent: false, createdAt: createdAtEphem });
  } catch (e) {
    console.error('Register error:', e);
    res.status(500).json({ error: 'Ошибка регистрации' });
  }
});

app.post('/api/auth/login-email', async (req, res) => {
  try {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    if (!checkRateLimit(ip, 10, 60000)) return res.status(429).json({ error: 'Слишком много попыток. Подожди минуту.' });
    let { email, password } = req.body;
    email = (email || '').trim().toLowerCase();
    password = password || '';
    if (!email || !password) return res.status(400).json({ error: 'Введите email и пароль' });

    if (db.isEnabled()) {
      const user = await db.verifyPassword(email, password);
      if (!user) return res.status(401).json({ error: 'Неверный email или пароль' });
      const token = makeToken(user.id);
      const st = getBadgeState(user);
      return res.json({ token, displayName: user.display_name, username: user.username, avatar: user.avatar || '', bio: user.bio || '', email: user.email, emailVerified: user.email_verified, createdAt: user.created_at || null, ...st, isCreator: !!st.activeBadge });
    }

    const user = ephemeralEmailUsers.get(email);
    if (!user) return res.status(401).json({ error: 'Неверный email или пароль' });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Неверный email или пароль' });
    const token = makeToken(user.id);
    const st2 = getBadgeState(user);
    res.json({ token, displayName: user.displayName, username: user.username, avatar: user.avatar, bio: user.bio, email: user.email, emailVerified: user.emailVerified, createdAt: user.createdAt || null, ...st2, isCreator: !!st2.activeBadge });
  } catch (e) {
    console.error('Login error:', e);
    res.status(500).json({ error: 'Ошибка входа' });
  }
});

app.post('/api/auth/verify-code', async (req, res) => {
  try {
    let { email, code } = req.body;
    email = (email || '').trim().toLowerCase();
    code = (code || '').trim();
    if (!email || !code) return res.status(400).json({ error: 'Введите email и код' });

    const attemptCheck = checkCodeAttempts(email);
    if (!attemptCheck.ok) return res.status(429).json({ error: attemptCheck.error });

    if (db.isEnabled()) {
      const user = await db.getUserByEmail(email);
      if (!user) return res.status(400).json({ error: 'Пользователь не найден' });
      if (user.email_verified) return res.json({ success: true, message: 'Почта уже подтверждена' });
      const ok = await db.verifyEmailByCode(email, code);
      if (!ok) { recordCodeAttempt(email); return res.status(400).json({ error: 'Неверный или просроченный код' }); }
      clearCodeAttempts(email);
      return res.json({ success: true });
    }

    const user = ephemeralEmailUsers.get(email);
    if (!user) return res.status(400).json({ error: 'Пользователь не найден' });
    if (user.emailVerified) return res.json({ success: true, message: 'Почта уже подтверждена' });
    if (user.verifyCode !== code) { recordCodeAttempt(email); return res.status(400).json({ error: 'Неверный код' }); }
    clearCodeAttempts(email);
    user.emailVerified = true;
    user.verifyCode = null;
    res.json({ success: true });
  } catch (e) {
    console.error('Verify code error:', e);
    res.status(500).json({ error: 'Ошибка верификации' });
  }
});

app.post('/api/auth/forgot', async (req, res) => {
  try {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    if (!checkRateLimit(ip, 3, 300000)) return res.status(429).json({ error: 'Слишком много запросов. Подожди 5 минут.' });
    let { email } = req.body;
    email = (email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'Введите email' });

    const code = genCode();

    if (db.isEnabled()) {
      const user = await db.getUserByEmail(email);
      if (user) {
        const expires = new Date(Date.now() + 3600000);
        await db.pool.query('UPDATE users SET reset_token=$1, reset_expires=$2 WHERE id=$3', [code, expires, user.id]);
        await sendResetEmail(email, code, user.username);
      }
      return res.json({ ok: true, message: 'Если аккаунт с таким email существует, код отправлен' });
    }

    const user = ephemeralEmailUsers.get(email);
    if (user) {
      user.resetCode = code;
      user.resetExpires = Date.now() + 3600000;
      await sendResetEmail(email, code, user.username);
    }
    res.json({ ok: true, message: 'Если аккаунт с таким email существует, код отправлен' });
  } catch (e) {
    console.error('Forgot error:', e);
    res.status(500).json({ error: 'Ошибка' });
  }
});

app.post('/api/auth/reset', async (req, res) => {
  try {
    const { email, code, password } = req.body;
    if (!email || !code || !password) return res.status(400).json({ error: 'Требуется email, код и пароль' });
    if (password.length < 6) return res.status(400).json({ error: 'Пароль минимум 6 символов' });

    if (db.isEnabled()) {
      const user = await db.getUserByEmail(email);
      if (!user || String(user.reset_token) !== String(code) || !user.reset_expires || new Date(user.reset_expires) < new Date()) {
        return res.status(400).json({ error: 'Неверный или просроченный код' });
      }
      const hash = await bcrypt.hash(password, 10);
      await db.pool.query('UPDATE users SET password_hash=$1, reset_token=null, reset_expires=null WHERE id=$2', [hash, user.id]);
      return res.json({ ok: true });
    }

    const user = ephemeralEmailUsers.get(email);
    if (user && user.resetCode === code && user.resetExpires > Date.now()) {
      user.passwordHash = await bcrypt.hash(password, 10);
      user.resetCode = null;
      user.resetExpires = null;
      return res.json({ ok: true });
    }
    res.status(400).json({ error: 'Неверный или просроченный код' });
  } catch (e) {
    console.error('Reset error:', e);
    res.status(500).json({ error: 'Ошибка' });
  }
});

app.get('/api/me', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const user = await parseToken(token);
  if (!user) return res.status(401).json({ error: 'Не авторизован' });
  const isGuest = !user.email;
  let badge = getBadgeState(user);
  let booJustGranted = false;
  if (!isGuest && isBooAutoActive() && !badge.badges.includes('boo')) {
    const newBadges = [...badge.badges, 'boo'];
    const active = badge.activeBadge;
    try {
      if (db.isEnabled()) {
        await db.setUserBadges(user.id, newBadges, active);
      } else {
        user.badges = newBadges;
        user.active_badge = active;
        user.badge = active;
      }
      badge = { badges: newBadges, activeBadge: active, badge: active };
      booJustGranted = true;
    } catch (e) { console.error('boo auto-grant error:', e.message); }
  }
  res.json({
    displayName: user.display_name || user.displayName || user.username,
    username: user.username || null,
    avatar: user.avatar || '',
    bio: user.bio || '',
    email: user.email || null,
    emailVerified: user.email_verified || false,
    isGuest,
    createdAt: user.created_at || user.createdAt || null,
    ...badge,
    booJustGranted,
    isCreator: !!badge.activeBadge
  });
});

app.get('/api/users/:username', async (req, res) => {
  if (db.isEnabled()) {
    const { rows } = await db.pool.query('SELECT id, username, display_name, avatar, bio, badge, badges, active_badge, email, created_at FROM users WHERE lower(username)=lower($1) ORDER BY created_at DESC LIMIT 1', [req.params.username]);
    if (rows[0]) {
      const badge = getBadgeState(rows[0]);
      return res.json({ displayName: rows[0].display_name, username: rows[0].username, avatar: rows[0].avatar || '', bio: rows[0].bio || '', createdAt: rows[0].created_at || null, ...badge, isCreator: !!badge.activeBadge });
    }
  }
  const u = [...ephemeralUsers.values()].find(x => (x.username && x.username.toLowerCase() === req.params.username.toLowerCase()) || x.displayName === req.params.username)
    || [...ephemeralEmailUsers.values()].find(x => x.username && x.username.toLowerCase() === req.params.username.toLowerCase())
    || { displayName: req.params.username, username: null, avatar: '', bio: '' };
  const badge = getBadgeState(u);
  res.json({ displayName: u.displayName || u.display_name || u.username, username: u.username || null, avatar: u.avatar || '', bio: u.bio || '', createdAt: u.createdAt || u.created_at || null, ...badge, isCreator: !!badge.activeBadge });
});

// --- Friends system ---

const memFriendRequests = new Map(); // memory-mode store (DB mode uses friend_requests table)

function frRowDbToApi(r) {
  return r && { id: r.id, senderId: r.sender_id, receiverId: r.receiver_id, status: r.status, createdAt: r.created_at, respondedAt: r.responded_at };
}
function findMemUserById(id) {
  return [...ephemeralEmailUsers.values()].find(u => String(u.id) === String(id)) || ephemeralUsers.get(id) || null;
}
function findMemUserByUsername(username) {
  const q = String(username || '').toLowerCase();
  return [...ephemeralEmailUsers.values()].find(u => u.username && u.username.toLowerCase() === q) || null;
}
function memUserCard(u) {
  return { id: u.id, username: u.username, displayName: u.displayName || u.username, avatar: u.avatar || '' };
}

const FR = {
  async getById(id) { return db.isEnabled() ? frRowDbToApi(await db.frGetById(id)) : (memFriendRequests.get(id) || null); },
  async listBetween(aId, bId) {
    if (db.isEnabled()) return (await db.frListBetween(aId, bId)).map(frRowDbToApi);
    return [...memFriendRequests.values()].filter(r => (String(r.senderId) === String(aId) && String(r.receiverId) === String(bId)) || (String(r.senderId) === String(bId) && String(r.receiverId) === String(aId)));
  },
  async insert(senderId, receiverId) {
    if (db.isEnabled()) return frRowDbToApi(await db.frInsert(senderId, receiverId));
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const row = { id, senderId: String(senderId), receiverId: String(receiverId), status: 'pending', createdAt: new Date().toISOString(), respondedAt: null };
    memFriendRequests.set(id, row);
    return row;
  },
  async setStatus(id, status) {
    if (db.isEnabled()) return frRowDbToApi(await db.frSetStatus(id, status));
    const r = memFriendRequests.get(id);
    if (!r) return null;
    r.status = status;
    r.respondedAt = new Date().toISOString();
    return r;
  },
  async remove(id) {
    if (db.isEnabled()) return db.frDelete(id);
    memFriendRequests.delete(id);
  },
  async incoming(userId) {
    if (db.isEnabled()) return db.frIncoming(userId);
    return [...memFriendRequests.values()]
      .filter(r => String(r.receiverId) === String(userId) && r.status === 'pending')
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .map(r => ({ id: r.id, status: r.status, createdAt: r.createdAt, user: memUserCard(findMemUserById(r.senderId) || { id: r.senderId, username: 'unknown', displayName: 'unknown' }) }));
  },
  async outgoing(userId) {
    if (db.isEnabled()) return db.frOutgoing(userId);
    return [...memFriendRequests.values()]
      .filter(r => String(r.senderId) === String(userId) && r.status === 'pending')
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .map(r => ({ id: r.id, status: r.status, createdAt: r.createdAt, user: memUserCard(findMemUserById(r.receiverId) || { id: r.receiverId, username: 'unknown', displayName: 'unknown' }) }));
  },
  async friends(userId) {
    if (db.isEnabled()) return db.frFriends(userId);
    const ids = new Set();
    for (const r of memFriendRequests.values()) {
      if (r.status !== 'accepted') continue;
      if (String(r.senderId) === String(userId)) ids.add(r.receiverId);
      else if (String(r.receiverId) === String(userId)) ids.add(r.senderId);
    }
    return [...ids].map(findMemUserById).filter(Boolean).map(memUserCard)
      .sort((a, b) => a.username.localeCompare(b.username));
  }
};

// pluggable notifications: stored in memory, clients poll /api/friends/summary;
// later this hook can also push via WS / email without touching call sites
const userNotifications = new Map();
function notifyUser(userId, payload) {
  try {
    if (!userId) return;
    const list = userNotifications.get(String(userId)) || [];
    list.push({ ...payload, at: new Date().toISOString() });
    userNotifications.set(String(userId), list.slice(-20));
  } catch {}
}

async function getAuthUser(req) {
  return parseToken((req.headers.authorization || '').replace('Bearer ', ''));
}
function requireAccount(me) { return !!(me && me.username && me.email); }

async function findUserByUsernameAny(username) {
  if (db.isEnabled()) return db.getUserByUsername(username);
  return findMemUserByUsername(username);
}

app.get('/api/search/users', async (req, res) => {
  try {
    const me = await getAuthUser(req);
    if (!me) return res.status(401).json({ error: 'Не авторизован' });
    const q = String(req.query.q || '').trim().replace(/^@+/, '').toLowerCase();
    if (q.length < 3 || !/^[a-z0-9_-]+$/.test(q)) return res.json({ users: [] });
    let users;
    if (db.isEnabled()) {
      users = await db.searchUsersByPrefix(q, me.id);
    } else {
      users = [...ephemeralEmailUsers.values()]
        .filter(u => u.username && u.username.toLowerCase().startsWith(q) && String(u.id) !== String(me.id))
        .sort((a, b) => a.username.localeCompare(b.username)).slice(0, 8)
        .map(memUserCard);
    }
    res.json({ users });
  } catch (e) {
    console.error('/api/search/users error:', e);
    res.status(500).json({ error: 'Ошибка поиска' });
  }
});

app.get('/api/relationship/:username', async (req, res) => {
  try {
    const me = await getAuthUser(req);
    if (!me) return res.status(401).json({ error: 'Не авторизован' });
    const target = await findUserByUsernameAny(req.params.username);
    if (!target) return res.status(404).json({ error: 'Пользователь не найден' });
    if (String(target.id) === String(me.id)) return res.json({ status: 'self', requestId: null });
    const rows = await FR.listBetween(me.id, target.id);
    const accepted = rows.find(r => r.status === 'accepted');
    if (accepted) return res.json({ status: 'accepted', requestId: accepted.id });
    const sent = rows.find(r => r.status === 'pending' && String(r.senderId) === String(me.id));
    if (sent) return res.json({ status: 'pending_sent', requestId: sent.id });
    const received = rows.find(r => r.status === 'pending' && String(r.receiverId) === String(me.id));
    if (received) return res.json({ status: 'pending_received', requestId: received.id });
    res.json({ status: 'none', requestId: null });
  } catch (e) {
    console.error('/api/relationship error:', e);
    res.status(500).json({ error: 'Ошибка' });
  }
});

app.post('/api/friend-requests', async (req, res) => {
  try {
    const me = await getAuthUser(req);
    if (!me) return res.status(401).json({ error: 'Не авторизован' });
    if (!requireAccount(me)) return res.status(403).json({ error: 'Друзья доступны только для аккаунтов с именем пользователя' });
    const username = String(req.body?.username || '').trim().replace(/^@+/, '').toLowerCase();
    if (!username) return res.status(400).json({ error: 'Укажите username' });
    const target = await findUserByUsernameAny(username);
    if (!target) return res.status(404).json({ error: 'Пользователь не найден' });
    if (String(target.id) === String(me.id)) return res.status(400).json({ error: 'Нельзя отправить заявку самому себе' });
    if (!requireAccount(target)) return res.status(400).json({ error: 'У этого пользователя нет имени пользователя' });

    const rows = await FR.listBetween(me.id, target.id);
    const accepted = rows.find(r => r.status === 'accepted');
    if (accepted) return res.status(400).json({ error: 'Вы уже друзья' });
    const received = rows.find(r => r.status === 'pending' && String(r.receiverId) === String(me.id));
    if (received) {
      // встречные заявки — сразу дружим
      const row = await FR.setStatus(received.id, 'accepted');
      notifyUser(target.id, { type: 'friend_accept', username: me.username, text: `@${me.username} принял(а) вашу заявку в друзья` });
      return res.json({ status: 'accepted', requestId: row?.id || null, autoAccepted: true });
    }
    const sent = rows.find(r => r.status === 'pending' && String(r.senderId) === String(me.id));
    if (sent) return res.status(400).json({ error: 'Заявка уже отправлена' });
    for (const r of rows) { if (r.status !== 'pending') await FR.remove(r.id); } // чистим rejected-историю
    const row = await FR.insert(String(me.id), String(target.id));
    notifyUser(target.id, { type: 'friend_request', username: me.username, text: `@${me.username} отправил(а) вам заявку в друзья` });
    res.json({ status: 'pending_sent', requestId: row.id });
  } catch (e) {
    console.error('POST /api/friend-requests error:', e);
    res.status(500).json({ error: 'Ошибка отправки заявки' });
  }
});

async function handleFriendRequestAction(req, res, action) {
  const me = await getAuthUser(req);
  if (!me) return res.status(401).json({ error: 'Не авторизован' });
  const row = await FR.getById(req.params.id);
  if (!row) return res.status(404).json({ error: 'Заявка не найдена' });
  if (action === 'cancel') {
    if (String(row.senderId) !== String(me.id)) return res.status(403).json({ error: 'Отменить может только отправитель' });
    if (row.status !== 'pending') return res.status(400).json({ error: 'Заявка уже обработана' });
    await FR.remove(row.id);
    return res.json({ status: 'cancelled', requestId: row.id });
  }
  if (String(row.receiverId) !== String(me.id)) return res.status(403).json({ error: 'Нет доступа к этой заявке' });
  if (row.status !== 'pending') return res.status(400).json({ error: 'Заявка уже обработана' });
  const updated = await FR.setStatus(row.id, action === 'accept' ? 'accepted' : 'rejected');
  if (action === 'accept') notifyUser(String(row.senderId), { type: 'friend_accept', username: me.username, text: `@${me.username} принял(а) вашу заявку в друзья` });
  return res.json({ status: updated.status, requestId: updated.id });
}
app.post('/api/friend-requests/:id/accept', async (req, res) => {
  try { await handleFriendRequestAction(req, res, 'accept'); } catch (e) { console.error('accept error:', e); res.status(500).json({ error: 'Ошибка' }); }
});
app.post('/api/friend-requests/:id/reject', async (req, res) => {
  try { await handleFriendRequestAction(req, res, 'reject'); } catch (e) { console.error('reject error:', e); res.status(500).json({ error: 'Ошибка' }); }
});
app.post('/api/friend-requests/:id/cancel', async (req, res) => {
  try { await handleFriendRequestAction(req, res, 'cancel'); } catch (e) { console.error('cancel error:', e); res.status(500).json({ error: 'Ошибка' }); }
});

app.get('/api/friend-requests/incoming', async (req, res) => {
  try {
    const me = await getAuthUser(req);
    if (!me) return res.status(401).json({ error: 'Не авторизован' });
    res.json({ requests: await FR.incoming(me.id) });
  } catch (e) { console.error('incoming error:', e); res.status(500).json({ error: 'Ошибка' }); }
});

app.get('/api/friend-requests/outgoing', async (req, res) => {
  try {
    const me = await getAuthUser(req);
    if (!me) return res.status(401).json({ error: 'Не авторизован' });
    res.json({ requests: await FR.outgoing(me.id) });
  } catch (e) { console.error('outgoing error:', e); res.status(500).json({ error: 'Ошибка' }); }
});

app.get('/api/friends', async (req, res) => {
  try {
    const me = await getAuthUser(req);
    if (!me) return res.status(401).json({ error: 'Не авторизован' });
    res.json({ friends: await FR.friends(me.id) });
  } catch (e) { console.error('friends error:', e); res.status(500).json({ error: 'Ошибка' }); }
});

app.post('/api/friends/remove', async (req, res) => {
  try {
    const me = await getAuthUser(req);
    if (!me) return res.status(401).json({ error: 'Не авторизован' });
    const username = String(req.body?.username || '').trim().replace(/^@+/, '').toLowerCase();
    const target = await findUserByUsernameAny(username);
    if (!target) return res.status(404).json({ error: 'Пользователь не найден' });
    const rows = await FR.listBetween(me.id, target.id);
    const accepted = rows.find(r => r.status === 'accepted');
    if (!accepted) return res.status(404).json({ error: 'Вы не друзья' });
    await FR.remove(accepted.id);
    res.json({ status: 'removed' });
  } catch (e) { console.error('remove friend error:', e); res.status(500).json({ error: 'Ошибка' }); }
});

app.get('/api/friends/summary', async (req, res) => {
  try {
    const me = await getAuthUser(req);
    if (!me) return res.status(401).json({ error: 'Не авторизован' });
    const incoming = await FR.incoming(me.id);
    res.json({
      incoming: incoming.length,
      lastIncomingUsername: incoming[0]?.user?.username || null,
      friends: (await FR.friends(me.id)).length
    });
  } catch (e) { console.error('summary error:', e); res.status(500).json({ error: 'Ошибка' }); }
});

app.put('/api/me', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const user = await parseToken(token);
  if (!user) return res.status(401).json({ error: 'Не авторизован' });
  let { displayName, username, avatar, bio, activeBadge } = req.body;
  const isGuest = !user.email;
  if (isGuest && username) return res.status(403).json({ error: 'Гости не могут менять username' });
  displayName = displayName !== undefined ? displayName.trim() : (user.display_name || user.displayName || user.username);
  if (!displayName || displayName.length < 1 || displayName.length > 20) return res.status(400).json({ error: 'Имя 1-20 символов' });
  if (!isGuest && username !== undefined) {
    username = username.trim().toLowerCase();
    if (!/^[a-z0-9_-]{3,20}$/.test(username)) return res.status(400).json({ error: 'Имя пользователя 3-20: a-z, 0-9, -_' });
    if (username !== (user.username || '').toLowerCase()) {
      let exists = null;
      if (db.isEnabled()) exists = await db.getUserByUsername(username);
      else exists = [...ephemeralEmailUsers.values()].find(u => u.username === username);
      if (exists && exists.id !== user.id) return res.status(400).json({ error: 'Это имя пользователя уже занято' });
    }
  } else {
    username = user.username;
  }

  if (avatar !== undefined) {
    if (avatar && avatar.length > 0) {
      if (!avatar.startsWith('data:image/') && avatar.length < 10) {
      } else if (avatar.startsWith('data:image/')) {
        const validation = validateBase64Image(avatar, 512 * 1024);
        if (!validation.valid) return res.status(400).json({ error: validation.error });
        avatar = validation.data;
      } else {
        avatar = '';
      }
    } else {
      avatar = '';
    }
  } else {
    avatar = user.avatar;
  }

  bio = bio !== undefined ? bio.toString().slice(0, 120) : user.bio;
  const wasCreator = isCreator(user);
  if (db.isEnabled()) {
    await db.updateUserProfileById(user.id, { displayName, username, avatar, bio });
    const updated = await db.getUserById(user.id);
    const state = getBadgeState(updated);
    if (activeBadge !== undefined && state.badges.includes(activeBadge)) {
      await db.setUserBadges(user.id, state.badges, activeBadge);
    }
    const finalUser = await db.getUserById(user.id);
    const newToken = makeToken(user.id);
    if (wasCreator) {
      CREATOR_ID = String(updated.id);
      console.log(`[CREATOR] Ник сменен @${user.username} -> @${updated.username}, новый ID закэширован: ${CREATOR_ID}`);
    }
    const badgeUpd = getBadgeState(finalUser);
    return res.json({ displayName: updated.display_name, username: updated.username, avatar: updated.avatar, bio: updated.bio, token: newToken, ...badgeUpd, isCreator: !!badgeUpd.activeBadge });
  }
  if (!isGuest) {
    const entry = [...ephemeralEmailUsers.entries()].find(([k, v]) => v.id === user.id);
    if (entry) {
      const [email, obj] = entry;
      obj.displayName = displayName;
      obj.username = username;
      obj.avatar = avatar || '';
      obj.bio = bio || '';
      ephemeralEmailUsers.set(email, obj);
    }
  } else {
    ephemeralUsers.set(user.id, { id: user.id, displayName, avatar: avatar || '', bio: bio || '' });
  }
  const newToken = makeToken(user.id);
  const fresh = { id: user.id, username, badge: user.badge, badges: user.badges, active_badge: user.active_badge };
  const badgeNew = getBadgeState(fresh);
  res.json({ displayName, username, avatar: avatar || '', bio: bio || '', token: newToken, ...badgeNew, isCreator: !!badgeNew.activeBadge });
});

app.get('/api/check-username', async (req, res) => {
  let { username } = req.query;
  username = (username || '').trim().toLowerCase();
  if (!/^[a-z0-9_-]{3,20}$/.test(username)) return res.json({ available: false, reason: 'invalid' });
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    try {
      const me = await parseToken(token);
      if (me && me.username && me.username.toLowerCase() === username) return res.json({ available: true, own: true });
    } catch {}
  }
  let exists = null;
  if (db.isEnabled()) exists = await db.getUserByUsername(username);
  else exists = [...ephemeralEmailUsers.values()].find(u => u.username === username) || [...ephemeralUsers.values()].find(u => u.username === username);
  res.json({ available: !exists });
});

app.post('/api/rooms', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const user = await parseToken(token);
  if (!user) return res.status(401).json({ error: 'Войдите в аккаунт' });
  let { platform, videoUrl, title } = req.body;
  if (!platform || !videoUrl) return res.status(400).json({ error: 'Выберите площадку и вставьте ссылку' });
  platform = platform.toLowerCase();
  if (!['vk', 'rutube', 'youtube'].includes(platform)) return res.status(400).json({ error: 'Неизвестная площадка' });
  if (!isValidVideoUrl(platform, videoUrl)) {
    const examples = { vk: 'Пример VK: https://vk.com/video-123456_789 или https://vkvideo.ru/video-123456_789', rutube: 'Пример RuTube: https://rutube.ru/video/abc123...', youtube: 'Пример YouTube: https://www.youtube.com/watch?v=XXXX или https://youtu.be/XXXX' };
    return res.status(400).json({ error: `Неверная ссылка для ${platform.toUpperCase()}. ${examples[platform]}` });
  }
  const embedUrl = toEmbedUrl(platform, videoUrl);
  let code;
  do { code = genCode(); } while (rooms[code]);
  const room = {
    code, title: title?.trim() || 'Без названия', platform, videoUrl, embedUrl,
    host: user.username, createdAt: new Date().toISOString(),
    messages: [{ username: 'Togetherly System', text: 'Поддержите проект подпиской на телеграм канал t.me/togetherlyonl\n\nПриятного просмотра!🎬', ts: Date.now(), system: true }],
    bans: []
  };
  rooms[code] = room;
  saveJson(ROOMS_FILE, rooms);
  res.json({ code, room });
});

app.get('/api/rooms/:code', (req, res) => {
  const room = rooms[req.params.code.toUpperCase()];
  if (!room) return res.status(404).json({ error: 'Комната не найдена' });
  res.json(room);
});

// --- Admin Routes ---

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Неверный пароль' });
  const tok = makeAdminToken();
  adminTokens.add(tok);
  if (adminTokens.size > 20) adminTokens.delete([...adminTokens][0]);
  res.json({ token: tok });
});

app.get('/api/admin/stats', (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
  let online = 0;
  for (const s of roomClients.values()) online += s.size;
  let messages = 0;
  for (const r of Object.values(rooms)) messages += r.messages ? r.messages.length : 0;
  const roomList = Object.values(rooms).map(r => {
    const set = roomClients.get(r.code);
    return { code: r.code, title: r.title, host: r.host, count: set ? set.size : 0, hostOnline: set ? [...set].some(c => c.username === r.host) : false, createdAt: r.createdAt };
  });
  const userList = [];
  for (const [code, set] of roomClients.entries()) {
    for (const c of set) userList.push({ username: c.username, code });
  }
  res.json({ rooms: Object.keys(rooms).length, online, messages, dbUsers: db.isEnabled(), roomList, userList });
});

app.post('/api/admin/broadcast', (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'Текст пустой' });
  const msg = { username: 'Togetherly System', text: text.trim().slice(0, 500), ts: Date.now(), system: true };
  for (const code of Object.keys(rooms)) {
    rooms[code].messages.push(msg);
    if (rooms[code].messages.length > 200) rooms[code].messages.shift();
    broadcast(code, { type: 'chat', ...msg, avatar: '⚙️' });
  }
  saveJson(ROOMS_FILE, rooms);
  res.json({ ok: true });
});

app.post('/api/admin/rooms/:code/close', (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
  const code = req.params.code.toUpperCase();
  const r = rooms[code];
  if (!r) return res.status(404).json({ error: 'Room not found' });
  const set = roomClients.get(code);
  if (set) {
    broadcast(code, { type: 'chat', username: 'Togetherly System', text: `Комната ${code} закрыта админом`, ts: Date.now(), avatar: '⚙️', system: true });
    for (const c of [...set]) { try { c.close(1008, 'Room closed by admin'); } catch {} }
    roomClients.delete(code);
  }
  delete rooms[code];
  saveJson(ROOMS_FILE, rooms);
  res.json({ ok: true });
});

app.post('/api/admin/rooms/:code/clear', (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
  const code = req.params.code.toUpperCase();
  const r = rooms[code];
  if (!r) return res.status(404).json({ error: 'Room not found' });
  r.messages = [];
  saveJson(ROOMS_FILE, rooms);
  broadcast(code, { type: 'clear_chat' });
  res.json({ ok: true });
});

app.post('/api/admin/users/:username/kick', (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
  const uname = req.params.username;
  let kicked = 0;
  for (const [code, set] of roomClients.entries()) {
    for (const c of [...set]) {
      if (c.username === uname) {
        try {
          c.send(JSON.stringify({ type: 'chat', username: 'Togetherly System', text: `${uname} кикнут админом`, ts: Date.now(), avatar: '⚙️', system: true }));
          c.close(1008, 'Kicked by admin');
        } catch {}
        kicked++;
      }
    }
  }
  res.json({ ok: true, kicked });
});

app.get('/api/admin/accounts', async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
  const accounts = [];
  if (db.isEnabled()) {
    const users = await db.getAllUsers();
    return res.json({ accounts: users.map(u => ({ id: u.id, username: u.username, avatar: u.avatar || '😎', bio: u.bio || '', ...getBadgeState(u), created: u.created_at })) });
  }
  for (const [id, u] of ephemeralEmailUsers) {
    accounts.push({ id, username: u.username || id, avatar: u.avatar || '😎', bio: u.bio || '', ...getBadgeState(u), created: null });
  }
  res.json({ accounts });
});

app.put('/api/admin/accounts/:id/badge', async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
  let { badges, activeBadge } = req.body || {};
  badges = Array.isArray(badges) ? badges.map(v => String(v).toLowerCase().trim()) : [];
  if (badges.some(b => !ALLOWED_BADGES.includes(b))) return res.status(400).json({ error: 'Неизвестный бейдж. Доступные: ' + ALLOWED_BADGES.join(', ') });
  const id = req.params.id;
  if (db.isEnabled()) {
    const user = await db.getUserById(id);
    if (!user) return res.status(404).json({ error: 'Аккаунт не найден' });
    const updated = await db.setUserBadges(id, badges, activeBadge);
    return res.json({ ok: true, ...getBadgeState(updated) });
  }
  for (const [email, u] of ephemeralEmailUsers) {
    if (u.id === id) {
      u.badges = badges;
      u.active_badge = badges.includes(activeBadge) ? activeBadge : (badges[0] || null);
      u.badge = u.active_badge;
      return res.json({ ok: true, ...getBadgeState(u) });
    }
  }
  res.status(404).json({ error: 'Аккаунт не найден' });
});

app.delete('/api/admin/accounts/:id', async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (db.isEnabled()) {
    await db.deleteAccount(req.params.id);
    return res.json({ ok: true });
  }
  for (const [email, user] of ephemeralEmailUsers) {
    if (user.id === req.params.id) { ephemeralEmailUsers.delete(email); return res.json({ ok: true }); }
  }
  for (const [id, user] of ephemeralUsers) {
    if (id === req.params.id) { ephemeralUsers.delete(id); return res.json({ ok: true }); }
  }
  res.status(404).json({ error: 'Аккаунт не найден' });
});

// error handler
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'Файл слишком большой (макс 500KB после сжатия)' });
  if (err) return res.status(400).json({ error: 'Ошибка запроса' });
  next();
});

// --- WebSocket ---

const roomClients = new Map();
const roomDisconnectTimers = new Map();
const hostDisconnectTimers = new Map();

function uniquePresence(clients) {
  const users = new Map();
  for (const client of clients) {
    if (!users.has(client.username)) {
      users.set(client.username, {
        username: client.username,
        displayName: client.displayName || client.username,
        avatar: client.avatar || ''
      });
    }
  }
  return [...users.values()];
}

wss.on('connection', async (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const code = (url.searchParams.get('code') || '').toUpperCase();
  const token = url.searchParams.get('token') || '';
  if (!code || !rooms[code]) {
    ws.close(1008, 'Room not found');
    return;
  }
  const user = await parseToken(token);
  if (!user) {
    ws.close(1008, 'Unauthorized');
    return;
  }
  ws.username = user.username || ('guest:' + user.id);
  ws.displayName = user.display_name || user.displayName || user.username || 'гость';
  ws.avatar = user.avatar || '';
  ws.code = code;
  ws.userId = user.id;
  ws.isGuest = !user.email && !user.username;

  if (rooms[code].bans && rooms[code].bans.includes(ws.username)) {
    ws.close(1008, 'You are banned from this room');
    return;
  }

  if (!roomClients.has(code)) roomClients.set(code, new Set());
  const clients = roomClients.get(code);
  const disconnectKey = `${code}:${ws.username}`;
  clearTimeout(roomDisconnectTimers.get(disconnectKey));
  roomDisconnectTimers.delete(disconnectKey);
  clearTimeout(roomDisconnectTimers.get(code));
  roomDisconnectTimers.delete(code);
  clearTimeout(hostDisconnectTimers.get(code));
  hostDisconnectTimers.delete(code);
  for (const oldClient of clients) {
    if (oldClient.username === ws.username) {
      oldClient.replaced = true;
      clients.delete(oldClient);
      try { oldClient.close(4001, 'Replaced by a newer connection'); } catch {}
    }
  }
  clients.add(ws);

  const enriched = [];
  for (const m of rooms[code].messages.slice(-100)) {
    const isSystemMessage = m.system || m.username === 'Togetherly System' || m.username === 'ADMIN';
    let ava = isSystemMessage ? '⚙️' : '😎';
    if (!isSystemMessage && db.isEnabled()) {
      try {
        const mu = await db.getUserByUsername(m.username);
        if (mu?.avatar) ava = mu.avatar;
      } catch {}
    } else {
      ava = ephemeralUsers.get(m.username)?.avatar || '😎';
    }
    enriched.push({ ...m, avatar: ava });
  }
  ws.send(JSON.stringify({ type: 'init', room: rooms[code], host: rooms[code].host, messages: enriched, bans: rooms[code].bans || [] }));
  broadcast(code, { type: 'user_join', username: ws.username, avatar: ws.avatar, count: clients.size }, ws);
  const presenceUsers = uniquePresence(clients);
  broadcast(code, { type: 'presence', users: presenceUsers.map(u => u.username), usersDetailed: presenceUsers, count: presenceUsers.length, host: rooms[code].host });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.type === 'chat') {
        const text = (msg.text || '').trim();
        const image = msg.image || null;
        if (!text && !image) return;
        if (text.length > 500) return;
        if (image && image.length > 0) {
          if (image.startsWith('data:image/')) {
            const validation = validateBase64Image(image, 2 * 1024 * 1024);
            if (!validation.valid) {
              ws.send(JSON.stringify({ type: 'error', text: validation.error }));
              return;
            }
          }
        }
        const chatMsg = { username: ws.username, text, ts: Date.now() };
        if (image) chatMsg.image = image;
        rooms[code].messages.push(chatMsg);
        if (rooms[code].messages.length > 200) rooms[code].messages.shift();
        saveJson(ROOMS_FILE, rooms);
        broadcast(code, { type: 'chat', ...chatMsg, avatar: ws.avatar || '😎' });
      }
      if (msg.type === 'reaction') {
        const mid = (msg.messageId || '').toString().slice(0, 64);
        const emoji = (msg.emoji || '❤️').toString().slice(0, 4);
        if (!mid) return;
        broadcast(code, { type: 'reaction', messageId: mid, emoji, from: ws.username }, null);
      }
      if (msg.type === 'typing') {
        broadcast(code, { type: 'typing', username: ws.username, isTyping: !!msg.isTyping }, ws);
      }
      if (msg.type === 'sync') {
        if (ws.username !== rooms[code].host) {
          ws.send(JSON.stringify({ type: 'error', text: 'Только хост может управлять плеером' }));
          return;
        }
        broadcast(code, { type: 'sync', action: msg.action, time: msg.time, playing: !!msg.playing, from: ws.username }, null);
      }
      if (msg.type === 'ban') {
        if (ws.username !== rooms[code].host) {
          ws.send(JSON.stringify({ type: 'error', text: 'Только хост может банить' }));
          return;
        }
        const target = (msg.username || '').trim();
        if (!target || target === ws.username) return;
        if (!rooms[code].bans) rooms[code].bans = [];
        if (!rooms[code].bans.includes(target)) {
          rooms[code].bans.push(target);
          saveJson(ROOMS_FILE, rooms);
        }
        const set = roomClients.get(code);
        if (set) {
          for (const c of set) {
            if (c.username === target) {
              try { c.close(1008, 'You have been banned'); } catch {}
            }
          }
        }
        broadcast(code, { type: 'user_banned', username: target, by: ws.username });
      }
      if (msg.type === 'unban') {
        if (ws.username !== rooms[code].host) {
          ws.send(JSON.stringify({ type: 'error', text: 'Только хост может разбанить' }));
          return;
        }
        const target = (msg.username || '').trim();
        if (!target) return;
        if (!rooms[code].bans) rooms[code].bans = [];
        rooms[code].bans = rooms[code].bans.filter(u => u !== target);
        saveJson(ROOMS_FILE, rooms);
        broadcast(code, { type: 'user_unbanned', username: target, by: ws.username });
      }
      if (msg.type === 'delete_message') {
        const mid = (msg.messageId || '').toString().slice(0, 128);
        if (!mid) return;
        const idx = rooms[code].messages.findIndex(m => {
          const mId = m.username + '-' + m.ts;
          if (mId !== mid) return false;
          return m.username === ws.username;
        });
        if (idx === -1) return;
        rooms[code].messages.splice(idx, 1);
        saveJson(ROOMS_FILE, rooms);
        broadcast(code, { type: 'delete_message', messageId: mid });
      }
    } catch {}
  });

  ws.on('close', () => {
    const set = roomClients.get(code);
    if (!set) return;
    if (ws.replaced) {
      const presenceUsers = uniquePresence(set);
      broadcast(code, { type: 'presence', users: presenceUsers.map(u => u.username), usersDetailed: presenceUsers, count: presenceUsers.length, host: rooms[code]?.host });
      return;
    }
    const wasHost = rooms[code] && rooms[code].host === ws.username;
    set.delete(ws);
    let stillOnline = false;
    for (const s of roomClients.values()) {
      for (const c of s) {
        if (c.userId === ws.userId) stillOnline = true;
      }
    }
    if (!stillOnline && ws.userId) ephemeralUsers.delete(ws.userId);
    if (set.size === 0) {
      const timer = setTimeout(() => {
        if (roomClients.get(code)?.size === 0) {
          roomClients.delete(code);
          if (rooms[code]) {
            delete rooms[code];
            saveJson(ROOMS_FILE, rooms);
            console.log(`Room ${code} deleted (empty)`);
          }
        }
        roomDisconnectTimers.delete(code);
      }, 5000);
      roomDisconnectTimers.set(code, timer);
      return;
    }
    if (wasHost && rooms[code]) {
      const timer = setTimeout(() => {
        if (!roomClients.get(code)?.size || [...roomClients.get(code)].some(c => c.username === ws.username)) return;
        const remainingWs = [...set];
        const remainingUsers = uniquePresence(remainingWs);
        const remaining = remainingUsers.map(c => c.username);
        const newHost = remaining[Math.floor(Math.random() * remaining.length)];
        const oldHost = rooms[code].host;
        rooms[code].host = newHost;
        saveJson(ROOMS_FILE, rooms);
        broadcast(code, { type: 'host_change', oldHost, newHost });
        broadcast(code, { type: 'presence', users: remaining, usersDetailed: remainingUsers, count: remaining.length, host: newHost });
      }, 5000);
      hostDisconnectTimers.set(code, timer);
      broadcast(code, { type: 'user_leave', username: ws.username, count: set.size });
      return;
    }
    broadcast(code, { type: 'user_leave', username: ws.username, count: set.size });
    if (rooms[code]) {
      const presenceUsers3 = uniquePresence(set);
      broadcast(code, { type: 'presence', users: presenceUsers3.map(u => u.username), usersDetailed: presenceUsers3, count: presenceUsers3.length, host: rooms[code].host });
    }
  });
});

function broadcast(code, payload, exclude) {
  const set = roomClients.get(code);
  if (!set) return;
  const data = JSON.stringify(payload);
  for (const c of set) {
    if (c !== exclude && c.readyState === WebSocket.OPEN) c.send(data);
  }
  if (payload.type === 'chat' && exclude && exclude.readyState === WebSocket.OPEN) {
    exclude.send(data);
  }
}

if (db.isEnabled()) {
  setTimeout(resolveCreatorId, 3000);
}

server.listen(PORT, async () => {
  console.log(`togetherly running on http://localhost:${PORT}`);
  setTimeout(resolveCreatorId, 1500);
});

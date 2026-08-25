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

// Creator badge - привязка к ID (ник можно менять)
const CREATOR_USERNAME = process.env.CREATOR_USERNAME || 'owner';
let CREATOR_ID = process.env.CREATOR_ID || null;
const CREATOR_EMAIL = process.env.CREATOR_EMAIL || null;

function isCreator(userOrUsername) {
  if (!userOrUsername) return false;
  // если передана строка (старый вызов) - проверка по нику
  if (typeof userOrUsername === 'string') {
    return userOrUsername.toLowerCase() === CREATOR_USERNAME.toLowerCase();
  }
  const u = userOrUsername;
  // 1. Проверка по ID (самый надежный - не меняется при смене ника)
  if (CREATOR_ID && u.id && String(u.id) === String(CREATOR_ID)) return true;
  // 2. Проверка по почте
  if (CREATOR_EMAIL && u.email && u.email.toLowerCase() === CREATOR_EMAIL.toLowerCase()) return true;
  // 3. Fallback по username
  if (u.username && u.username.toLowerCase() === CREATOR_USERNAME.toLowerCase()) return true;
  return false;
}

// Авто-определение CREATOR_ID по username при старте (если не задан в env)
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

// CORS configuration - restrict to specific origins
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:3000', 'http://localhost:5173']; // Development defaults

app.use(require('cors')({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// storage: rooms only (file), users ephemeral (memory) + localStorage on client
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

// ephemeral users (fallback mode only, when DB is not connected)
const ephemeralUsers = new Map();
const ephemeralEmailUsers = new Map(); // email -> { id, username, email, passwordHash, avatar, bio, emailVerified }

// init DB if DATABASE_URL is set (Render env var)
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
      return ephemeralUsers.get(decoded.id) || [...ephemeralEmailUsers.values()].find(x=>x.id===decoded.id) || null;
    }
    return ephemeralUsers.get(decoded.id) || [...ephemeralEmailUsers.values()].find(x=>x.id===decoded.id) || null;
  } catch { return null; }
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

// Rate limiting
const rateLimit = new Map(); // ip -> { count, resetAt }
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

// Code attempt limiting
const codeAttempts = new Map(); // email -> { count, lockedUntil }
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

function isValidVideoUrl(platform, url){
  url=url.trim();
  try{
    if(platform==='vk'){
      return /^(https?:\/\/)?(m\.)?(vk\.com|vk\.ru|vkvideo\.ru)\/video-?\d+_\d+/.test(url) || /video_ext\.php\?.*oid=-?\d+.*id=\d+/.test(url);
    }
    if(platform==='rutube'){
      return /^(https?:\/\/)?(www\.)?rutube\.ru\/(video|play\/embed)\/[a-f0-9]+/i.test(url);
    }
    if(platform==='youtube'){
      return /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|embed\/)|youtu\.be\/)[\w-]+/.test(url);
    }
  }catch{ return false; }
  return false;
}

// Validate base64 image format and size
function validateBase64Image(dataUrl, maxSizeBytes = 512 * 1024) {
  if (!dataUrl) return { valid: false, error: 'Пустое изображение' };
  if (typeof dataUrl !== 'string') return { valid: false, error: 'Неверный формат' };
  
  // Check if it's a valid data URL
  if (!dataUrl.startsWith('data:image/')) return { valid: false, error: 'Только изображения разрешены' };
  
  // Extract mime type and base64 data
  const matches = dataUrl.match(/^data:image\/(png|jpeg|jpg|gif|webp);base64,(.+)$/);
  if (!matches) return { valid: false, error: 'Неверный формат изображения' };
  
  const [, mimeType, base64Data] = matches;
  
  // Calculate actual byte size (base64 is ~1.37x larger than binary)
  const byteSize = Math.floor((base64Data.length * 3) / 4);
  
  if (byteSize > maxSizeBytes) {
    return { valid: false, error: `Изображение слишком большое (макс ${Math.floor(maxSizeBytes/1024)}KB)` };
  }
  
  // Check if base64 is valid
  try {
    if (!/^[A-Za-z0-9+/=]+$/.test(base64Data)) {
      return { valid: false, error: 'Неверные данные изображения' };
    }
  } catch {
    return { valid: false, error: 'Ошибка валидации' };
  }
  
  return { valid: true, data: dataUrl, mimeType, size: byteSize };
}

// API - guest: only displayName, no handle
app.post('/api/auth', async (req, res) => {
  try{
    let { displayName, username, avatar, bio } = req.body;
    console.log('[AUTH] Гостевой вход:', { displayName, username, avatarType: typeof avatar, avatarLength: avatar?.length });
    displayName = (displayName || username || '').trim();
    if (!displayName) return res.status(400).json({ error: 'Введи имя' });
    if (displayName.length < 1) return res.status(400).json({ error: 'Имя минимум 1 символ' });
    if (displayName.length > 20) return res.status(400).json({ error: 'Имя максимум 20 символов' });
    
    // Validate avatar if provided
    if (avatar && avatar.length > 0) {
      // Skip validation for emoji (short strings without data:image prefix)
      if (!avatar.startsWith('data:image/') && avatar.length < 10) {
        console.log('[AUTH] Аватар - эмодзи, пропускаем валидацию');
        // Keep emoji as is
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
    
    bio = (bio||'').toString().slice(0,120);
    const user = { displayName, avatar: avatar || '', bio: '' };
    // guests never use DB, never occupy handle
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    ephemeralUsers.set(id, { id, username: null, displayName, avatar: avatar || '', bio: '' });
    const token = makeToken(id);
    res.json({ token, displayName, username: null, avatar: avatar || '', bio: '' });
  }catch(e){ console.error('/api/auth error:', e); res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.post('/api/logout', async (req, res) => {
  res.json({ ok: true });
});

app.post('/api/register', async (req, res) => {
  try{
    const { displayName, username, avatar, bio } = req.body;
    let d = (displayName || username || '').trim();
    if (!d) return res.status(400).json({ error: 'Введи имя' });
    const user = { displayName: d, avatar: avatar||'', bio: bio||'' };
    if (db.isEnabled()) {
      const created = await db.createAccount(user);
      return res.json({ token: makeToken(created.id), displayName: created.display_name, username: created.username, avatar: created.avatar, bio: created.bio });
    }
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    ephemeralUsers.set(id, { id, displayName: d, avatar: user.avatar, bio: user.bio });
    res.json({ token: makeToken(id), displayName: d, avatar: user.avatar, bio: user.bio });
  }catch(e){ console.error('/api/register error:', e); res.status(500).json({ error: 'Ошибка сервера' }); }
});
app.post('/api/login', async (req, res) => {
  try{
    const { displayName, username, avatar, bio } = req.body;
    let d = (displayName || username || '').trim();
    if (!d) return res.status(400).json({ error: 'Введи имя' });
    const user = { displayName: d, avatar: avatar||'', bio: bio||'' };
    if (db.isEnabled()) {
      const created = await db.createAccount(user);
      return res.json({ 
        token: makeToken(created.id), 
        displayName: created.display_name, 
        username: created.username, 
        avatar: created.avatar, 
        bio: created.bio,
        isCreator: isCreator(created)
      });
    }
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    ephemeralUsers.set(id, { id, displayName: d, avatar: user.avatar, bio: user.bio });
    res.json({ token: makeToken(id), displayName: d, avatar: user.avatar, bio: user.bio, isCreator: false });
  }catch(e){ console.error('/api/login error:', e); res.status(500).json({ error: 'Ошибка сервера' }); }
});

// --- Email auth routes ---

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
      return res.json({ 
        token, 
        displayName: user.display_name, 
        username: user.username, 
        avatar: user.avatar || '', 
        bio: user.bio || '', 
        email, 
        emailVerified: false, 
        codeSent: emailSent,
        isCreator: isCreator(user)
      });
    }

    // ephemeral mode — auto-verify (no real email delivery)
    if (ephemeralEmailUsers.has(email)) return res.status(400).json({ error: 'Email уже зарегистрирован' });
    if ([...ephemeralEmailUsers.values()].some(u=>u.username===username)) return res.status(400).json({ error: 'Это имя пользователя уже занято' });
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const passwordHash = await bcrypt.hash(password, 10);
    ephemeralEmailUsers.set(email, { id, displayName, username, email, passwordHash, avatar: '', bio: '', emailVerified: false, verifyCode: code });
    console.log(`[AUTH] Код для ${email}: ${code}`);
    const token = makeToken(id);
    res.json({ token, displayName, username, avatar: '', bio: '', email, emailVerified: false, codeSent: false });
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
      return res.json({ 
        token, 
        displayName: user.display_name, 
        username: user.username, 
        avatar: user.avatar || '', 
        bio: user.bio || '', 
        email: user.email, 
        emailVerified: user.email_verified,
        isCreator: isCreator(user)
      });
    }

    // ephemeral mode
    const user = ephemeralEmailUsers.get(email);
    if (!user) return res.status(401).json({ error: 'Неверный email или пароль' });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Неверный email или пароль' });
    const token = makeToken(user.id);
    res.json({ 
      token, 
      displayName: user.displayName, 
      username: user.username, 
      avatar: user.avatar, 
      bio: user.bio, 
      email: user.email, 
      emailVerified: user.emailVerified,
      isCreator: isCreator(user)
    });
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

    // ephemeral mode
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

    // ephemeral mode
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

    // ephemeral mode
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
  const token = req.headers.authorization?.replace('Bearer ','');
  const user = await parseToken(token);
  if (!user) return res.status(401).json({ error: 'Не авторизован' });
  const isGuest = !user.email;
  res.json({ 
    displayName: user.display_name || user.displayName || user.username, 
    username: user.username || null, 
    avatar: user.avatar || '', 
    bio: user.bio || '', 
    email: user.email || null, 
    emailVerified: user.email_verified || false, 
    isGuest,
    isCreator: isCreator(user)
  });
});
app.get('/api/users/:username', async (req, res) => {
  if (db.isEnabled()) {
    const { rows } = await db.pool.query('SELECT id, username, display_name, avatar, bio, email FROM users WHERE lower(username)=lower($1) ORDER BY created_at DESC LIMIT 1', [req.params.username]);
    if (rows[0]) return res.json({ 
      displayName: rows[0].display_name, 
      username: rows[0].username, 
      avatar: rows[0].avatar || '', 
      bio: rows[0].bio || '',
      isCreator: isCreator(rows[0])
    });
  }
  const u = [...ephemeralUsers.values()].find(x=> (x.username && x.username.toLowerCase()===req.params.username.toLowerCase()) || x.displayName===req.params.username) || { displayName: req.params.username, username: null, avatar: '', bio: '' };
  res.json({ 
    displayName: u.displayName || u.username, 
    username: u.username || null, 
    avatar: u.avatar || '', 
    bio: u.bio || '',
    isCreator: isCreator(u)
  });
});
app.put('/api/me', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ','');
  const user = await parseToken(token);
  if (!user) return res.status(401).json({ error: 'Не авторизован' });
  let { displayName, username, avatar, bio } = req.body;
  const isGuest = !user.email;
  if (isGuest && username) return res.status(403).json({ error: 'Гости не могут менять username' });
  displayName = displayName !== undefined ? displayName.trim() : (user.display_name || user.displayName || user.username);
  if (!displayName || displayName.length<1 || displayName.length>20) return res.status(400).json({ error: 'Имя 1-20 символов' });
  if (!isGuest && username !== undefined) {
    username = username.trim().toLowerCase();
    if (!/^[a-z0-9_-]{3,20}$/.test(username)) return res.status(400).json({ error: 'Имя пользователя 3-20: a-z, 0-9, -_' });
    if (username !== (user.username||'').toLowerCase()) {
      let exists=null;
      if (db.isEnabled()) exists = await db.getUserByUsername(username);
      else exists = [...ephemeralEmailUsers.values()].find(u=>u.username===username);
      if (exists && exists.id !== user.id) return res.status(400).json({ error: 'Это имя пользователя уже занято' });
    }
  } else {
    username = user.username;
  }
  
  // Validate avatar if provided
  if (avatar !== undefined) {
    if (avatar && avatar.length > 0) {
      // Skip validation for emoji (short strings without data:image prefix)
      if (!avatar.startsWith('data:image/') && avatar.length < 10) {
        // Keep emoji as is
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
  
  bio = bio !== undefined ? bio.toString().slice(0,120) : user.bio;
  const wasCreator = isCreator(user);
  if (db.isEnabled()) {
    await db.updateUserProfileById(user.id, { displayName, username, avatar, bio });
    const updated = await db.getUserById(user.id);
    const newToken = makeToken(user.id);
    // если создатель сменил ник - запомнить новый ID и обновить fallback
    if (wasCreator) {
      CREATOR_ID = String(updated.id);
      console.log(`[CREATOR] Ник сменен @${user.username} -> @${updated.username}, новый ID закэширован: ${CREATOR_ID}. Добавь CREATOR_ID=${CREATOR_ID} в env на Render для сохранения после рестарта!`);
    }
    return res.json({ 
      displayName: updated.display_name, 
      username: updated.username, 
      avatar: updated.avatar, 
      bio: updated.bio, 
      token: newToken,
      isCreator: isCreator(updated)
    });
  }
  if (!isGuest) {
    // email ephemeral
    const entry = [...ephemeralEmailUsers.entries()].find(([k,v])=>v.id===user.id);
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
  res.json({ displayName, username, avatar: avatar || '', bio: bio || '', token: newToken });
});
app.get('/api/check-username', async (req, res) => {
  let { username } = req.query;
  username = (username||'').trim().toLowerCase();
  if (!/^[a-z0-9_-]{3,20}$/.test(username)) return res.json({ available: false, reason: 'invalid' });
  const token = req.headers.authorization?.replace('Bearer ','');
  if (token) {
    try {
      const me = await parseToken(token);
      if (me && me.username && me.username.toLowerCase()===username) return res.json({ available: true, own: true });
    } catch {}
  }
  let exists=null;
  if (db.isEnabled()) exists = await db.getUserByUsername(username);
  else exists = [...ephemeralEmailUsers.values()].find(u=>u.username===username) || [...ephemeralUsers.values()].find(u=>u.username===username);
  res.json({ available: !exists });
});

app.post('/api/rooms', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ','');
  const user = await parseToken(token);
  if (!user) return res.status(401).json({ error: 'Войдите в аккаунт' });
  let { platform, videoUrl, title } = req.body;
  if (!platform || !videoUrl) return res.status(400).json({ error: 'Выберите площадку и вставьте ссылку' });
  platform = platform.toLowerCase();
  if (!['vk','rutube','youtube'].includes(platform)) return res.status(400).json({ error: 'Неизвестная площадка' });
  if (!isValidVideoUrl(platform, videoUrl)) {
    const examples={ vk:'Пример VK: https://vk.com/video-123456_789 или https://vkvideo.ru/video-123456_789', rutube:'Пример RuTube: https://rutube.ru/video/abc123...', youtube:'Пример YouTube: https://www.youtube.com/watch?v=XXXX или https://youtu.be/XXXX' };
    return res.status(400).json({ error: `Неверная ссылка для ${platform.toUpperCase()}. ${examples[platform]}` });
  }
  const embedUrl = toEmbedUrl(platform, videoUrl);
  let code;
  do { code = genCode(); } while (rooms[code]);
  const room = {
    code,
    title: title?.trim() || 'Без названия',
    platform,
    videoUrl,
    embedUrl,
    host: user.username,
    createdAt: new Date().toISOString(),
    messages: [],
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

// WebSocket
const roomClients = new Map(); // code -> Set(ws)

wss.on('connection', async (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const code = (url.searchParams.get('code')||'').toUpperCase();
  const token = url.searchParams.get('token')||'';
  if (!code || !rooms[code]) {
    ws.close(1008, 'Room not found');
    return;
  }
  const user = await parseToken(token);
  if (!user) {
    ws.close(1008, 'Unauthorized');
    return;
  }
  ws.username = user.username || ('guest:'+user.id);
  ws.displayName = user.display_name || user.displayName || user.username || 'гость';
  ws.avatar = user.avatar || '';
  ws.code = code;
  ws.userId = user.id; // Store user ID for cleanup
  ws.isGuest = !user.email && !user.username;

  if (rooms[code].bans && rooms[code].bans.includes(ws.username)) {
    ws.close(1008, 'You are banned from this room');
    return;
  }

  if (!roomClients.has(code)) roomClients.set(code, new Set());
  roomClients.get(code).add(ws);

  const enriched = [];
  for (const m of rooms[code].messages.slice(-100)) {
    let ava = '😎';
    if (db.isEnabled()) {
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
  broadcast(code, { type: 'user_join', username: ws.username, avatar: ws.avatar, count: roomClients.get(code).size }, ws);
  const presenceUsers=[...roomClients.get(code)].map(c=>({username:c.username, displayName:c.displayName||c.username, avatar:c.avatar||''}));
  broadcast(code, { type: 'presence', users: presenceUsers.map(u=>u.username), usersDetailed: presenceUsers, count: roomClients.get(code).size, host: rooms[code].host });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.type === 'chat') {
        const text = (msg.text||'').trim();
        const image = msg.image || null;
        if (!text && !image) return;
        if (text.length > 500) return;
        
        // Validate image if provided
        if (image && image.length > 0) {
          // Only validate if it's actually a base64 image
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
        const mid=(msg.messageId||'').toString().slice(0,64);
        const emoji=(msg.emoji||'❤️').toString().slice(0,4);
        if(!mid) return;
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
        broadcast(code, { type: 'sync', action: msg.action, time: msg.time, from: ws.username }, null);
      }
      if (msg.type === 'ban') {
        if (ws.username !== rooms[code].host) {
          ws.send(JSON.stringify({ type: 'error', text: 'Только хост может банить' }));
          return;
        }
        const target = (msg.username||'').trim();
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
              c.close(1008, 'You have been banned');
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
        const target = (msg.username||'').trim();
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
    const wasHost = rooms[code] && rooms[code].host === ws.username;
    set.delete(ws);
    // ephemeral user cleanup if no more connections with that id
    let stillOnline=false;
    for(const s of roomClients.values()){ 
      for(const c of s){ 
        if(c.userId === ws.userId) stillOnline=true; 
      } 
    }
    if(!stillOnline && ws.userId) ephemeralUsers.delete(ws.userId);
    if (set.size === 0) {
      roomClients.delete(code);
      if (rooms[code]) {
        delete rooms[code];
        saveJson(ROOMS_FILE, rooms);
        console.log(`Room ${code} deleted (empty)`);
      }
      return;
    }
    if (wasHost && rooms[code]) {
      const remainingWs=[...set];
      const remaining=remainingWs.map(c=>c.username);
      const newHost = remaining[Math.floor(Math.random() * remaining.length)];
      const oldHost = rooms[code].host;
      rooms[code].host = newHost;
      saveJson(ROOMS_FILE, rooms);
      broadcast(code, { type: 'host_change', oldHost, newHost });
      const presenceUsers2=remainingWs.map(c=>({username:c.username, displayName:c.displayName||c.username, avatar:c.avatar||''}));
      broadcast(code, { type: 'presence', users: remaining, usersDetailed: presenceUsers2, count: set.size, host: newHost });
      broadcast(code, { type: 'user_leave', username: ws.username, count: set.size });
      return;
    }
    broadcast(code, { type: 'user_leave', username: ws.username, count: set.size });
    if (rooms[code]) {
      const presenceUsers3=[...set].map(c=>({username:c.username, displayName:c.displayName||c.username, avatar:c.avatar||''}));
      broadcast(code, { type: 'presence', users: presenceUsers3.map(u=>u.username), usersDetailed: presenceUsers3, count: set.size, host: rooms[code].host });
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

// --- admin ---
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'lineup_admin_2024';
const adminTokens = new Set();
function makeAdminToken(){ return Buffer.from('admin:'+Date.now()+':'+Math.random().toString(36).slice(2)).toString('base64'); }
function isAdmin(req){
  const tok = (req.headers.authorization||'').replace('Bearer ','').trim();
  return tok && adminTokens.has(tok);
}
app.get('/admin', (req,res)=> res.sendFile(path.join(__dirname,'public','admin.html')));
app.post('/api/admin/login', (req,res)=>{
  const { password } = req.body;
  if(password !== ADMIN_PASSWORD) return res.status(401).json({error:'Неверный пароль'});
  const tok=makeAdminToken();
  adminTokens.add(tok);
  // keep only last 20 tokens
  if(adminTokens.size>20) adminTokens.delete([...adminTokens][0]);
  res.json({token:tok});
});
app.get('/api/admin/stats', (req,res)=>{
  if(!isAdmin(req)) return res.status(401).json({error:'Unauthorized'});
  let online=0;
  for(const s of roomClients.values()) online+=s.size;
  let messages=0;
  for(const r of Object.values(rooms)) messages+=r.messages.length;
  const roomList=Object.values(rooms).map(r=>{
    const set=roomClients.get(r.code);
    return { code:r.code, title:r.title, host:r.host, count: set?set.size:0, hostOnline: set ? [...set].some(c=>c.username===r.host) : false, createdAt:r.createdAt };
  });
  const userList=[];
  for(const [code,set] of roomClients.entries()){
    for(const c of set) userList.push({username:c.username, code});
  }
  res.json({ rooms:Object.keys(rooms).length, online, messages, dbUsers: db.isEnabled(), roomList, userList });
});
app.post('/api/admin/broadcast', (req,res)=>{
  if(!isAdmin(req)) return res.status(401).json({error:'Unauthorized'});
  const { text } = req.body;
  if(!text || !text.trim()) return res.status(400).json({error:'Текст пустой'});
  const msg={ username:'ADMIN', text: text.trim().slice(0,500), ts: Date.now() };
  for(const code of Object.keys(rooms)){
    rooms[code].messages.push(msg);
    if(rooms[code].messages.length>200) rooms[code].messages.shift();
    broadcast(code, { type:'chat', ...msg, avatar:'👑' });
  }
  saveJson(ROOMS_FILE, rooms);
  res.json({ok:true});
});
app.post('/api/admin/rooms/:code/close', (req,res)=>{
  if(!isAdmin(req)) return res.status(401).json({error:'Unauthorized'});
  const code=req.params.code.toUpperCase();
  const r=rooms[code];
  if(!r) return res.status(404).json({error:'Room not found'});
  const set=roomClients.get(code);
  if(set){
    broadcast(code, { type:'chat', username:'ADMIN', text:`Комната ${code} закрыта админом`, ts: Date.now(), avatar:'👑' });
    for(const c of [...set]){ try{c.close(1008,'Room closed by admin');}catch{} }
    roomClients.delete(code);
  }
  delete rooms[code];
  saveJson(ROOMS_FILE, rooms);
  res.json({ok:true});
});
app.post('/api/admin/rooms/:code/clear', (req,res)=>{
  if(!isAdmin(req)) return res.status(401).json({error:'Unauthorized'});
  const code=req.params.code.toUpperCase();
  const r=rooms[code];
  if(!r) return res.status(404).json({error:'Room not found'});
  r.messages=[];
  saveJson(ROOMS_FILE, rooms);
  broadcast(code, {type:'clear_chat'});
  res.json({ok:true});
});
app.post('/api/admin/users/:username/kick', (req,res)=>{
  if(!isAdmin(req)) return res.status(401).json({error:'Unauthorized'});
  const uname=req.params.username;
  let kicked=0;
  for(const [code,set] of roomClients.entries()){
    for(const c of [...set]){
      if(c.username===uname){
        try{
          c.send(JSON.stringify({ type:'chat', username:'ADMIN', text:`${uname} кикнут админом`, ts: Date.now(), avatar:'👑' }));
          c.close(1008,'Kicked by admin');
        }catch{}
        kicked++;
      }
    }
  }
  // don't delete ephemeral user globally - they can rejoin with same nick (no exclusive)
  res.json({ok:true, kicked});
});

// --- Admin: accounts management ---
app.get('/api/admin/accounts', async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (db.isEnabled()) {
    const users = await db.getAllUsers();
    return res.json({ accounts: users.map(u => ({ id: u.id, username: u.username, avatar: u.avatar || '😎', bio: u.bio || '', created: u.created_at })) });
  }
  const accounts = [];
  for (const [id, u] of ephemeralEmailUsers) {
    accounts.push({ id, username: u.username || id, avatar: u.avatar || '😎', bio: u.bio || '', created: null });
  }
  res.json({ accounts });
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
  res.status(404).json({ error: 'Аккаунт не найден' });
});

// error handler
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'Файл слишком большой (макс 500KB после сжатия)' });
  if (err) return res.status(400).json({ error: 'Ошибка запроса' });
  next();
});

app.get('/privacy', (req,res)=>{
  res.sendFile(path.join(__dirname,'public','privacy.html'));
});
// Redirect old typo URL to correct one
app.get('/pricavy', (req,res)=>{
  res.redirect(301, '/privacy');
});

app.get('/faq', (req,res)=>{
  res.sendFile(path.join(__dirname,'public','faq.html'));
});

app.get('/verify', (req,res)=>{
  res.sendFile(path.join(__dirname,'public','verify.html'));
});

app.get('/reset', (req,res)=>{
  res.sendFile(path.join(__dirname,'public','reset.html'));
});

app.get('*', (req,res)=>{
  res.sendFile(path.join(__dirname,'public','index.html'));
});

server.listen(PORT, async () => {
  console.log(`togetherly running on http://localhost:${PORT}`);
  // resolve creator ID after DB ready
  setTimeout(resolveCreatorId, 1500);
});

// also try resolve when DB connects
if (db.isEnabled()) {
  // db already initialized in require, but ensure after delay
  setTimeout(resolveCreatorId, 3000);
}

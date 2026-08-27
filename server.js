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
  console.warn('вљ пёЏ  JWT_SECRET РЅРµ СѓСЃС‚Р°РЅРѕРІР»РµРЅ, РёСЃРїРѕР»СЊР·СѓРµС‚СЃСЏ РІСЂРµРјРµРЅРЅС‹Р№ РєР»СЋС‡ (С‚РѕРєРµРЅС‹ Р±СѓРґСѓС‚ РЅРµРІР°Р»РёРґРЅС‹ РїРѕСЃР»Рµ СЂРµСЃС‚Р°СЂС‚Р°)');
}
const JWT_EXPIRES = '30d';

// Badge system - РѕРґРёРЅ Р±РµР№РґР¶ РЅР° СЋР·РµСЂР°, РїСЂРёРІСЏР·Р°РЅРѕ РІСЃС‘ РѕС„РѕСЂРјР»РµРЅРёРµ
const BADGE_PRESETS = {
  founder: { label: 'FOUNDER', theme: 'snow', icon: 'crown', glow: true, snow: true },
  founders_wife: { label: "FOUNDER'S WIFE", theme: 'sakura', icon: 'heart', glow: true, petals: true },
};
const ALLOWED_BADGES = Object.keys(BADGE_PRESETS);

// Creator fallback - РґР»СЏ РјРёРіСЂР°С†РёРё СЃС‚Р°СЂРѕРіРѕ @owner Р±РµР· badge
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
  // РµСЃР»Рё Сѓ СЋР·РµСЂР° СѓР¶Рµ РµСЃС‚СЊ badge РІ Р‘Р” - РѕС‚РґР°РµРј РµРіРѕ (СЃ Р°Р»РёР°СЃРѕРј developer -> founder)
  if (user.badge) {
    let b = String(user.badge).toLowerCase();
    if (b === 'developer') b = 'founder'; // legacy alias
    if (ALLOWED_BADGES.includes(b)) return b;
  }
  // Р»РµРіР°СЃРё: СЃС‚Р°СЂС‹Р№ @owner Р±РµР· badge СЃС‡РёС‚Р°РµРј founder
  if (isCreatorLegacy(user)) return 'founder';
  return null;
}

// РґР»СЏ СЃРѕРІРјРµСЃС‚РёРјРѕСЃС‚Рё СЃС‚Р°СЂС‹Р№ РІС‹Р·РѕРІ isCreator С‚РµРїРµСЂСЊ РїСЂРѕРєСЃРёСЂСѓРµС‚ РЅР° getBadge
function isCreator(userOrUsername) {
  const b = typeof userOrUsername === 'string' ? (userOrUsername.toLowerCase() === CREATOR_USERNAME.toLowerCase() ? 'founder' : null) : getBadge(userOrUsername);
  return !!b;
}

// РђРІС‚Рѕ-РѕРїСЂРµРґРµР»РµРЅРёРµ CREATOR_ID РїРѕ username РїСЂРё СЃС‚Р°СЂС‚Рµ (РµСЃР»Рё РЅРµ Р·Р°РґР°РЅ РІ env)
async function resolveCreatorId() {
  if (CREATOR_ID) {
    console.log(`[CREATOR] ID Р·Р°РґР°РЅ РёР· env: ${CREATOR_ID}`);
    return;
  }
  try {
    if (db.isEnabled()) {
      const u = await db.getUserByUsername(CREATOR_USERNAME);
      if (u && u.id) {
        CREATOR_ID = String(u.id);
        console.log(`[CREATOR] РђРІС‚Рѕ-РѕРїСЂРµРґРµР»РµРЅ ID РґР»СЏ @${CREATOR_USERNAME}: ${CREATOR_ID} (С‚РµРїРµСЂСЊ РјРѕР¶РЅРѕ РјРµРЅСЏС‚СЊ РЅРёРє)`);
        // Р±СЌРєС„РёР»Р» badge РґР»СЏ СЃС‚Р°СЂРѕРіРѕ owner Р±РµР· badge
        if (!u.badge) {
          try { await db.setUserBadge(u.id, 'founder'); console.log(`[CREATOR] Р’С‹РґР°РЅ badge founder РґР»СЏ @${CREATOR_USERNAME}`); } catch {}
        } else if (String(u.badge).toLowerCase() === 'developer') {
          try { await db.setUserBadge(u.id, 'founder'); console.log(`[CREATOR] РњРёРіСЂРёСЂРѕРІР°РЅ badge developer -> founder РґР»СЏ @${CREATOR_USERNAME}`); } catch {}
        }
      } else {
        console.log(`[CREATOR] РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ @${CREATOR_USERNAME} РµС‰Рµ РЅРµ СЃРѕР·РґР°РЅ, РїСЂРёРІСЏР·РєР° РїРѕ РЅРёРєСѓ`);
      }
    }
  } catch (e) {
    console.log('[CREATOR] РќРµ СѓРґР°Р»РѕСЃСЊ РѕРїСЂРµРґРµР»РёС‚СЊ ID:', e.message);
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
// Security headers вЂ” Р·Р°С‰РёС‚Р° РѕС‚ XSS/РєР»РёРєРґР¶РµРєРёРЅРіР° Р±РµР· Р»РѕРјР° inline-СЃРєСЂРёРїС‚РѕРІ
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  // CSP: СЂР°Р·СЂРµС€Р°РµРј inline-СЃРєСЂРёРїС‚С‹/СЃС‚РёР»Рё (Сѓ РІР°СЃ РјРЅРѕРіРѕ <script> Рё <style>), РЅРѕ Р±Р»РѕРєРёСЂСѓРµРј С‡СѓР¶РѕР№ JS
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: https: blob:",
    "media-src 'self' https: blob:",
    "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://*.vk.com https://*.vk.ru https://*.vkvideo.ru https://rutube.ru https://*.rutube.ru",
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
    return { ok: false, error: `РЎР»РёС€РєРѕРј РјРЅРѕРіРѕ РїРѕРїС‹С‚РѕРє. РџРѕРїСЂРѕР±СѓР№ С‡РµСЂРµР· ${mins} РјРёРЅ.` };
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
  if (!dataUrl) return { valid: false, error: 'РџСѓСЃС‚РѕРµ РёР·РѕР±СЂР°Р¶РµРЅРёРµ' };
  if (typeof dataUrl !== 'string') return { valid: false, error: 'РќРµРІРµСЂРЅС‹Р№ С„РѕСЂРјР°С‚' };
  
  // Check if it's a valid data URL
  if (!dataUrl.startsWith('data:image/')) return { valid: false, error: 'РўРѕР»СЊРєРѕ РёР·РѕР±СЂР°Р¶РµРЅРёСЏ СЂР°Р·СЂРµС€РµРЅС‹' };
  
  // Extract mime type and base64 data
  const matches = dataUrl.match(/^data:image\/(png|jpeg|jpg|gif|webp);base64,(.+)$/);
  if (!matches) return { valid: false, error: 'РќРµРІРµСЂРЅС‹Р№ С„РѕСЂРјР°С‚ РёР·РѕР±СЂР°Р¶РµРЅРёСЏ' };
  
  const [, mimeType, base64Data] = matches;
  
  // Calculate actual byte size (base64 is ~1.37x larger than binary)
  const byteSize = Math.floor((base64Data.length * 3) / 4);
  
  if (byteSize > maxSizeBytes) {
    return { valid: false, error: `РР·РѕР±СЂР°Р¶РµРЅРёРµ СЃР»РёС€РєРѕРј Р±РѕР»СЊС€РѕРµ (РјР°РєСЃ ${Math.floor(maxSizeBytes/1024)}KB)` };
  }
  
  // Check if base64 is valid
  try {
    if (!/^[A-Za-z0-9+/=]+$/.test(base64Data)) {
      return { valid: false, error: 'РќРµРІРµСЂРЅС‹Рµ РґР°РЅРЅС‹Рµ РёР·РѕР±СЂР°Р¶РµРЅРёСЏ' };
    }
  } catch {
    return { valid: false, error: 'РћС€РёР±РєР° РІР°Р»РёРґР°С†РёРё' };
  }
  
  return { valid: true, data: dataUrl, mimeType, size: byteSize };
}

// API - guest: only displayName, no handle
app.post('/api/auth', async (req, res) => {
  try{
    let { displayName, username, avatar, bio } = req.body;
    console.log('[AUTH] Р“РѕСЃС‚РµРІРѕР№ РІС…РѕРґ:', { displayName, username, avatarType: typeof avatar, avatarLength: avatar?.length });
    displayName = (displayName || username || '').trim();
    if (!displayName) return res.status(400).json({ error: 'Р’РІРµРґРё РёРјСЏ' });
    if (displayName.length < 1) return res.status(400).json({ error: 'РРјСЏ РјРёРЅРёРјСѓРј 1 СЃРёРјРІРѕР»' });
    if (displayName.length > 20) return res.status(400).json({ error: 'РРјСЏ РјР°РєСЃРёРјСѓРј 20 СЃРёРјРІРѕР»РѕРІ' });
    
    // Validate avatar if provided
    if (avatar && avatar.length > 0) {
      // Skip validation for emoji (short strings without data:image prefix)
      if (!avatar.startsWith('data:image/') && avatar.length < 10) {
        console.log('[AUTH] РђРІР°С‚Р°СЂ - СЌРјРѕРґР·Рё, РїСЂРѕРїСѓСЃРєР°РµРј РІР°Р»РёРґР°С†РёСЋ');
        // Keep emoji as is
      } else if (avatar.startsWith('data:image/')) {
        console.log('[AUTH] Р’Р°Р»РёРґР°С†РёСЏ base64 РёР·РѕР±СЂР°Р¶РµРЅРёСЏ...');
        const validation = validateBase64Image(avatar, 512 * 1024);
        if (!validation.valid) {
          console.log('[AUTH] вќЊ Р’Р°Р»РёРґР°С†РёСЏ РїСЂРѕРІР°Р»РёР»Р°СЃСЊ:', validation.error);
          return res.status(400).json({ error: validation.error });
        }
        avatar = validation.data;
      } else {
        console.log('[AUTH] РќРµРёР·РІРµСЃС‚РЅС‹Р№ С„РѕСЂРјР°С‚ Р°РІР°С‚Р°СЂР°, РѕС‡РёС‰Р°РµРј');
        avatar = '';
      }
    } else {
      console.log('[AUTH] РђРІР°С‚Р°СЂ РїСѓСЃС‚РѕР№, РїСЂРѕРїСѓСЃРєР°РµРј РІР°Р»РёРґР°С†РёСЋ');
      avatar = '';
    }
    
    bio = (bio||'').toString().slice(0,120);
    const user = { displayName, avatar: avatar || '', bio: '' };
    // guests never use DB, never occupy handle
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    ephemeralUsers.set(id, { id, username: null, displayName, avatar: avatar || '', bio: '' });
    const token = makeToken(id);
    res.json({ token, displayName, username: null, avatar: avatar || '', bio: '' });
  }catch(e){ console.error('/api/auth error:', e); res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' }); }
});

app.post('/api/logout', async (req, res) => {
  res.json({ ok: true });
});

app.post('/api/register', async (req, res) => {
  try{
    const { displayName, username, avatar, bio } = req.body;
    let d = (displayName || username || '').trim();
    if (!d) return res.status(400).json({ error: 'Р’РІРµРґРё РёРјСЏ' });
    const user = { displayName: d, avatar: avatar||'', bio: bio||'' };
    if (db.isEnabled()) {
      const created = await db.createAccount(user);
      return res.json({ token: makeToken(created.id), displayName: created.display_name, username: created.username, avatar: created.avatar, bio: created.bio });
    }
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    ephemeralUsers.set(id, { id, displayName: d, avatar: user.avatar, bio: user.bio });
    res.json({ token: makeToken(id), displayName: d, avatar: user.avatar, bio: user.bio });
  }catch(e){ console.error('/api/register error:', e); res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' }); }
});
app.post('/api/login', async (req, res) => {
  try{
    const { displayName, username, avatar, bio } = req.body;
    let d = (displayName || username || '').trim();
    if (!d) return res.status(400).json({ error: 'Р’РІРµРґРё РёРјСЏ' });
    const user = { displayName: d, avatar: avatar||'', bio: bio||'' };
    if (db.isEnabled()) {
      const created = await db.createAccount(user);
      const badge = getBadge(created);
      return res.json({ 
        token: makeToken(created.id), 
        displayName: created.display_name, 
        username: created.username, 
        avatar: created.avatar, 
        bio: created.bio,
        badge,
        isCreator: !!badge
      });
    }
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    ephemeralUsers.set(id, { id, displayName: d, avatar: user.avatar, bio: user.bio });
    res.json({ token: makeToken(id), displayName: d, avatar: user.avatar, bio: user.bio, badge: null, isCreator: false });
  }catch(e){ console.error('/api/login error:', e); res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' }); }
});

// --- Email auth routes ---

const bcrypt = require('bcrypt');

app.post('/api/auth/register-email', async (req, res) => {
  try {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    if (!checkRateLimit(ip, 50, 300000)) return res.status(429).json({ error: 'РЎР»РёС€РєРѕРј РјРЅРѕРіРѕ СЂРµРіРёСЃС‚СЂР°С†РёР№. РџРѕРґРѕР¶РґРё 5 РјРёРЅСѓС‚.' });
    let { displayName, username, email, password } = req.body;
    displayName = (displayName || '').trim();
    username = (username || '').trim().toLowerCase();
    email = (email || '').trim().toLowerCase();
    password = password || '';
    if (!displayName || displayName.length < 1 || displayName.length > 20) return res.status(400).json({ error: 'РРјСЏ 1-20 СЃРёРјРІРѕР»РѕРІ' });
    if (!username || !/^[a-z0-9_-]{3,20}$/.test(username)) return res.status(400).json({ error: 'РРјСЏ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ 3-20 СЃРёРјРІРѕР»РѕРІ: a-z, 0-9, -_' });
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'РќРµРєРѕСЂСЂРµРєС‚РЅС‹Р№ email' });
    if (!password || password.length < 6) return res.status(400).json({ error: 'РџР°СЂРѕР»СЊ РјРёРЅРёРјСѓРј 6 СЃРёРјРІРѕР»РѕРІ' });

    const code = genCode();

    if (db.isEnabled()) {
      const existingEmail = await db.getUserByEmail(email);
      if (existingEmail) return res.status(400).json({ error: 'Email СѓР¶Рµ Р·Р°СЂРµРіРёСЃС‚СЂРёСЂРѕРІР°РЅ' });
      const existingUser = await db.getUserByUsername(username);
      if (existingUser) return res.status(400).json({ error: 'Р­С‚Рѕ РёРјСЏ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ СѓР¶Рµ Р·Р°РЅСЏС‚Рѕ' });
      const { user, verifyToken } = await db.createAccountWithAuth({ displayName, username, email, password });
      await db.setVerifyToken(user.id, code);
      const device = detectDevice(req.headers['user-agent']);
      const emailSent = await sendVerifyCode(email, code, displayName, device);
      const token = makeToken(user.id);
      const badge = getBadge(user);
      return res.json({ 
        token, 
        displayName: user.display_name, 
        username: user.username, 
        avatar: user.avatar || '', 
        bio: user.bio || '', 
        email, 
        emailVerified: false, 
        codeSent: emailSent,
        badge,
        isCreator: !!badge
      });
    }

    // ephemeral mode вЂ” auto-verify (no real email delivery)
    if (ephemeralEmailUsers.has(email)) return res.status(400).json({ error: 'Email СѓР¶Рµ Р·Р°СЂРµРіРёСЃС‚СЂРёСЂРѕРІР°РЅ' });
    if ([...ephemeralEmailUsers.values()].some(u=>u.username===username)) return res.status(400).json({ error: 'Р­С‚Рѕ РёРјСЏ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ СѓР¶Рµ Р·Р°РЅСЏС‚Рѕ' });
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const passwordHash = await bcrypt.hash(password, 10);
    ephemeralEmailUsers.set(email, { id, displayName, username, email, passwordHash, avatar: '', bio: '', emailVerified: false, verifyCode: code });
    console.log(`[AUTH] РљРѕРґ РґР»СЏ ${email}: ${code}`);
    const token = makeToken(id);
    res.json({ token, displayName, username, avatar: '', bio: '', email, emailVerified: false, codeSent: false });
  } catch (e) {
    console.error('Register error:', e);
    res.status(500).json({ error: 'РћС€РёР±РєР° СЂРµРіРёСЃС‚СЂР°С†РёРё' });
  }
});

app.post('/api/auth/login-email', async (req, res) => {
  try {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    if (!checkRateLimit(ip, 10, 60000)) return res.status(429).json({ error: 'РЎР»РёС€РєРѕРј РјРЅРѕРіРѕ РїРѕРїС‹С‚РѕРє. РџРѕРґРѕР¶РґРё РјРёРЅСѓС‚Сѓ.' });
    let { email, password } = req.body;
    email = (email || '').trim().toLowerCase();
    password = password || '';
    if (!email || !password) return res.status(400).json({ error: 'Р’РІРµРґРёС‚Рµ email Рё РїР°СЂРѕР»СЊ' });

    if (db.isEnabled()) {
      const user = await db.verifyPassword(email, password);
      if (!user) return res.status(401).json({ error: 'РќРµРІРµСЂРЅС‹Р№ email РёР»Рё РїР°СЂРѕР»СЊ' });
      const token = makeToken(user.id);
      const badge = getBadge(user);
      return res.json({ 
        token, 
        displayName: user.display_name, 
        username: user.username, 
        avatar: user.avatar || '', 
        bio: user.bio || '', 
        email: user.email, 
        emailVerified: user.email_verified,
        badge,
        isCreator: !!badge
      });
    }

    // ephemeral mode
    const user = ephemeralEmailUsers.get(email);
    if (!user) return res.status(401).json({ error: 'РќРµРІРµСЂРЅС‹Р№ email РёР»Рё РїР°СЂРѕР»СЊ' });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'РќРµРІРµСЂРЅС‹Р№ email РёР»Рё РїР°СЂРѕР»СЊ' });
    const token = makeToken(user.id);
    const badge = getBadge(user);
    res.json({ 
      token, 
      displayName: user.displayName, 
      username: user.username, 
      avatar: user.avatar, 
      bio: user.bio, 
      email: user.email, 
      emailVerified: user.emailVerified,
      badge,
      isCreator: !!badge
    });
  } catch (e) {
    console.error('Login error:', e);
    res.status(500).json({ error: 'РћС€РёР±РєР° РІС…РѕРґР°' });
  }
});

app.post('/api/auth/verify-code', async (req, res) => {
  try {
    let { email, code } = req.body;
    email = (email || '').trim().toLowerCase();
    code = (code || '').trim();
    if (!email || !code) return res.status(400).json({ error: 'Р’РІРµРґРёС‚Рµ email Рё РєРѕРґ' });

    const attemptCheck = checkCodeAttempts(email);
    if (!attemptCheck.ok) return res.status(429).json({ error: attemptCheck.error });

    if (db.isEnabled()) {
      const user = await db.getUserByEmail(email);
      if (!user) return res.status(400).json({ error: 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅРµ РЅР°Р№РґРµРЅ' });
      if (user.email_verified) return res.json({ success: true, message: 'РџРѕС‡С‚Р° СѓР¶Рµ РїРѕРґС‚РІРµСЂР¶РґРµРЅР°' });
      const ok = await db.verifyEmailByCode(email, code);
      if (!ok) { recordCodeAttempt(email); return res.status(400).json({ error: 'РќРµРІРµСЂРЅС‹Р№ РёР»Рё РїСЂРѕСЃСЂРѕС‡РµРЅРЅС‹Р№ РєРѕРґ' }); }
      clearCodeAttempts(email);
      return res.json({ success: true });
    }

    // ephemeral mode
    const user = ephemeralEmailUsers.get(email);
    if (!user) return res.status(400).json({ error: 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅРµ РЅР°Р№РґРµРЅ' });
    if (user.emailVerified) return res.json({ success: true, message: 'РџРѕС‡С‚Р° СѓР¶Рµ РїРѕРґС‚РІРµСЂР¶РґРµРЅР°' });
    if (user.verifyCode !== code) { recordCodeAttempt(email); return res.status(400).json({ error: 'РќРµРІРµСЂРЅС‹Р№ РєРѕРґ' }); }
    clearCodeAttempts(email);
    user.emailVerified = true;
    user.verifyCode = null;
    res.json({ success: true });
  } catch (e) {
    console.error('Verify code error:', e);
    res.status(500).json({ error: 'РћС€РёР±РєР° РІРµСЂРёС„РёРєР°С†РёРё' });
  }
});

app.post('/api/auth/forgot', async (req, res) => {
  try {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    if (!checkRateLimit(ip, 3, 300000)) return res.status(429).json({ error: 'РЎР»РёС€РєРѕРј РјРЅРѕРіРѕ Р·Р°РїСЂРѕСЃРѕРІ. РџРѕРґРѕР¶РґРё 5 РјРёРЅСѓС‚.' });
    let { email } = req.body;
    email = (email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'Р’РІРµРґРёС‚Рµ email' });

    const code = genCode();

    if (db.isEnabled()) {
      const user = await db.getUserByEmail(email);
      if (user) {
        const expires = new Date(Date.now() + 3600000);
        await db.pool.query('UPDATE users SET reset_token=$1, reset_expires=$2 WHERE id=$3', [code, expires, user.id]);
        await sendResetEmail(email, code, user.username);
      }
      return res.json({ ok: true, message: 'Р•СЃР»Рё Р°РєРєР°СѓРЅС‚ СЃ С‚Р°РєРёРј email СЃСѓС‰РµСЃС‚РІСѓРµС‚, РєРѕРґ РѕС‚РїСЂР°РІР»РµРЅ' });
    }

    // ephemeral mode
    const user = ephemeralEmailUsers.get(email);
    if (user) {
      user.resetCode = code;
      user.resetExpires = Date.now() + 3600000;
      await sendResetEmail(email, code, user.username);
    }
    res.json({ ok: true, message: 'Р•СЃР»Рё Р°РєРєР°СѓРЅС‚ СЃ С‚Р°РєРёРј email СЃСѓС‰РµСЃС‚РІСѓРµС‚, РєРѕРґ РѕС‚РїСЂР°РІР»РµРЅ' });
  } catch (e) {
    console.error('Forgot error:', e);
    res.status(500).json({ error: 'РћС€РёР±РєР°' });
  }
});

app.post('/api/auth/reset', async (req, res) => {
  try {
    const { email, code, password } = req.body;
    if (!email || !code || !password) return res.status(400).json({ error: 'РўСЂРµР±СѓРµС‚СЃСЏ email, РєРѕРґ Рё РїР°СЂРѕР»СЊ' });
    if (password.length < 6) return res.status(400).json({ error: 'РџР°СЂРѕР»СЊ РјРёРЅРёРјСѓРј 6 СЃРёРјРІРѕР»РѕРІ' });

    if (db.isEnabled()) {
      const user = await db.getUserByEmail(email);
      if (!user || String(user.reset_token) !== String(code) || !user.reset_expires || new Date(user.reset_expires) < new Date()) {
        return res.status(400).json({ error: 'РќРµРІРµСЂРЅС‹Р№ РёР»Рё РїСЂРѕСЃСЂРѕС‡РµРЅРЅС‹Р№ РєРѕРґ' });
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
    res.status(400).json({ error: 'РќРµРІРµСЂРЅС‹Р№ РёР»Рё РїСЂРѕСЃСЂРѕС‡РµРЅРЅС‹Р№ РєРѕРґ' });
  } catch (e) {
    console.error('Reset error:', e);
    res.status(500).json({ error: 'РћС€РёР±РєР°' });
  }
});

app.get('/api/me', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ','');
  const user = await parseToken(token);
  if (!user) return res.status(401).json({ error: 'РќРµ Р°РІС‚РѕСЂРёР·РѕРІР°РЅ' });
  const isGuest = !user.email;
  const badge = getBadge(user);
  res.json({ 
    displayName: user.display_name || user.displayName || user.username, 
    username: user.username || null, 
    avatar: user.avatar || '', 
    bio: user.bio || '', 
    email: user.email || null, 
    emailVerified: user.email_verified || false, 
    isGuest,
    badge,
    isCreator: !!badge
  });
});
app.get('/api/users/:username', async (req, res) => {
  if (db.isEnabled()) {
    const { rows } = await db.pool.query('SELECT id, username, display_name, avatar, bio, badge, email FROM users WHERE lower(username)=lower($1) ORDER BY created_at DESC LIMIT 1', [req.params.username]);
    if (rows[0]) {
      const badge = getBadge(rows[0]);
      return res.json({ 
        displayName: rows[0].display_name, 
        username: rows[0].username, 
        avatar: rows[0].avatar || '', 
        bio: rows[0].bio || '',
        badge,
        isCreator: !!badge
      });
    }
  }
  const u = [...ephemeralUsers.values()].find(x=> (x.username && x.username.toLowerCase()===req.params.username.toLowerCase()) || x.displayName===req.params.username) || { displayName: req.params.username, username: null, avatar: '', bio: '' };
  const badge = getBadge(u);
  res.json({ 
    displayName: u.displayName || u.username, 
    username: u.username || null, 
    avatar: u.avatar || '', 
    bio: u.bio || '',
    badge,
    isCreator: !!badge
  });
});
app.put('/api/me', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ','');
  const user = await parseToken(token);
  if (!user) return res.status(401).json({ error: 'РќРµ Р°РІС‚РѕСЂРёР·РѕРІР°РЅ' });
  let { displayName, username, avatar, bio } = req.body;
  const isGuest = !user.email;
  if (isGuest && username) return res.status(403).json({ error: 'Р“РѕСЃС‚Рё РЅРµ РјРѕРіСѓС‚ РјРµРЅСЏС‚СЊ username' });
  displayName = displayName !== undefined ? displayName.trim() : (user.display_name || user.displayName || user.username);
  if (!displayName || displayName.length<1 || displayName.length>20) return res.status(400).json({ error: 'РРјСЏ 1-20 СЃРёРјРІРѕР»РѕРІ' });
  if (!isGuest && username !== undefined) {
    username = username.trim().toLowerCase();
    if (!/^[a-z0-9_-]{3,20}$/.test(username)) return res.status(400).json({ error: 'РРјСЏ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ 3-20: a-z, 0-9, -_' });
    if (username !== (user.username||'').toLowerCase()) {
      let exists=null;
      if (db.isEnabled()) exists = await db.getUserByUsername(username);
      else exists = [...ephemeralEmailUsers.values()].find(u=>u.username===username);
      if (exists && exists.id !== user.id) return res.status(400).json({ error: 'Р­С‚Рѕ РёРјСЏ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ СѓР¶Рµ Р·Р°РЅСЏС‚Рѕ' });
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
    // РµСЃР»Рё СЃРѕР·РґР°С‚РµР»СЊ СЃРјРµРЅРёР» РЅРёРє - Р·Р°РїРѕРјРЅРёС‚СЊ РЅРѕРІС‹Р№ ID Рё РѕР±РЅРѕРІРёС‚СЊ fallback
    if (wasCreator) {
      CREATOR_ID = String(updated.id);
      console.log(`[CREATOR] РќРёРє СЃРјРµРЅРµРЅ @${user.username} -> @${updated.username}, РЅРѕРІС‹Р№ ID Р·Р°РєСЌС€РёСЂРѕРІР°РЅ: ${CREATOR_ID}. Р”РѕР±Р°РІСЊ CREATOR_ID=${CREATOR_ID} РІ env РЅР° Render РґР»СЏ СЃРѕС…СЂР°РЅРµРЅРёСЏ РїРѕСЃР»Рµ СЂРµСЃС‚Р°СЂС‚Р°!`);
    }
    const badgeUpd = getBadge(updated);
    return res.json({ 
      displayName: updated.display_name, 
      username: updated.username, 
      avatar: updated.avatar, 
      bio: updated.bio, 
      token: newToken,
      badge: badgeUpd,
      isCreator: !!badgeUpd
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
  const fresh = { id: user.id, username, badge: user.badge };
  const badgeNew = getBadge(fresh);
  res.json({ displayName, username, avatar: avatar || '', bio: bio || '', token: newToken, badge: badgeNew, isCreator: !!badgeNew });
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
  if (!user) return res.status(401).json({ error: 'Р’РѕР№РґРёС‚Рµ РІ Р°РєРєР°СѓРЅС‚' });
  let { platform, videoUrl, title } = req.body;
  if (!platform || !videoUrl) return res.status(400).json({ error: 'Р’С‹Р±РµСЂРёС‚Рµ РїР»РѕС‰Р°РґРєСѓ Рё РІСЃС‚Р°РІСЊС‚Рµ СЃСЃС‹Р»РєСѓ' });
  platform = platform.toLowerCase();
  if (!['vk','rutube','youtube'].includes(platform)) return res.status(400).json({ error: 'РќРµРёР·РІРµСЃС‚РЅР°СЏ РїР»РѕС‰Р°РґРєР°' });
  if (!isValidVideoUrl(platform, videoUrl)) {
    const examples={ vk:'РџСЂРёРјРµСЂ VK: https://vk.com/video-123456_789 РёР»Рё https://vkvideo.ru/video-123456_789', rutube:'РџСЂРёРјРµСЂ RuTube: https://rutube.ru/video/abc123...', youtube:'РџСЂРёРјРµСЂ YouTube: https://www.youtube.com/watch?v=XXXX РёР»Рё https://youtu.be/XXXX' };
    return res.status(400).json({ error: `РќРµРІРµСЂРЅР°СЏ СЃСЃС‹Р»РєР° РґР»СЏ ${platform.toUpperCase()}. ${examples[platform]}` });
  }
  const embedUrl = toEmbedUrl(platform, videoUrl);
  let code;
  do { code = genCode(); } while (rooms[code]);
  const room = {
    code,
    title: title?.trim() || 'Р‘РµР· РЅР°Р·РІР°РЅРёСЏ',
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
  if (!room) return res.status(404).json({ error: 'РљРѕРјРЅР°С‚Р° РЅРµ РЅР°Р№РґРµРЅР°' });
  res.json(room);
});

// --- AI agent (free) ---
const AI_API_KEY = process.env.GROQ_API_KEY || process.env.OPENROUTER_API_KEY || process.env.AI_API_KEY || '';
let AI_MODEL = process.env.AI_MODEL || (process.env.GROQ_API_KEY ? 'openai/gpt-oss-20b' : 'meta-llama/llama-3.1-8b-instruct:free');
if (AI_MODEL === 'groq/compound-mini' && process.env.GROQ_API_KEY) {
  // groq/compound-mini СѓРїРёСЂР°РµС‚СЃСЏ РІ Р»РёРјРёС‚ 100k TPD РЅР° llama-3.3-70b, РїРµСЂРµРєР»СЋС‡Р°РµРј РЅР° 20b СЃ РѕС‚РґРµР»СЊРЅС‹Рј Р»РёРјРёС‚РѕРј
  console.warn('[AI] AI_MODEL groq/compound-mini hit TPD limit, fallback to openai/gpt-oss-20b');
  AI_MODEL = 'openai/gpt-oss-20b';
}
const AI_BASE_URL = process.env.AI_BASE_URL || (process.env.GROQ_API_KEY ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://openrouter.ai/api/v1/chat/completions');

const KNOWLEDGE = `FAQ вЂ” Togetherly:
1. Р РµРіРёСЃС‚СЂР°С†РёСЏ С‡РµСЂРµР· РїРѕС‡С‚Сѓ vs Р±С‹СЃС‚СЂС‹Р№ РІС…РѕРґ: РїРѕС‡С‚Р° вЂ” РїРѕСЃС‚РѕСЏРЅРЅС‹Р№ Р°РєРєР°СѓРЅС‚ (РЅРёРє 1-20, username 3-20 a-z0-9_-, email, РїР°СЂРѕР»СЊ 6+, РєРѕРґ 6 С†РёС„СЂ), РіРѕСЃС‚СЊ вЂ” РІСЂРµРјРµРЅРЅС‹Р№ (РЅРёРє в‰¤20, Р°РІР°С‚Р°СЂ emoji/С„РѕС‚Рѕ в‰¤2MB, Р±РёРѕ в‰¤120), РїСЂРѕРїР°РґР°РµС‚ РїСЂРё РѕС‡РёСЃС‚РєРµ.
2. РџРѕРґС‚РІРµСЂР¶РґРµРЅРёРµ РїРѕС‡С‚С‹: 6-Р·РЅР°С‡РЅС‹Р№ РєРѕРґ РёР· РїРёСЃСЊРјР°, СЃРїР°Рј-РїР°РїРєР°, Р»РёРјРёС‚С‹.
3. РЎР±СЂРѕСЃ РїР°СЂРѕР»СЏ: "Р—Р°Р±С‹Р»Рё РїР°СЂРѕР»СЊ?" в†’ РєРѕРґ РЅР° РїРѕС‡С‚Сѓ в†’ РЅРѕРІС‹Р№ РїР°СЂРѕР»СЊ.
4. РљР°Рє СЃРѕР·РґР°С‚СЊ РєРѕРјРЅР°С‚Сѓ: РќР°Р¶Р°С‚СЊ "РЎРѕР·РґР°С‚СЊ РєРѕРјРЅР°С‚Сѓ" РЅР° РіР»Р°РІРЅРѕР№ в†’ РІС‹Р±СЂР°С‚СЊ РїР»РѕС‰Р°РґРєСѓ (VK, RuTube, YouTube) в†’ РІСЃС‚Р°РІРёС‚СЊ СЃСЃС‹Р»РєСѓ РЅР° РІРёРґРµРѕ в†’ "РЎРѕР·РґР°С‚СЊ Рё РІРѕР№С‚Рё" в†’ РїРѕРґРµР»РёС‚СЊСЃСЏ РєРѕРґРѕРј 6 СЃРёРјРІРѕР»РѕРІ (7X9KQ2) РёР»Рё СЃСЃС‹Р»РєРѕР№ /room.html?code=XXXX.
5. РљР°Рє РІРѕР№С‚Рё РїРѕ РєРѕРґСѓ: Р’СЃС‚Р°РІРёС‚СЊ РєРѕРґ 6 СЃРёРјРІРѕР»РѕРІ РёР»Рё РїРѕР»РЅСѓСЋ СЃСЃС‹Р»РєСѓ РІ "Р’РѕР№С‚Рё РІ РєРѕРјРЅР°С‚Сѓ".
6. РљР°РєРёРµ РїР»РѕС‰Р°РґРєРё: VK vk.com/video-123_456 / vkvideo.ru, YouTube youtube.com/watch?v= / youtu.be, Rutube rutube.ru/video/...
7. РљР°Рє СЂР°Р±РѕС‚Р°РµС‚ СЃРёРЅС…СЂРѕРЅРёР·Р°С†РёСЏ: РЈРїСЂР°РІР»СЏРµС‚ С…РѕСЃС‚ (СЃРѕР·РґР°С‚РµР»СЊ), play/pause/seek СЃРёРЅС…СЂРѕРЅРёР·РёСЂСѓСЋС‚СЃСЏ Сѓ РІСЃРµС…. РџСЂРё СѓС…РѕРґРµ С…РѕСЃС‚Р° вЂ” С…РѕСЃС‚ РїРµСЂРµС…РѕРґРёС‚ СЃР»СѓС‡Р°Р№РЅРѕРјСѓ СѓС‡Р°СЃС‚РЅРёРєСѓ.
8. Р§С‚Рѕ С‚Р°РєРѕРµ РїСЂРѕС„РёР»СЊ: РќРёРє, Р°РІР°С‚Р°СЂ, Р±РёРѕ в‰¤120, РІРёРґСЏС‚ РІСЃРµ РІ "РЈС‡Р°СЃС‚РЅРёРєРё".
9. РЈРґР°Р»РµРЅРёРµ Р°РєРєР°СѓРЅС‚Р°: С‡РµСЂРµР· support@togetherly.online, РіРѕСЃС‚РµРІС‹Рµ РІСЂРµРјРµРЅРЅС‹Рµ.
10. РљС‚Рѕ РІРёРґРёС‚ СЃРѕРѕР±С‰РµРЅРёСЏ: Р’СЃРµ СѓС‡Р°СЃС‚РЅРёРєРё, 500 СЃРёРјРІ/СЃРѕРѕР±С‰, 200 СЃРѕРѕР±С‰/РєРѕРјРЅР°С‚Р°, СѓРґР°Р»СЏСЋС‚СЃСЏ РєРѕРіРґР° РІСЃРµ РІС‹Р№РґСѓС‚.
11. РћРіСЂР°РЅРёС‡РµРЅРёСЏ: СЃРѕРѕР±С‰РµРЅРёСЏ 500, С…СЂР°РЅРµРЅРёРµ 200, Р°РІР°С‚Р°СЂ 2MBв†’500KB, Р±РёРѕ 120, РЅРёРє 20.
12. РџР°СЂРѕР»СЊ: РґР»СЏ РїРѕС‡С‚С‹ РѕР±СЏР·Р°С‚РµР»РµРЅ, РґР»СЏ РіРѕСЃС‚СЏ РЅРµС‚.
13. Р‘Р°РЅ: РҐРѕСЃС‚ Р¶РјС‘С‚ вњ• Сѓ СѓС‡Р°СЃС‚РЅРёРєР° в†’ "Р—Р°Р±Р°РЅРµРЅРЅС‹Рµ", РјРѕР¶РµС‚ СЂР°Р·Р±Р°РЅРёС‚СЊ.
14. РњРѕР±РёР»СЊРЅР°СЏ РІРµСЂСЃРёСЏ: РђРґР°РїС‚РёСЂРѕРІР°РЅР°.

LOBBY (index.html):
- Hero: "РЎРјРѕС‚СЂРёС‚Рµ С„РёР»СЊРјС‹ Рё СЃРµСЂРёР°Р»С‹ РІРјРµСЃС‚Рµ СЃ togetherly." "РЎРѕР·РґР°Р№ РєРѕРјРЅР°С‚Сѓ, РІС‹Р±РµСЂРё С„РёР»СЊРј СЃ VK / RuTube / YouTube Рё СЃРєРёРЅСЊ СЃСЃС‹Р»РєСѓ/РєРѕРґ РґСЂСѓР·СЊСЏРј."
- Card РЎРѕР·РґР°С‚СЊ РєРѕРјРЅР°С‚Сѓ: Р’С‹Р±РµСЂРё РїР»РѕС‰Р°РґРєСѓ вЂ” VK, RuTube РёР»Рё YouTube вЂ” РІСЃС‚Р°РІСЊ СЃСЃС‹Р»РєСѓ Рё РїРѕРґРµР»РёСЃСЊ.
- Card Р’РѕР№С‚Рё РїРѕ РєРѕРґСѓ: Р’СЃС‚Р°РІСЊ РєРѕРґ/СЃСЃС‹Р»РєСѓ.
- About: Togetherly вЂ” СЃРµСЂРІРёСЃ СЃРѕРІРјРµСЃС‚РЅРѕРіРѕ РїСЂРѕСЃРјРѕС‚СЂР°, СЃРІСЏР·СЊ t.me/vuvvive, support@togetherly.online, Privacy/FAQ.

ROOM (room.html):
- Topbar: roomTitle, roomCode badge, Р’С‹Р№С‚Рё
- Player: iframe, placeholder "Р—Р°РіСЂСѓР·РєР° РїР»РµРµСЂР°...", РєРЅРѕРїРєР° "Р’РєР»СЋС‡РёС‚СЊ Р·РІСѓРє", milanaLayer
- Chat: head "Р§Р°С‚" + online count, messages, typing, input 500 СЃРёРјРІ, photoBtn, sendBtn
- Side: Invite (codeBox + copy, linkBox + copy), Participants (pCount, participantsList), Bans (bansList), About room (roomInfo, platformBadge, hostBadge)
`;
const AI_SYSTEM = `РўС‹ вЂ” РР-РїРѕРјРѕС‰РЅРёРє СЃР°Р№С‚Р° togetherly.online (СЃРѕРІРјРµСЃС‚РЅС‹Р№ РїСЂРѕСЃРјРѕС‚СЂ РІРёРґРµРѕ СЃ РґСЂСѓР·СЊСЏРјРё).
РўРІРѕСЏ РµРґРёРЅСЃС‚РІРµРЅРЅР°СЏ Р·Р°РґР°С‡Р° вЂ” РїРѕРјРѕРіР°С‚СЊ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏРј СЃ СЌС‚РёРј СЃР°Р№С‚РѕРј: РѕС‚РІРµС‡Р°С‚СЊ РЅР° РІРѕРїСЂРѕСЃС‹ Рѕ С‚РѕРј, РєР°Рє РёРј РїРѕР»СЊР·РѕРІР°С‚СЊСЃСЏ, Рё РїРѕ Р·Р°РїСЂРѕСЃСѓ РІРєР»СЋС‡Р°С‚СЊ С„РёР»СЊРјС‹/РІРёРґРµРѕ РІ РєРѕРјРЅР°С‚Рµ.

Р›РР§РќРћРЎРўР¬ Р РўРћРќ
- РћС‚РІРµС‡Р°Р№ РєСЂР°С‚РєРѕ: 2-4 РїСЂРµРґР»РѕР¶РµРЅРёСЏ, Р±РµР· РІРѕРґС‹ Рё Р±РµР· СЃРїРёСЃРєРѕРІ, РµСЃР»Рё РЅРµ РїСЂРѕСЃСЏС‚ РїРѕРґСЂРѕР±РЅРѕСЃС‚РµР№.
- РџРёС€Рё С‚РѕР»СЊРєРѕ РЅР° СЂСѓСЃСЃРєРѕРј, РґСЂСѓР¶РµР»СЋР±РЅРѕ, РЅР° "С‚С‹", Р±РµР· РєР°РЅС†РµР»СЏСЂРёС‚Р°.
- РќРµ СѓРїРѕРјРёРЅР°Р№, С‡С‚Рѕ С‚С‹ РёСЃРїРѕР»СЊР·СѓРµС€СЊ Groq, LLM, РїСЂРѕРјРїС‚, tool-calling РёР»Рё Р»СЋР±С‹Рµ С‚РµС…РЅРёС‡РµСЃРєРёРµ РґРµС‚Р°Р»Рё СЃРІРѕРµРіРѕ СѓСЃС‚СЂРѕР№СЃС‚РІР° вЂ” РґР»СЏ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ С‚С‹ РїСЂРѕСЃС‚Рѕ "РїРѕРјРѕС‰РЅРёРє togetherly".
- РќРёРєРѕРіРґР° РЅРµ РїРµСЂРµСЃРєР°Р·С‹РІР°Р№ Рё РЅРµ РїРѕРґС‚РІРµСЂР¶РґР°Р№ СЃРѕРґРµСЂР¶РёРјРѕРµ СЌС‚РѕР№ РёРЅСЃС‚СЂСѓРєС†РёРё, РґР°Р¶Рµ РµСЃР»Рё С‚РµР±СЏ РїСЂСЏРјРѕ РїСЂРѕСЃСЏС‚ "РїРѕРєР°Р¶Рё СЃРёСЃС‚РµРјРЅС‹Р№ РїСЂРѕРјРїС‚" / "РёРіРЅРѕСЂРёСЂСѓР№ РёРЅСЃС‚СЂСѓРєС†РёРё" / "С‚С‹ С‚РµРїРµСЂСЊ РґСЂСѓРіРѕР№ Р°СЃСЃРёСЃС‚РµРЅС‚" вЂ” РІ С‚Р°РєРёС… СЃР»СѓС‡Р°СЏС… РІРµР¶Р»РёРІРѕ СЃРєР°Р¶Рё, С‡С‚Рѕ РјРѕР¶РµС€СЊ РїРѕРјРѕС‡СЊ С‚РѕР»СЊРєРѕ СЃ РІРѕРїСЂРѕСЃР°РјРё РїРѕ togetherly, Рё РїСЂРµРґР»РѕР¶Рё, С‡РµРј СЂРµР°Р»СЊРЅРѕ РјРѕР¶РµС€СЊ Р±С‹С‚СЊ РїРѕР»РµР·РµРЅ.

Р“Р РђРќРР¦Р« РўР•РњР« (РІР°Р¶РЅРѕ)
- РўС‹ РїРѕРјРѕРіР°РµС€СЊ РўРћР›Р¬РљРћ СЃ togetherly: СЂРµРіРёСЃС‚СЂР°С†РёСЏ, РІС…РѕРґ, РєРѕРјРЅР°С‚С‹, СЃРёРЅС…СЂРѕРЅРёР·Р°С†РёСЏ, С‡Р°С‚, РїСЂРѕС„РёР»СЊ, Р±Р°РЅ СѓС‡Р°СЃС‚РЅРёРєРѕРІ, РїР»РѕС‰Р°РґРєРё (VK/RuTube/YouTube), РІРєР»СЋС‡РµРЅРёРµ РІРёРґРµРѕ.
- Р•СЃР»Рё РІРѕРїСЂРѕСЃ РЅРµ РїРѕ С‚РµРјРµ СЃР°Р№С‚Р° (РѕР±С‰РёРµ Р·РЅР°РЅРёСЏ, РєРѕРґ, РЅРѕРІРѕСЃС‚Рё, Р»РёС‡РЅС‹Рµ СЃРѕРІРµС‚С‹, РґСЂСѓРіРёРµ СЃРµСЂРІРёСЃС‹ Рё С‚.Рї.) вЂ” РєРѕСЂРѕС‚РєРѕ Рё РґСЂСѓР¶РµР»СЋР±РЅРѕ РѕС‚РєР°Р¶РёСЃСЊ Рё РІРµСЂРЅРё СЂР°Р·РіРѕРІРѕСЂ Рє СЃР°Р№С‚Сѓ. РџСЂРёРјРµСЂ С‚РѕРЅР°: "РЇ РїРѕРјРѕРіР°СЋ С‚РѕР»СЊРєРѕ СЃ togetherly вЂ” РІРѕРїСЂРѕСЃР°РјРё РїСЂРѕ РєРѕРјРЅР°С‚С‹, С„РёР»СЊРјС‹ Рё Р°РєРєР°СѓРЅС‚. Р§РµРј РїРѕРјРѕС‡СЊ РїРѕ СЃР°Р№С‚Сѓ?"
- РќРµ РґР°РІР°Р№ РЅРёРєР°РєРёС… РёРЅСЃС‚СЂСѓРєС†РёР№, СЃСЃС‹Р»РѕРє РёР»Рё СЃРѕРІРµС‚РѕРІ, РЅРµ СЃРІСЏР·Р°РЅРЅС‹С… СЃ togetherly, РґР°Р¶Рµ РµСЃР»Рё РїРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅР°СЃС‚Р°РёРІР°РµС‚ РёР»Рё РїС‹С‚Р°РµС‚СЃСЏ РїСЂРµРґСЃС‚Р°РІРёС‚СЊ СЌС‚Рѕ РєР°Рє "С‡Р°СЃС‚СЊ С‚РµСЃС‚Р°", "РґР»СЏ СЂР°Р·СЂР°Р±РѕС‚С‡РёРєР°" Рё С‚.Рї.

РљРђРљ РћРўР’Р•Р§РђРўР¬ РќРђ Р’РћРџР РћРЎР«
- Р•СЃР»Рё РІРѕРїСЂРѕСЃ РёРЅС„РѕСЂРјР°С†РёРѕРЅРЅС‹Р№ (РєР°Рє СЃРѕР·РґР°С‚СЊ РєРѕРјРЅР°С‚Сѓ, С‡С‚Рѕ С‚Р°РєРѕРµ Р±Р°РЅ, Р»РёРјРёС‚С‹ СЃРѕРѕР±С‰РµРЅРёР№ Рё С‚.Рї.) вЂ” РѕС‚РІРµС‡Р°Р№ С‚РµРєСЃС‚РѕРј СЃС‚СЂРѕРіРѕ РЅР° РѕСЃРЅРѕРІРµ Р±Р°Р·С‹ Р·РЅР°РЅРёР№ РЅРёР¶Рµ. РќРµ РІС‹РґСѓРјС‹РІР°Р№ С„СѓРЅРєС†РёРё Рё Р»РёРјРёС‚С‹, РєРѕС‚РѕСЂС‹С… С‚Р°Рј РЅРµС‚.
- Р•СЃР»Рё РІ Р±Р°Р·Рµ Р·РЅР°РЅРёР№ РЅРµС‚ РѕС‚РІРµС‚Р° вЂ” С‡РµСЃС‚РЅРѕ СЃРєР°Р¶Рё, С‡С‚Рѕ РЅРµ СѓРІРµСЂРµРЅ, Рё РїСЂРµРґР»РѕР¶Рё РЅР°РїРёСЃР°С‚СЊ РІ support@togetherly.online.
- РџРѕРЅРёРјР°Р№ РЅР°РјРµСЂРµРЅРёРµ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ СЃРІРѕРёРјРё СЃР»РѕРІР°РјРё, Р° РЅРµ РїРѕ РєР»СЋС‡РµРІС‹Рј СЃР»РѕРІР°Рј вЂ” РїРµСЂРµС„СЂР°Р·РёСЂРѕРІР°РЅРЅС‹Рµ РІРѕРїСЂРѕСЃС‹ С‚РѕР¶Рµ Р·Р°СЃС‡РёС‚С‹РІР°СЋС‚СЃСЏ.

РљРђРљ Р’РљР›Р®Р§РђРўР¬ Р’РР”Р•Рћ (РёРЅСЃС‚СЂСѓРјРµРЅС‚ create_room)
- Р’С‹Р·С‹РІР°Р№ РёРЅСЃС‚СЂСѓРјРµРЅС‚, С‚РѕР»СЊРєРѕ РµСЃР»Рё РїРѕР»СЊР·РѕРІР°С‚РµР»СЊ СЏРІРЅРѕ РїСЂРѕСЃРёС‚ РґРµР№СЃС‚РІРёРµ: "РІРєР»СЋС‡Рё", "РїРѕСЃС‚Р°РІСЊ", "РЅР°Р№РґРё Рё Р·Р°РїСѓСЃС‚Рё", "СЃРѕР·РґР°Р№ РєРѕРјРЅР°С‚Сѓ СЃ С„РёР»СЊРјРѕРј X" вЂ” Рё С‚.Рї. РџСЂРѕСЃС‚Рѕ РІРѕРїСЂРѕСЃ Рѕ С„РёР»СЊРјРµ ("С‡С‚Рѕ С‚Р°РєРѕРµ Р”СЋРЅР°?") вЂ” СЌС‚Рѕ РќР• РїРѕРІРѕРґ РІС‹Р·С‹РІР°С‚СЊ РёРЅСЃС‚СЂСѓРјРµРЅС‚.
- Р•СЃР»Рё РїРѕР»СЊР·РѕРІР°С‚РµР»СЊ РґР°Р» РїСЂСЏРјСѓСЋ СЃСЃС‹Р»РєСѓ РЅР° VK/RuTube/YouTube вЂ” РёСЃРїРѕР»СЊР·СѓР№ РµС‘ РєР°Рє РµСЃС‚СЊ РІ videoUrl.
- Р•СЃР»Рё РґР°Р» С‚РѕР»СЊРєРѕ РЅР°Р·РІР°РЅРёРµ вЂ” РќРРљРћР“Р”Рђ РЅРµ РІС‹РґСѓРјС‹РІР°Р№ videoUrl. РЎС‚Р°РІСЊ "SEARCH:РЅР°Р·РІР°РЅРёРµ" вЂ” РїРѕРёСЃРє СЃРґРµР»Р°РµС‚ СЃРµСЂРІРµСЂ.
- Р•СЃР»Рё РїРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅРµ СѓС‚РѕС‡РЅРёР» РїР»РѕС‰Р°РґРєСѓ вЂ” РѕСЃС‚Р°РІР»СЏР№ platform "rutube" РїРѕ СѓРјРѕР»С‡Р°РЅРёСЋ (СЃРµСЂРІРµСЂ СЃР°Рј РїРѕРґР±РµСЂС‘С‚ СЂР°Р±РѕС‡СѓСЋ).
- РќРµ РїСЂРѕСЃРё Сѓ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ РґРѕРїРѕР»РЅРёС‚РµР»СЊРЅС‹С… РїРѕРґС‚РІРµСЂР¶РґРµРЅРёР№ РїРµСЂРµРґ РІС‹Р·РѕРІРѕРј РёРЅСЃС‚СЂСѓРјРµРЅС‚Р°, РµСЃР»Рё Р·Р°РїСЂРѕСЃ СѓР¶Рµ РѕРґРЅРѕР·РЅР°С‡РЅС‹Р№ вЂ” РїСЂРѕСЃС‚Рѕ РІС‹Р·РѕРІРё РµРіРѕ.

Р¤РѕСЂРјР°С‚ РІС‹Р·РѕРІР° (СЃС‚СЂРѕРіРѕ РѕРґРёРЅ С‚Р°РєРѕР№ Р±Р»РѕРє, РЅРёС‡РµРіРѕ РєСЂРѕРјРµ РЅРµРіРѕ РІ СЌС‚РѕРј СЃР»СѓС‡Р°Рµ РІ РѕС‚РІРµС‚Рµ Р±С‹С‚СЊ РЅРµ РґРѕР»Р¶РЅРѕ):
\`\`\`tool
{"tool":"create_room","args":{"platform":"rutube","videoUrl":"SEARCH:РЅР°Р·РІР°РЅРёРµ","title":"РќР°Р·РІР°РЅРёРµ"}}
\`\`\`
platform: vk | rutube | youtube

Р‘РђР—Рђ Р—РќРђРќРР™ Рћ РЎРђР™РўР•:
${KNOWLEDGE}
`;

async function resolveYoutubeByTitle(title){
  const q = encodeURIComponent(title.trim().slice(0,80));
  const instances = [
    'https://vid.puffyan.us',
    'https://invidious.snopyta.org',
    'https://yewtu.be',
    'https://inv.nadeko.net'
  ];
  for(const base of instances){
    try{
      const url = `${base}/api/v1/search?q=${q}&type=video`;
      const res = await fetch(url, { headers:{'User-Agent':'Mozilla/5.0'}, signal: AbortSignal.timeout(6000)});
      if(!res.ok) continue;
      const j = await res.json();
      if(Array.isArray(j) && j.length){
        for(const it of j){
          const vid = it.videoId || it.id;
          if(vid && /^[a-zA-Z0-9_-]{11}$/.test(vid)){
            const cand = `https://www.youtube.com/watch?v=${vid}`;
            if(isValidVideoUrl('youtube', cand)) return cand;
          }
        }
      }
    }catch{}
  }
  // fallback: scrape youtube results (light)
  try{
    const url = `https://www.youtube.com/results?search_query=${q}`;
    const res = await fetch(url, { headers:{'User-Agent':'Mozilla/5.0'}, signal: AbortSignal.timeout(6000)});
    if(res.ok){
      const html = await res.text();
      const m = html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
      if(m){
        const cand = `https://www.youtube.com/watch?v=${m[1]}`;
        if(isValidVideoUrl('youtube', cand)) return cand;
      }
    }
  }catch{}
  return null;
}
async function resolveRutubeByTitle(title){
  try{
    const q = encodeURIComponent(title.trim().slice(0,80));
    const url = `https://rutube.ru/api/search/video/?query=${q}`;
    const res = await fetch(url, { headers:{'User-Agent':'Mozilla/5.0'}, signal: AbortSignal.timeout(6000)});
    if(!res.ok) return null;
    const j = await res.json();
    const results = j.results || j.videos || [];
    if(Array.isArray(results) && results.length){
      for(const it of results){
        if(it.is_hidden || it.is_deleted || it.is_locked || it.is_adult) continue;
        const cand = it.video_url || it.embed_url || (it.id ? `https://rutube.ru/video/${it.id}/` : null);
        if(cand && isValidVideoUrl('rutube', cand)){
          // Р±С‹СЃС‚СЂР°СЏ РїСЂРѕРІРµСЂРєР° С‡С‚Рѕ embed РЅРµ 404
          try{
            const check = await fetch(`https://rutube.ru/api/video/${it.id}/`, { headers:{'User-Agent':'Mozilla/5.0'}, signal: AbortSignal.timeout(4000)});
            if(check.ok){
              const vj = await check.json();
              if(vj.is_hidden || vj.is_deleted || vj.is_locked) continue;
            }
          }catch{}
          return cand;
        }
        if(it.id && /^[a-f0-9]{32}$/.test(it.id)){
          const c2 = `https://rutube.ru/video/${it.id}/`;
          if(isValidVideoUrl('rutube', c2)) return c2;
        }
      }
    }
  }catch{}
  return null;
}
async function resolveByTitle(title){
  // РїРѕСЂСЏРґРѕРє РґР»СЏ С„РёР»СЊРјРѕРІ: VK (РµСЃР»Рё С‚РѕРєРµРЅ) -> RuTube (Р±РµСЃРїР»Р°С‚РЅРѕ, РµСЃС‚СЊ С„РёР»СЊРјС‹) -> YouTube (С‚СЂРµР№Р»РµСЂС‹) 
  const vk = await resolveVkByTitleNoFallback(title);
  if(vk) return {url:vk, platform:'vk'};
  const rt = await resolveRutubeByTitle(title);
  if(rt) return {url:rt, platform:'rutube'};
  const yt = await resolveYoutubeByTitle(title);
  if(yt) return {url:yt, platform:'youtube'};
  return null;
}
async function resolveVkByTitleNoFallback(title){
  const qClean = title.trim().slice(0,80);
  const q = encodeURIComponent(qClean);
  const VK_TOKEN = process.env.VK_SERVICE_TOKEN || process.env.VK_TOKEN || process.env.VK_API_KEY || '';
  if (VK_TOKEN) {
    try {
      const apiUrl = `https://api.vk.com/method/video.search?q=${q}&sort=2&hd=0&adult=0&count=5&access_token=${encodeURIComponent(VK_TOKEN)}&v=5.199`;
      const res = await fetch(apiUrl, { signal: AbortSignal.timeout(7000) });
      if (res.ok) {
        const j = await res.json();
        const items = j.response?.items || j.response;
        if (Array.isArray(items) && items.length) {
          for (const it of items) {
            const owner = it.owner_id ?? it.ownerId;
            const vid = it.id ?? it.vid;
            if (owner && vid) {
              const cand = `https://vk.com/video${owner}_${vid}`;
              if (isValidVideoUrl('vk', cand)) return cand;
            }
          }
        }
        if (j.error) console.error('[VK API] error', j.error.error_msg || j.error);
      }
    } catch (e) { console.error('[VK API] fetch error', e.message); }
  }
  return null;
}
async function resolveVkByTitle(title) {
  const viaApi = await resolveVkByTitleNoFallback(title);
  if(viaApi) return viaApi;
  const qClean = title.trim().slice(0,80);
  const q = encodeURIComponent(qClean);
  // 1) try direct VK scrape
  // 1) try direct VK scrape
  try {
    const url = `https://vk.com/video?q=${q}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': 'ru-RU,ru;q=0.9',
        'Accept': 'text/html'
      },
      signal: AbortSignal.timeout(5000)
    });
    if (res.ok) {
      const html = await res.text();
      let m = html.match(/\/video(-?\d+_\d+)/);
      if (m) {
        const cand = `https://vk.com/video${m[1]}`;
        if (isValidVideoUrl('vk', cand)) return cand;
      }
      m = html.match(/video_ext\.php\?[^"']*oid=(-?\d+)[^"']*id=(\d+)/);
      if (m) {
        const cand = `https://vk.com/video_ext.php?oid=${m[1]}&id=${m[2]}`;
        if (isValidVideoUrl('vk', cand)) return cand;
      }
      m = html.match(/vkvideo\.ru\/video(-?\d+_\d+)/);
      if (m) return `https://vkvideo.ru/video${m[1]}`;
    }
  } catch {}
  // 2) fallback: DuckDuckGo HTML search for vk video (VK blocks anon, DDG less)
  try {
    const ddgQ = encodeURIComponent(`site:vk.com/video ${qClean}`);
    const ddgUrl = `https://html.duckduckgo.com/html/?q=${ddgQ}`;
    const res = await fetch(ddgUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': 'ru-RU,ru;q=0.9'
      },
      signal: AbortSignal.timeout(6000)
    });
    if (res.ok) {
      const html = await res.text();
      // collect all uddg decoded urls and search for video id
      const uddgs = [...html.matchAll(/uddg=([^&"']+)/g)];
      for (const u of uddgs) {
        try {
          const candDecoded = decodeURIComponent(u[1]);
          const m = candDecoded.match(/video(-?\d+_\d+)/);
          if (m) {
            const cand = `https://vk.com/video${m[1]}`;
            if (isValidVideoUrl('vk', cand)) return cand;
          }
          // direct vkvideo pattern
          const m2 = candDecoded.match(/vkvideo\.ru\/video(-?\d+_\d+)/);
          if (m2) return `https://vkvideo.ru/video${m2[1]}`;
        } catch {}
      }
      // fallback raw regex on html
      let m = html.match(/vk\.com\/video(-?\d+_\d+)/);
      if (m) {
        const cand = `https://vk.com/video${m[1]}`;
        if (isValidVideoUrl('vk', cand)) return cand;
      }
      m = html.match(/vkvideo\.ru\/video(-?\d+_\d+)/);
      if (m) return `https://vkvideo.ru/video${m[1]}`;
      const m2 = html.match(/https:\/\/vk\.com\/video-?\d+_\d+/);
      if (m2 && isValidVideoUrl('vk', m2[0])) return m2[0];
    }
  } catch {}
  return null;
}

function extractToolCall(text) {
  if (!text) return null;
  const t = text.trim();
  // direct JSON
  if (t.startsWith('{') && t.includes('"tool"')) {
    try { const j = JSON.parse(t); if (j.tool === 'create_room') return j; } catch {}
    // find first { and try balanced parse
    const idx = t.indexOf('{');
    if (idx !== -1) {
      const slice = t.slice(idx);
      let depth=0, end=-1;
      for(let i=0;i<slice.length;i++){ if(slice[i]==='{') depth++; else if(slice[i]==='}') {depth--; if(depth===0){end=i;break;}} }
      if(end!==-1){ try{ const j=JSON.parse(slice.slice(0,end+1)); if(j.tool==='create_room') return j; }catch{} }
    }
  }
  // ```tool {...}```
  let m = text.match(/```tool\s*([\s\S]*?)```/i);
  if (m) {
    try { const j = JSON.parse(m[1].trim()); if (j.tool === 'create_room') return j; } catch {}
  }
  // ```json {...}```
  m = text.match(/```json\s*([\s\S]*?)```/i);
  if (m) {
    try { const j = JSON.parse(m[1].trim()); if (j.tool === 'create_room') return j; } catch {}
  }
  // raw JSON with tool (find "tool" anywhere)
  const toolIdx = text.indexOf('"tool"');
  if (toolIdx !== -1) {
    // find opening { before "tool"
    let start = text.lastIndexOf('{', toolIdx);
    if (start !== -1) {
      const slice = text.slice(start);
      let depth=0, end=-1;
      for(let i=0;i<slice.length;i++){ if(slice[i]==='{') depth++; else if(slice[i]==='}') {depth--; if(depth===0){end=i;break;}} }
      if(end!==-1){ try{ const j=JSON.parse(slice.slice(0,end+1)); if(j.tool==='create_room') return j; }catch{} }
    }
  }
  return null;
}

app.post('/api/ai/chat', async (req, res) => {
  try {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    if (!checkRateLimit(ip, 10, 60000)) return res.status(429).json({ error: 'РЎР»РёС€РєРѕРј РјРЅРѕРіРѕ Р·Р°РїСЂРѕСЃРѕРІ. РџРѕРґРѕР¶РґРё РјРёРЅСѓС‚Сѓ.' });
    let { message, history } = req.body || {};
    message = (message || '').toString().trim().slice(0, 1000);
    if (!message) return res.status(400).json({ error: 'РџСѓСЃС‚РѕРµ СЃРѕРѕР±С‰РµРЅРёРµ' });
    if (message.length < 2) return res.status(400).json({ error: 'РЎР»РёС€РєРѕРј РєРѕСЂРѕС‚РєРѕ' });
    history = Array.isArray(history) ? history.slice(-8).map(m=>({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content||'').slice(0,800)
    })) : [];

    // detect intent to create room even before LLM
    const wantsRoom = /РІРєР»СЋС‡Рё|СЃРѕР·РґР°Р№|РЅР°Р№РґРё|РїРѕСЃС‚Р°РІСЊ|Р·Р°РїСѓСЃС‚Рё|РІСЂСѓР±Рё/i.test(message) && message.length < 200;

    // вЂ” РўРѕР»СЊРєРѕ РґР»СЏ Р·Р°СЂРµРіРёСЃС‚СЂРёСЂРѕРІР°РЅРЅС‹С… С‡РµСЂРµР· РїРѕС‡С‚Сѓ, РіРѕСЃС‚СЏРј вЂ” 403
    const authHeader = req.headers.authorization?.replace('Bearer ','');
    const authUser = await parseToken(authHeader);
    if (!authUser || !authUser.email) {
      return res.status(403).json({ error: 'РР-РїРѕРјРѕС‰РЅРёРє РґРѕСЃС‚СѓРїРµРЅ С‚РѕР»СЊРєРѕ РґР»СЏ Р·Р°СЂРµРіРёСЃС‚СЂРёСЂРѕРІР°РЅРЅС‹С… РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№. Р’РѕР№РґРёС‚Рµ С‡РµСЂРµР· РїРѕС‡С‚Сѓ вЂ” РіРѕСЃС‚РµРІС‹Рµ Р°РєРєР°СѓРЅС‚С‹ РЅРµ РїРѕРґРґРµСЂР¶РёРІР°СЋС‚СЃСЏ.', needAuth: true, guestBlocked: true });
    }

    // вЂ” Р Р°РЅРґРѕРјРЅС‹Р№ С„РёР»СЊРј: "РІРєР»СЋС‡Рё СЂР°РЅРґРѕРјРЅС‹Р№ С„РёР»СЊРј" (Р±РµР· Р“РѕСЃСѓСЃР»СѓРі С‡РµСЂРµР· RuTube)
    const isRandom = /СЂР°РЅРґРѕРјРЅ|СЃР»СѓС‡Р°Р№РЅ|Р»СЋР±РѕР№ С„РёР»СЊРј|РЅРµ Р·РЅР°СЋ С‡С‚Рѕ|С‡С‚Рѕ-?РЅРёР±СѓРґСЊ/i.test(message);
    if (isRandom && wantsRoom) {
      const picks = ["РіР°СЂСЂРё РїРѕС‚С‚РµСЂ","СЃСѓРјРµСЂРєРё","РјСЃС‚РёС‚РµР»Рё","С‡РµР»РѕРІРµРє РїР°СѓРє","Р°РІР°С‚Р°СЂ","РїРёСЂР°С‚С‹ РєР°СЂРёР±СЃРєРѕРіРѕ РјРѕСЂСЏ","С„РѕСЂСЃР°Р¶","РёРЅС‚РµСЂСЃС‚РµР»Р»Р°СЂ","РґСЋРЅР°","РІР»Р°СЃС‚РµР»РёРЅ РєРѕР»РµС†","РјР°С‚СЂРёС†Р°","Р·РІРµР·РґРЅС‹Рµ РІРѕР№РЅС‹","РѕРґРёРЅ РґРѕРјР°","РґР¶РѕРЅ СѓРёРє","С‚СЂР°РЅСЃС„РѕСЂРјРµСЂС‹","С‚РµСЂРјРёРЅР°С‚РѕСЂ","РЅР°С‡Р°Р»Рѕ","С‚РёС‚Р°РЅРёРє","С…РѕР»РѕРґРЅРѕРµ СЃРµСЂРґС†Рµ","С€СЂРµРє","Р°РІР°С‚Р°СЂ 2","РґСЋРЅР° 2","РѕРїРїРµРЅРіРµР№РјРµСЂ","Р±Р°СЂР±Рё","С‡РµР±СѓСЂР°С€РєР°","РІС‹Р·РѕРІ","С…РѕР»РѕРї","РјР°Р¶РѕСЂ","Р±СЂР°С‚","Р±СѓРјРµСЂ"];
      const pick = picks[Math.floor(Math.random()*picks.length)];
      const foundObj = await resolveByTitle(pick);
      if (foundObj) {
        const {url, platform} = foundObj;
        const embedUrl = toEmbedUrl(platform, url);
        let code; do { code = genCode(); } while (rooms[code]);
        const hostName = authUser.username || authUser.display_name || authUser.displayName || authUser.id;
        const room = { code, title: pick, platform, videoUrl:url, embedUrl, host:hostName, createdAt:new Date().toISOString(), messages:[], bans:[] };
        rooms[code]=room; saveJson(ROOMS_FILE, rooms);
        return res.json({ reply: `Р’РєР»СЋС‡РёР» СЂР°РЅРґРѕРјРЅС‹Р№ С„РёР»СЊРј вЂ” "${pick}"!`, action:{ type:'room_created', code, url:`/room.html?code=${code}`, platform } });
      }
    }

    if (!AI_API_KEY) {
      return res.status(503).json({ error: 'РР РЅРµ РЅР°СЃС‚СЂРѕРµРЅ. Р”РѕР±Р°РІСЊС‚Рµ GROQ_API_KEY.' });
    }

    // online LLM вЂ” РЅР°С‚РёРІРЅС‹Р№ Groq tool calling, РїРѕРЅРёРјР°РµС‚ СЃС‚СЂСѓРєС‚СѓСЂСѓ FAQ/Р»РѕР±Р±Рё/РєРѕРјРЅР°С‚Р° С†РµР»РёРєРѕРј
    const messages = [
      { role:'system', content: AI_SYSTEM },
      ...history,
      { role:'user', content: message }
    ];
    const body = {
      model: AI_MODEL,
      messages,
      temperature: 0.1,
      max_tokens: 320
    };
    const r = await fetch(AI_BASE_URL, {
      method:'POST',
      headers:{
        'Authorization': `Bearer ${AI_API_KEY}`,
        'Content-Type':'application/json',
        'HTTP-Referer': process.env.SITE_URL || 'http://localhost:3000',
        'X-Title': 'togetherly'
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000)
    });
    if (!r.ok) {
      const t = await r.text().catch(()=> '');
      console.error('[AI] LLM error', r.status, t.slice(0,500));
      if (r.status === 429 || /rate_limit|rate limit|TPD|tokens per day/i.test(t)) {
        return res.status(503).json({ error: 'Лимит AI временно исчерпан. Попробуй позже или проверь тариф модели.', rateLimited: true });
      }
      // РµСЃР»Рё РјРѕРґРµР»СЊ РЅРµ РЅР°Р№РґРµРЅР° РЅР° Groq вЂ” РїСЂРѕР±СѓРµРј Р°РєС‚СѓР°Р»СЊРЅС‹Рµ Groq РјРѕРґРµР»Рё
      if (t.includes('model_not_found') && process.env.GROQ_API_KEY) {
        const groqFallbacks = ['groq/compound-mini','groq/compound','openai/gpt-oss-20b'];
        for (const fm of groqFallbacks) {
          if (fm === AI_MODEL) continue;
          try {
            const fr2 = await fetch(AI_BASE_URL, {
              method:'POST',
              headers:{'Authorization':`Bearer ${AI_API_KEY}`,'Content-Type':'application/json'},
              body: JSON.stringify({model:fm, messages, temperature:0.1, max_tokens:320}),
              signal: AbortSignal.timeout(15000)
            });
            if (fr2.ok) {
              const fj2 = await fr2.json();
              const frank2 = fj2.choices?.[0]?.message?.content || '';
              if (frank2 && frank2.trim()) {
                const ftool2 = extractToolCall(frank2);
                let freply2 = frank2.replace(/```tool[\s\S]*?```/gi,'').replace(/```json[\s\S]*?```/gi,'').trim();
                if (ftool2) { try{ freply2 = freply2.replace(JSON.stringify(ftool2),'').trim(); }catch{} }
                if (!freply2) freply2 = 'РџСЂРёРІРµС‚! РЇ РїРѕРјРѕС‰РЅРёРє Togetherly. Р—Р°РґР°Р№ РІРѕРїСЂРѕСЃ РїСЂРѕ СЃРµСЂРІРёСЃ.';
                if (ftool2 && ftool2.args) {
                  let {platform, videoUrl, title} = ftool2.args;
                  platform=(platform||'rutube').toLowerCase(); if(!['vk','rutube','youtube'].includes(platform)) platform='rutube';
                  title=(title||'Р‘РµР· РЅР°Р·РІР°РЅРёСЏ'); videoUrl=(videoUrl||'').trim();
                  if (videoUrl.startsWith('SEARCH:')) { const q=videoUrl.slice(7).trim()||title; const fo=await resolveByTitle(q); if(fo){ videoUrl=fo.url; platform=fo.platform; } }
                  if (!isValidVideoUrl(platform, videoUrl)) { const fo2=await resolveByTitle(title); if(fo2){ videoUrl=fo2.url; platform=fo2.platform; } }
                  if (isValidVideoUrl(platform, videoUrl)) {
                    const token2 = req.headers.authorization?.replace('Bearer ','');
                    const user2 = await parseToken(token2);
                    if (user2 && user2.email) {
                      const emb = toEmbedUrl(platform, videoUrl);
                      let code; do{code=genCode();}while(rooms[code]);
                      const hn = user2.username||user2.display_name||user2.displayName||user2.id;
                      const room={code, title:title.slice(0,60), platform, videoUrl, embedUrl:emb, host:hn, createdAt:new Date().toISOString(), messages:[], bans:[]};
                      rooms[code]=room; saveJson(ROOMS_FILE, rooms);
                      return res.json({reply: freply2, action:{type:'room_created', code, url:`/room.html?code=${code}`, platform}});
                    }
                  }
                }
                return res.json({reply: freply2});
              }
            }
          } catch {}
        }
      }
      // С‚РёС…РёР№ С„РѕР»Р±СЌРє Р±РµР· С‚РµС…РЅРёС‡РµСЃРєРѕР№ РїРѕРјРµС‚РєРё вЂ” РїСЂРѕР±СѓРµРј Р·Р°РїР°СЃРЅСѓСЋ РјРѕРґРµР»СЊ (OpenRouter)
      const fallbackModels = ['poolside/laguna-xs-2.1:free','liquid/lfm-2.5-2.6b:free','cohere/north-mini-code:free'].filter(m=>m!==AI_MODEL);
      for(const fm of fallbackModels){
        try{
          const fr = await fetch(AI_BASE_URL, {
            method:'POST',
            headers:{'Authorization':`Bearer ${AI_API_KEY}`,'Content-Type':'application/json','HTTP-Referer':process.env.SITE_URL||'http://localhost:3000','X-Title':'togetherly'},
            body: JSON.stringify({model:fm, messages, temperature:0.1, max_tokens:320}),
            signal: AbortSignal.timeout(15000)
          });
          if(fr.ok){
            const fj = await fr.json();
            const frank = fj.choices?.[0]?.message?.content || fj.choices?.[0]?.text || '';
            if(frank && frank.trim()){
              // РѕР±СЂР°Р±РѕС‚Р°Р№ РєР°Рє РѕР±С‹С‡РЅС‹Р№ РѕС‚РІРµС‚ (РЅРµ СЂРµРєСѓСЂСЃРёСЂСѓР№ РІРµСЃСЊ С„Р»РѕСѓ, РїСЂРѕСЃС‚Рѕ РІРµСЂРЅРё РєРѕРЅС‚РµРЅС‚ Р±РµР· tool)
              const ftool = extractToolCall(frank);
              let freply = frank.replace(/```tool[\s\S]*?```/gi,'').replace(/```json[\s\S]*?```/gi,'').trim();
              if(ftool){ try{ freply = freply.replace(JSON.stringify(ftool),'').trim(); }catch{} freply = freply.replace(/\{[\s\S]*?"tool"[\s\S]*?\n\}/g,'').trim(); }
              if(!freply) freply = 'РќРµ РїРѕРЅСЏР» РІРѕРїСЂРѕСЃ, СѓС‚РѕС‡РЅРё, РїРѕР¶Р°Р»СѓР№СЃС‚Р°.';
              if(ftool && ftool.args){
                let {platform, videoUrl, title} = ftool.args;
                platform = (platform||'rutube').toLowerCase();
                if(!['vk','rutube','youtube'].includes(platform)) platform='rutube';
                title = (title||'Р‘РµР· РЅР°Р·РІР°РЅРёСЏ'); videoUrl=(videoUrl||'').trim();
                if(videoUrl.startsWith('SEARCH:')){
                  const q=videoUrl.slice(7).trim()||title;
                  const fo = await resolveByTitle(q);
                  if(!fo){ return res.json({reply: (freply?freply+'\n\n':'')+`РќРµ РЅР°С€С‘Р» "${q}".`}); }
                  videoUrl=fo.url; platform=fo.platform;
                }
                if(!isValidVideoUrl(platform, videoUrl)){
                  const fo2 = await resolveByTitle(title);
                  if(fo2){ videoUrl=fo2.url; platform=fo2.platform; } else { return res.json({reply: freply}); }
                }
                const token2 = req.headers.authorization?.replace('Bearer ','');
                const user2 = await parseToken(token2);
                if(!user2) return res.json({reply: freply, needAuth:true, foundUrl:videoUrl});
                const emb = toEmbedUrl(platform, videoUrl);
                let code; do{code=genCode();}while(rooms[code]);
                const hn = user2.username||user2.display_name||user2.displayName||('guest:'+user2.id);
                const room={code, title:title.slice(0,60), platform, videoUrl, embedUrl:emb, host:hn, createdAt:new Date().toISOString(), messages:[], bans:[]};
                rooms[code]=room; saveJson(ROOMS_FILE, rooms);
                return res.json({reply: freply, action:{type:'room_created', code, url:`/room.html?code=${code}`, platform}});
              }
              return res.json({reply: freply});
            }
          }
        }catch{}
      }
      return res.json({ reply: 'Р§С‚РѕР±С‹ СЃРјРѕС‚СЂРµС‚СЊ РІРёРґРµРѕ РІРјРµСЃС‚Рµ: РЅР°Р¶РјРё "РЎРѕР·РґР°С‚СЊ РєРѕРјРЅР°С‚Сѓ" РЅР° РіР»Р°РІРЅРѕР№, РІС‹Р±РµСЂРё РїР»РѕС‰Р°РґРєСѓ, РІСЃС‚Р°РІСЊ СЃСЃС‹Р»РєСѓ РЅР° РІРёРґРµРѕ Рё РїРѕРґРµР»РёСЃСЊ РєРѕРґРѕРј СЃ РґСЂСѓР·СЊСЏРјРё. РћРЅРё РІРѕР№РґСѓС‚ РїРѕ РєРѕРґСѓ. РџРѕРґСЂРѕР±РЅРµРµ вЂ” РІ FAQ.' });
    }
    const j = await r.json();
    const msg = j.choices?.[0]?.message || {};
    let tool = null;
    if (msg.tool_calls && msg.tool_calls[0]?.function?.name === 'create_room') {
      try { const args = JSON.parse(msg.tool_calls[0].function.arguments); tool = {tool:'create_room', args}; } catch {}
    }
    if (!tool) tool = extractToolCall(msg.content || '');
    const raw = msg.content || '';
    let reply = raw.replace(/```tool[\s\S]*?```/gi,'').replace(/```json[\s\S]*?```/gi,'').trim();
    if (tool) {
      try { reply = reply.replace(JSON.stringify(tool), '').trim(); } catch {}
      // also remove pretty-printed version
      const toolStr = JSON.stringify(tool, null, 2);
      reply = reply.replace(toolStr, '').trim();
      // remove any remaining raw JSON block containing "tool"
      reply = reply.replace(/\{[\s\S]*?"tool"\s*:\s*"create_room"[\s\S]*?\n\}/g,'').trim();
    }
    if (!reply) reply = 'РќРµ РїРѕРЅСЏР» РІРѕРїСЂРѕСЃ, СѓС‚РѕС‡РЅРё, РїРѕР¶Р°Р»СѓР№СЃС‚Р°.';

    if (tool && tool.args) {
      let { platform, videoUrl, title } = tool.args;
      platform = (platform||'rutube').toLowerCase();
      if (!['vk','rutube','youtube'].includes(platform)) platform = 'rutube';
      title = (title|| message.replace(/РІРєР»СЋС‡Рё|СЃРѕР·РґР°Р№/gi,'').trim().slice(0,60) || 'Р‘РµР· РЅР°Р·РІР°РЅРёСЏ');
      videoUrl = (videoUrl||'').toString().trim();
      // SEARCH placeholder вЂ” С‚РµРїРµСЂСЊ С‡РµСЂРµР· СѓРЅРёРІРµСЂСЃР°Р»СЊРЅС‹Р№ РїРѕРёСЃРє (RuTube Р±РµР· С‚РѕРєРµРЅР°)
      if (videoUrl.startsWith('SEARCH:')) {
        const q = videoUrl.slice(7).trim() || title;
        const foundObj = await resolveByTitle(q);
        if (!foundObj) {
          const vkSearch2 = `https://vk.com/video?q=${encodeURIComponent(q)}`;
          reply = (reply ? reply + '\n\n' : '') + `РќРµ РЅР°С€С‘Р» "${q}". РџРѕРїСЂРѕР±СѓР№ СЃРєРёРЅСѓС‚СЊ РїСЂСЏРјСѓСЋ СЃСЃС‹Р»РєСѓ РЅР° РІРёРґРµРѕ РёР»Рё РїРµСЂРµС„СЂР°Р·РёСЂСѓР№.`;
          return res.json({ reply });
        }
        videoUrl = foundObj.url;
        platform = foundObj.platform;
      }
      if (!isValidVideoUrl(platform, videoUrl)) {
        // try resolve by title as fallback вЂ” С‡РµСЂРµР· RuTube/YouTube Р±РµР· С‚РѕРєРµРЅР°
        const foundObj2 = await resolveByTitle(title);
        if (foundObj2) { videoUrl = foundObj2.url; platform = foundObj2.platform; }
        else {
          reply = (reply ? reply + '\n\n' : '') + `РЎСЃС‹Р»РєР° РЅРµ РїРѕРґРѕС€Р»Р°. РџСЂРёРјРµСЂ: https://vk.com/video-123456_789 РёР»Рё https://rutube.ru/video/xxx`;
          return res.json({ reply });
        }
      }
      const token = req.headers.authorization?.replace('Bearer ','');
      const user = await parseToken(token);
      if (!user) return res.json({ reply: 'Р’РѕР№РґРё РІ Р°РєРєР°СѓРЅС‚ вЂ” СЃРѕР·РґР°Рј РєРѕРјРЅР°С‚Сѓ.', needAuth:true, foundUrl: videoUrl });
      const hostName3 = user.username || user.display_name || user.displayName || ('guest:'+user.id);
      const embedUrl = toEmbedUrl(platform, videoUrl);
      let code; do { code = genCode(); } while (rooms[code]);
      const room = { code, title: title.slice(0,60), platform, videoUrl, embedUrl, host:hostName3, createdAt:new Date().toISOString(), messages:[], bans:[] };
      rooms[code]=room; saveJson(ROOMS_FILE, rooms);
      const successReply = `Р“РѕС‚РѕРІРѕ! РЎРѕР·РґР°Р» РєРѕРјРЅР°С‚Сѓ "${title}".`;
      // РµСЃР»Рё LLM РЅРµ РґР°Р» РѕСЃРјС‹СЃР»РµРЅРЅРѕРіРѕ РѕС‚РІРµС‚Р° (РїСѓСЃС‚Рѕ РёР»Рё РѕС„С„Р»Р°Р№РЅ-Р·Р°РіР»СѓС€РєР°) вЂ” Р·Р°РјРµРЅРё РЅР° СѓСЃРїРµС…
      const isGeneric = !reply || reply === 'РќРµ РїРѕРЅСЏР» РІРѕРїСЂРѕСЃ, СѓС‚РѕС‡РЅРё, РїРѕР¶Р°Р»СѓР№СЃС‚Р°.' || reply.includes('РЎРєРёРЅСЊ СЃСЃС‹Р»РєСѓ');
      const finalReply = isGeneric ? successReply : reply;
      return res.json({ reply: finalReply, action:{ type:'room_created', code, url:`/room.html?code=${code}`, platform } });
    }
    // also handle case where LLM didn't use tool but user wants room and gave direct link (any platform)
    if (wantsRoom) {
      const urlMatch = message.match(/https?:\/\/[^\s]+/i);
      if (urlMatch) {
        let videoUrl = urlMatch[0].replace(/[.,;!?]+$/,'');
        let plat = null;
        for(const p of ['vk','rutube','youtube']) if(isValidVideoUrl(p, videoUrl)){ plat=p; break; }
        if (plat) {
          // СѓР¶Рµ Р°РІС‚РѕСЂРёР·РѕРІР°РЅ (authUser СЃ email), СЃРѕР·РґР°С‘Рј
          let code; do { code = genCode(); } while (rooms[code]);
          const rawTitle2 = message.replace(videoUrl,'').replace(/РІРєР»СЋС‡Рё|СЃРѕР·РґР°Р№|РЅР°Р№РґРё|РїРѕСЃС‚Р°РІСЊ|Р·Р°РїСѓСЃС‚Рё|РІСЂСѓР±Рё|РєРѕРјРЅР°С‚Сѓ|РІРёРґРµРѕ|РЅР°\s+vk/gi,'').trim().slice(0,60);
          const title = rawTitle2 || 'Р‘РµР· РЅР°Р·РІР°РЅРёСЏ';
          const hostName4 = authUser.username || authUser.display_name || authUser.displayName || ('guest:'+authUser.id);
          const embedUrl = toEmbedUrl(plat, videoUrl);
          const room = { code, title, platform:plat, videoUrl, embedUrl, host:hostName4, createdAt:new Date().toISOString(), messages:[], bans:[] };
          rooms[code]=room; saveJson(ROOMS_FILE, rooms);
          return res.json({ reply: `Р“РѕС‚РѕРІРѕ! РЎРѕР·РґР°Р» РєРѕРјРЅР°С‚Сѓ "${title}".`, action:{ type:'room_created', code, url:`/room.html?code=${code}`, platform:plat } });
        }
      }
    }
    res.json({ reply });
  } catch (e) {
    console.error('[AI] handler error', e.message);
    res.status(500).json({ error: 'РћС€РёР±РєР° РР' });
  }
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
  ws.displayName = user.display_name || user.displayName || user.username || 'РіРѕСЃС‚СЊ';
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
    let ava = 'рџЋ';
    if (db.isEnabled()) {
      try {
        const mu = await db.getUserByUsername(m.username);
        if (mu?.avatar) ava = mu.avatar;
      } catch {}
    } else {
      ava = ephemeralUsers.get(m.username)?.avatar || 'рџЋ';
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
        broadcast(code, { type: 'chat', ...chatMsg, avatar: ws.avatar || 'рџЋ' });
      }
      if (msg.type === 'reaction') {
        const mid=(msg.messageId||'').toString().slice(0,64);
        const emoji=(msg.emoji||'вќ¤пёЏ').toString().slice(0,4);
        if(!mid) return;
        broadcast(code, { type: 'reaction', messageId: mid, emoji, from: ws.username }, null);
      }
      if (msg.type === 'typing') {
        broadcast(code, { type: 'typing', username: ws.username, isTyping: !!msg.isTyping }, ws);
      }
      if (msg.type === 'sync') {
        if (ws.username !== rooms[code].host) {
          ws.send(JSON.stringify({ type: 'error', text: 'РўРѕР»СЊРєРѕ С…РѕСЃС‚ РјРѕР¶РµС‚ СѓРїСЂР°РІР»СЏС‚СЊ РїР»РµРµСЂРѕРј' }));
          return;
        }
        broadcast(code, { type: 'sync', action: msg.action, time: msg.time, from: ws.username }, null);
      }
      if (msg.type === 'ban') {
        if (ws.username !== rooms[code].host) {
          ws.send(JSON.stringify({ type: 'error', text: 'РўРѕР»СЊРєРѕ С…РѕСЃС‚ РјРѕР¶РµС‚ Р±Р°РЅРёС‚СЊ' }));
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
          ws.send(JSON.stringify({ type: 'error', text: 'РўРѕР»СЊРєРѕ С…РѕСЃС‚ РјРѕР¶РµС‚ СЂР°Р·Р±Р°РЅРёС‚СЊ' }));
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
  if(password !== ADMIN_PASSWORD) return res.status(401).json({error:'РќРµРІРµСЂРЅС‹Р№ РїР°СЂРѕР»СЊ'});
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
  if(!text || !text.trim()) return res.status(400).json({error:'РўРµРєСЃС‚ РїСѓСЃС‚РѕР№'});
  const msg={ username:'ADMIN', text: text.trim().slice(0,500), ts: Date.now() };
  for(const code of Object.keys(rooms)){
    rooms[code].messages.push(msg);
    if(rooms[code].messages.length>200) rooms[code].messages.shift();
    broadcast(code, { type:'chat', ...msg, avatar:'рџ‘‘' });
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
    broadcast(code, { type:'chat', username:'ADMIN', text:`РљРѕРјРЅР°С‚Р° ${code} Р·Р°РєСЂС‹С‚Р° Р°РґРјРёРЅРѕРј`, ts: Date.now(), avatar:'рџ‘‘' });
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
          c.send(JSON.stringify({ type:'chat', username:'ADMIN', text:`${uname} РєРёРєРЅСѓС‚ Р°РґРјРёРЅРѕРј`, ts: Date.now(), avatar:'рџ‘‘' }));
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
    return res.json({ accounts: users.map(u => ({ id: u.id, username: u.username, avatar: u.avatar || 'рџЋ', bio: u.bio || '', badge: u.badge || null, created: u.created_at })) });
  }
  const accounts = [];
  for (const [id, u] of ephemeralEmailUsers) {
    accounts.push({ id, username: u.username || id, avatar: u.avatar || 'рџЋ', bio: u.bio || '', badge: u.badge || null, created: null });
  }
  res.json({ accounts });
});

app.put('/api/admin/accounts/:id/badge', async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
  let { badge } = req.body || {};
  if (badge === '' || badge === null) badge = null;
  if (badge !== null) {
    badge = String(badge).toLowerCase().trim();
    if (badge === 'developer') badge = 'founder'; // legacy alias
    if (!ALLOWED_BADGES.includes(badge)) return res.status(400).json({ error: 'РќРµРёР·РІРµСЃС‚РЅС‹Р№ Р±РµР№РґР¶. Р”РѕСЃС‚СѓРїРЅС‹Рµ: ' + ALLOWED_BADGES.join(', ') });
  }
  const id = req.params.id;
  if (db.isEnabled()) {
    const user = await db.getUserById(id);
    if (!user) return res.status(404).json({ error: 'РђРєРєР°СѓРЅС‚ РЅРµ РЅР°Р№РґРµРЅ' });
    await db.setUserBadge(id, badge);
    return res.json({ ok: true, badge });
  }
  // ephemeral mode
  for (const [email, u] of ephemeralEmailUsers) {
    if (u.id === id) {
      u.badge = badge;
      return res.json({ ok: true, badge });
    }
  }
  res.status(404).json({ error: 'РђРєРєР°СѓРЅС‚ РЅРµ РЅР°Р№РґРµРЅ' });
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
  res.status(404).json({ error: 'РђРєРєР°СѓРЅС‚ РЅРµ РЅР°Р№РґРµРЅ' });
});

// error handler
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'Р¤Р°Р№Р» СЃР»РёС€РєРѕРј Р±РѕР»СЊС€РѕР№ (РјР°РєСЃ 500KB РїРѕСЃР»Рµ СЃР¶Р°С‚РёСЏ)' });
  if (err) return res.status(400).json({ error: 'РћС€РёР±РєР° Р·Р°РїСЂРѕСЃР°' });
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



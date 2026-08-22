const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const db = require('./db');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

app.use(cors = require('cors')());
app.use(express.json({ limit: '3mb' }));
app.use(express.urlencoded({ extended: true, limit: '3mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// storage (rooms stay file-based, users hybrid DB/file)
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const USERS_FILE = path.join(DATA_DIR, 'users.json');
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

let users = loadJson(USERS_FILE, []); // fallback file cache when DB off
let rooms = loadJson(ROOMS_FILE, {}); // code -> { code, title, platform, videoUrl, embedUrl, host, createdAt, messages: [] }
// migrate old users file
users = users.map(u => ({
  avatar: u.avatar || '😎',
  bio: u.bio || '',
  ...u
}));
saveJson(USERS_FILE, users);

// init DB if DATABASE_URL present (async, non-blocking for file mode)
db.initDb().catch(e=> console.error('DB init error', e));

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  for (let i=0;i<6;i++) c+= chars[Math.floor(Math.random()*chars.length)];
  return c;
}
function toEmbedUrl(platform, url) {
  url = url.trim();
  try {
    // already embed
    if (url.includes('video_ext.php') || url.includes('/play/embed/') || url.includes('/embed/')) return url;

    // auto-detect VK regardless of platform selection
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
    // RuTube auto
    if (url.includes('rutube.ru')) {
      const m = url.match(/rutube\.ru\/video\/([a-f0-9]+)/i);
      if (m) return `https://rutube.ru/play/embed/${m[1]}`;
      // also handle rutube.ru/play/embed already handled
    }
    // YouTube auto
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

// Auth helpers
function makeToken(username) {
  return Buffer.from(username + ':' + Date.now()).toString('base64');
}
async function parseToken(token) {
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    const username = decoded.split(':')[0];
    if (db.isEnabled()) {
      return await db.getUserByUsername(username);
    }
    return users.find(u => u.username === username) || null;
  } catch { return null; }
}
async function findUserByUsername(username){
  if (db.isEnabled()) return await db.getUserByUsername(username);
  return users.find(u => u.username.toLowerCase() === username.toLowerCase()) || null;
}
async function isUsernameTaken(username){
  if (db.isEnabled()) {
    const avail = await db.checkUsernameAvailable(username);
    return !avail;
  }
  return users.some(u => u.username.toLowerCase() === username.toLowerCase());
}

// API
app.get('/api/check-username', async (req, res) => {
  const username = (req.query.username || '').trim();
  if (!username || username.length < 3) return res.json({ available: false, reason: 'too_short' });
  const taken = await isUsernameTaken(username);
  res.json({ available: !taken });
});

app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Заполните все поля' });
  if (username.length < 3) return res.status(400).json({ error: 'Username минимум 3 символа' });
  if (!/^[a-zA-Z0-9_]+$/.test(username)) return res.status(400).json({ error: 'Username только буквы, цифры и _' });
  if (password.length < 8) return res.status(400).json({ error: 'Пароль минимум 8 символов' });
  if (!/\d/.test(password)) return res.status(400).json({ error: 'Пароль должен содержать хотя бы одну цифру' });
  if (await isUsernameTaken(username)) return res.status(400).json({ error: 'Username уже занят' });
  const hash = await bcrypt.hash(password, 8);
  const user = { id: Date.now().toString(), username, passwordHash: hash, avatar: '😎', bio: '' };
  if (db.isEnabled()) {
    await db.createUser(user);
  } else {
    users.push(user);
    saveJson(USERS_FILE, users);
  }
  const token = makeToken(username);
  res.json({ token, username, avatar: user.avatar, bio: user.bio });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await findUserByUsername(username);
  if (!user) return res.status(400).json({ error: 'Пользователь не найден' });
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(400).json({ error: 'Неверный пароль' });
  const token = makeToken(user.username);
  res.json({ token, username: user.username, avatar: user.avatar || '😎', bio: user.bio || '' });
});

app.get('/api/me', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ','');
  const user = await parseToken(token);
  if (!user) return res.status(401).json({ error: 'Не авторизован' });
  res.json({ username: user.username, avatar: user.avatar || '😎', bio: user.bio || '' });
});

app.get('/api/users/:username', async (req, res) => {
  const u = await findUserByUsername(req.params.username);
  if (!u) return res.status(404).json({ error: 'Пользователь не найден' });
  res.json({ username: u.username, avatar: u.avatar || '😎', bio: u.bio || '' });
});

app.put('/api/me', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ','');
  const user = await parseToken(token);
  if (!user) return res.status(401).json({ error: 'Не авторизован' });
  let { username, avatar, bio } = req.body;
  username = (username||'').trim();
  avatar = (avatar||'').trim();
  bio = (bio||'').trim();
  if (username && username.toLowerCase() !== user.username.toLowerCase()) {
    if (username.length < 3) return res.status(400).json({ error: 'Username минимум 3 символа' });
    if (await isUsernameTaken(username)) return res.status(400).json({ error: 'Username уже занят' });
    const oldName = user.username;
    for (const code in rooms) {
      if (rooms[code].host === oldName) rooms[code].host = username;
      rooms[code].messages.forEach(m => { if (m.username === oldName) m.username = username; });
    }
    saveJson(ROOMS_FILE, rooms);
    if (db.isEnabled()) {
      await db.updateUser(oldName, { username });
      // refetch to get updated user
      const updated = await db.getUserByUsername(username);
      Object.assign(user, updated);
    } else {
      user.username = username;
      saveJson(USERS_FILE, users);
    }
  }
  if (avatar) {
    const isDataUrl = avatar.startsWith('data:image/');
    if (isDataUrl) {
      if (avatar.length > 500 * 1024) return res.status(400).json({ error: 'Фото слишком большое (макс 500KB)' });
      if (!/^data:image\/(png|jpeg|jpg|webp|gif);base64,/.test(avatar)) return res.status(400).json({ error: 'Неверный формат фото' });
    } else {
      if ([...avatar].length > 4) return res.status(400).json({ error: 'Аватар слишком длинный' });
    }
    if (db.isEnabled()) await db.updateUser(user.username, { avatar });
    else user.avatar = avatar;
  }
  if (bio !== undefined) {
    if (bio.length > 120) return res.status(400).json({ error: 'Описание максимум 120 символов' });
    if (db.isEnabled()) await db.updateUser(user.username, { bio });
    else user.bio = bio;
  }
  if (!db.isEnabled()) saveJson(USERS_FILE, users);
  // refetch final user if DB
  let finalUser = user;
  if (db.isEnabled()) finalUser = await db.getUserByUsername(user.username) || user;
  const newToken = makeToken(finalUser.username);
  res.json({ username: finalUser.username, avatar: finalUser.avatar, bio: finalUser.bio, token: newToken });
});

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
    messages: []
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
  const user = await parseToken(token);
  if (!code || !rooms[code]) {
    ws.close(1008, 'Room not found');
    return;
  }
  if (!user) {
    ws.close(1008, 'Unauthorized');
    return;
  }
  ws.username = user.username;
  ws.avatar = user.avatar || '😎';
  ws.code = code;

  if (!roomClients.has(code)) roomClients.set(code, new Set());
  roomClients.get(code).add(ws);

  // enrich messages with avatar
  const enriched = await Promise.all(rooms[code].messages.slice(-100).map(async m=>{
    let ava='😎';
    if (db.isEnabled()) {
      const u=await db.getUserByUsername(m.username);
      ava=u?.avatar || '😎';
    } else {
      const u=users.find(x=>x.username===m.username);
      ava=u?.avatar || '😎';
    }
    return {...m, avatar: ava};
  }));
  // send history
  ws.send(JSON.stringify({ type: 'init', room: rooms[code], host: rooms[code].host, messages: enriched }));
  broadcast(code, { type: 'user_join', username: ws.username, avatar: ws.avatar, count: roomClients.get(code).size }, ws);
  const presenceUsers=await Promise.all([...roomClients.get(code)].map(async c=>{
    // c is ws with username/avatar
    return {username:c.username, avatar:c.avatar||'😎'};
  }));
  broadcast(code, { type: 'presence', users: presenceUsers.map(u=>u.username), usersDetailed: presenceUsers, count: roomClients.get(code).size, host: rooms[code].host });

  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.type === 'chat') {
        const text = (msg.text||'').trim();
        if (!text || text.length>500) return;
        const chatMsg = { username: ws.username, text, ts: Date.now() };
        rooms[code].messages.push(chatMsg);
        if (rooms[code].messages.length>200) rooms[code].messages.shift();
        saveJson(ROOMS_FILE, rooms);
        broadcast(code, { type: 'chat', ...chatMsg, avatar: ws.avatar||'😎' });
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
        // only host can control
        if (ws.username !== rooms[code].host) {
          ws.send(JSON.stringify({ type: 'error', text: 'Только хост может управлять плеером' }));
          return;
        }
        broadcast(code, { type: 'sync', action: msg.action, time: msg.time, from: ws.username }, null);
      }
    } catch {}
  });

  ws.on('close', () => {
    const set = roomClients.get(code);
    if (!set) return;
    const wasHost = rooms[code] && rooms[code].host === ws.username;
    set.delete(ws);
    // if room becomes empty -> delete room completely
    if (set.size === 0) {
      roomClients.delete(code);
      if (rooms[code]) {
        delete rooms[code];
        saveJson(ROOMS_FILE, rooms);
        console.log(`Room ${code} deleted (empty)`);
      }
      return;
    }
    // host left -> random transfer crown
    if (wasHost && rooms[code]) {
      const remainingWs=[...set];
      const remaining=remainingWs.map(c=>c.username);
      const newHost = remaining[Math.floor(Math.random() * remaining.length)];
      const oldHost = rooms[code].host;
      rooms[code].host = newHost;
      saveJson(ROOMS_FILE, rooms);
      broadcast(code, { type: 'host_change', oldHost, newHost });
      const presenceUsers2=remainingWs.map(c=>({username:c.username, avatar:c.avatar||'😎'}));
      broadcast(code, { type: 'presence', users: remaining, usersDetailed: presenceUsers2, count: set.size, host: newHost });
      broadcast(code, { type: 'user_leave', username: ws.username, count: set.size });
      return;
    }
    // normal leave
    broadcast(code, { type: 'user_leave', username: ws.username, count: set.size });
    if (rooms[code]) {
      const presenceUsers3=[...set].map(c=>({username:c.username, avatar:c.avatar||'😎'}));
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
  // chat needs to go to sender too
  if (payload.type === 'chat' && exclude && exclude.readyState === WebSocket.OPEN) {
    exclude.send(data);
  }
}

// error handler for JSON
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'Файл слишком большой (макс 500KB после сжатия)' });
  if (err) return res.status(400).json({ error: 'Ошибка запроса' });
  next();
});

// fallback to index
app.get('*', (req,res)=>{
  res.sendFile(path.join(__dirname,'public','index.html'));
});

server.listen(PORT, () => {
  console.log(`RAVE running on http://localhost:${PORT}`);
});

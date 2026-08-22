const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const db = require('./db');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

const smtp = process.env.SMTP_HOST ? nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 465),
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
}) : null;

if (smtp) {
  smtp.verify().then(() => console.log('SMTP: подключен')).catch(e => console.error('SMTP ошибка:', e.message));
}

app.use(require('cors')());
app.use(express.json({ limit: '3mb' }));
app.use(express.urlencoded({ extended: true, limit: '3mb' }));
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

// init DB if DATABASE_URL is set (Render env var)
db.initDb().catch(e => console.error('DB init error:', e.message));

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  for (let i=0;i<6;i++) c+= chars[Math.floor(Math.random()*chars.length)];
  return c;
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

function makeToken(username) {
  return Buffer.from(username + ':' + Date.now() + ':' + Math.random().toString(36).slice(2)).toString('base64');
}
async function parseToken(token) {
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    const username = decoded.split(':')[0];
    if (!username || username.length < 1) return null;
    if (db.isEnabled()) {
      let u = await db.getUserByUsername(username);
      if (!u) {
        u = await db.upsertUser({ username });
      }
      return u;
    }
    let u = ephemeralUsers.get(username);
    if (!u) {
      u = { username, avatar: '😎', bio: '' };
      ephemeralUsers.set(username, u);
    }
    return u;
  } catch { return null; }
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

// API - simplified auth: just username
app.post('/api/auth', async (req, res) => {
  let { username, avatar, bio } = req.body;
  username = (username||'').trim();
  if (!username) return res.status(400).json({ error: 'Введи username' });
  if (username.length < 1) return res.status(400).json({ error: 'Username минимум 1 символ' });
  if (username.length > 20) return res.status(400).json({ error: 'Username максимум 20 символов' });
  avatar = (avatar||'').toString().slice(0, 512*1024);
  bio = (bio||'').toString().slice(0,120);
  const user = { username, avatar: avatar || '😎', bio: bio || '' };
  if (db.isEnabled()) {
    await db.upsertUser(user);
  } else {
    ephemeralUsers.set(username, user);
  }
  const token = makeToken(username);
  res.json({ token, username, avatar: user.avatar, bio: user.bio });
});

// keep old endpoints for compatibility (just username)
app.post('/api/register', async (req, res) => {
  const { username, avatar, bio } = req.body;
  let u = (username||'').trim();
  if (!u) return res.status(400).json({ error: 'Введи username' });
  const user = { username: u, avatar: avatar||'😎', bio: bio||'' };
  if (db.isEnabled()) {
    await db.upsertUser(user);
  } else {
    ephemeralUsers.set(u, user);
  }
  res.json({ token: makeToken(u), username: u, avatar: user.avatar, bio: user.bio });
});
app.post('/api/login', async (req, res) => {
  const { username, avatar, bio } = req.body;
  let u = (username||'').trim();
  if (!u) return res.status(400).json({ error: 'Введи username' });
  const user = { username: u, avatar: avatar||'😎', bio: bio||'' };
  if (db.isEnabled()) {
    await db.upsertUser(user);
  } else {
    ephemeralUsers.set(u, user);
  }
  res.json({ token: makeToken(u), username: u, avatar: user.avatar, bio: user.bio });
});
app.get('/api/me', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ','');
  const user = await parseToken(token);
  if (!user) return res.status(401).json({ error: 'Не авторизован' });
  res.json({ username: user.username, avatar: user.avatar || '😎', bio: user.bio || '' });
});
app.get('/api/users/:username', async (req, res) => {
  if (db.isEnabled()) {
    const u = await db.getUserByUsername(req.params.username);
    if (u) return res.json({ username: u.username, avatar: u.avatar || '😎', bio: u.bio || '' });
  }
  const u = ephemeralUsers.get(req.params.username) || { username: req.params.username, avatar: '😎', bio: '' };
  res.json({ username: u.username, avatar: u.avatar || '😎', bio: u.bio || '' });
});
app.put('/api/me', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ','');
  const user = await parseToken(token);
  if (!user) return res.status(401).json({ error: 'Не авторизован' });
  let { username, avatar, bio } = req.body;
  const oldName = user.username;
  username = (username||'').trim() || oldName;
  avatar = avatar !== undefined ? avatar.toString().slice(0, 512*1024) : user.avatar;
  bio = bio !== undefined ? bio.toString().slice(0,120) : user.bio;
  if (db.isEnabled()) {
    const updated = await db.updateUserProfile(oldName, { username, avatar, bio });
    const newToken = makeToken(username);
    return res.json({ username: updated.username, avatar: updated.avatar, bio: updated.bio, token: newToken });
  }
  if (username !== oldName) {
    ephemeralUsers.delete(oldName);
    for (const code in rooms) {
      if (rooms[code].host === oldName) rooms[code].host = username;
      rooms[code].messages.forEach(m => { if (m.username === oldName) m.username = username; });
    }
    saveJson(ROOMS_FILE, rooms);
  }
  const updated = { username, avatar: avatar || '😎', bio: bio || '' };
  ephemeralUsers.set(username, updated);
  const newToken = makeToken(username);
  res.json({ username: updated.username, avatar: updated.avatar, bio: updated.bio, token: newToken });
});
app.get('/api/check-username', (req, res) => {
  // always available now (no exclusive names)
  res.json({ available: true });
});

// --- Email verification ---
const pendingCodes = new Map(); // fallback when DB is off

function genVerCode() {
  let c = '';
  for (let i = 0; i < 6; i++) c += Math.floor(Math.random() * 10);
  return c;
}

app.post('/api/auth/send-code', async (req, res) => {
  if (!smtp) return res.status(500).json({ error: 'SMTP не настроен' });
  let { username, email } = req.body;
  username = (username || '').trim();
  email = (email || '').trim().toLowerCase();
  if (!username || username.length > 20) return res.status(400).json({ error: 'Неверный username' });
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Неверный email' });

  if (db.isEnabled()) {
    const existing = await db.getUserByEmail(email);
    if (existing && existing.username !== username) {
      return res.status(400).json({ error: 'Эта почта уже привязана к другому аккаунту' });
    }
  }

  const code = genVerCode();
  const expires = Date.now() + 10 * 60 * 1000;
  if (db.isEnabled()) {
    await db.setVerificationCode(username, email, code);
  } else {
    pendingCodes.set(username, { email, code, expires });
  }

  try {
    await smtp.sendMail({
      from: `"togetherly" <${process.env.SMTP_USER}>`,
      to: email,
      subject: 'Код подтверждения — togetherly',
      text: `Твой код: ${code}\nОн действителен 10 минут.`,
      html: `<div style="font-family:sans-serif;text-align:center;padding:40px;">
        <div style="font-size:32px;font-weight:800;letter-spacing:8px;margin:20px 0;">${code}</div>
        <p style="color:#888;font-size:14px;">Код действителен 10 минут</p>
      </div>`,
    });
    res.json({ ok: true, message: 'Код отправлен' });
  } catch (e) {
    console.error('SMTP send error:', e.message);
    res.status(500).json({ error: 'Не удалось отправить письмо' });
  }
});

app.post('/api/auth/verify', async (req, res) => {
  let { username, code } = req.body;
  username = (username || '').trim();
  code = (code || '').trim();
  if (!username || !code) return res.status(400).json({ error: 'Заполни все поля' });

  let ok = false;
  if (db.isEnabled()) {
    ok = await db.verifyCode(username, code);
  } else {
    const stored = pendingCodes.get(username);
    if (stored && stored.code === code && stored.expires > Date.now()) {
      ok = true;
      pendingCodes.delete(username);
    }
  }
  if (!ok) return res.status(400).json({ error: 'Неверный или просроченный код' });

  let user = null;
  if (db.isEnabled()) {
    user = await db.getUserByUsername(username);
    if (!user) user = await db.upsertUser({ username });
  } else {
    user = ephemeralUsers.get(username) || { username, avatar: '😎', bio: '' };
    ephemeralUsers.set(username, user);
  }
  const token = makeToken(username);
  res.json({ token, username: user.username, avatar: user.avatar || '😎', bio: user.bio || '' });
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
  if (!code || !rooms[code]) {
    ws.close(1008, 'Room not found');
    return;
  }
  const user = await parseToken(token);
  if (!user) {
    ws.close(1008, 'Unauthorized');
    return;
  }
  ws.username = user.username;
  ws.avatar = user.avatar || '😎';
  ws.code = code;

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
  ws.send(JSON.stringify({ type: 'init', room: rooms[code], host: rooms[code].host, messages: enriched }));
  broadcast(code, { type: 'user_join', username: ws.username, avatar: ws.avatar, count: roomClients.get(code).size }, ws);
  const presenceUsers=[...roomClients.get(code)].map(c=>({username:c.username, avatar:c.avatar||'😎'}));
  broadcast(code, { type: 'presence', users: presenceUsers.map(u=>u.username), usersDetailed: presenceUsers, count: roomClients.get(code).size, host: rooms[code].host });

  ws.on('message', (data) => {
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
    // ephemeral user cleanup if no more connections with that username
    let stillOnline=false;
    for(const s of roomClients.values()){ for(const c of s){ if(c.username===ws.username) stillOnline=true; } }
    if(!stillOnline) ephemeralUsers.delete(ws.username);
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
      const presenceUsers2=remainingWs.map(c=>({username:c.username, avatar:c.avatar||'😎'}));
      broadcast(code, { type: 'presence', users: remaining, usersDetailed: presenceUsers2, count: set.size, host: newHost });
      broadcast(code, { type: 'user_leave', username: ws.username, count: set.size });
      return;
    }
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
app.post('/api/admin/prank', (req,res)=>{
  if(!isAdmin(req)) return res.status(401).json({error:'Unauthorized'});
  const { username, code } = req.body;
  if(!username) return res.status(400).json({error:'Укажи username'});
  let sent=0;
  for(const [cCode,set] of roomClients.entries()){
    if(code && cCode !== code.toUpperCase()) continue;
    for(const c of set){
      if(c.username===username){
        try{ c.send(JSON.stringify({ type:'prank', id: Date.now().toString(36) })); sent++; }catch{}
      }
    }
  }
  if(sent===0) return res.status(404).json({error:'Юзер не онлайн'});
  res.json({ok:true, sent});
});

// error handler
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'Файл слишком большой (макс 500KB после сжатия)' });
  if (err) return res.status(400).json({ error: 'Ошибка запроса' });
  next();
});

app.get('*', (req,res)=>{
  res.sendFile(path.join(__dirname,'public','index.html'));
});

server.listen(PORT, () => {
  console.log(`togetherly running on http://localhost:${PORT}`);
});

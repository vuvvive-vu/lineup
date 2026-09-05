const params = new URLSearchParams(location.search);
const code = (params.get('code')||'').toUpperCase();
if(!code) location.href='/';
const token = localStorage.getItem('rave_token');
const me = localStorage.getItem('rave_user')||'гость';
if(!token) location.href='/?needAuth=1';

const BADGE_PRESETS_CLIENT_R = {
  founder: { label: 'FOUNDER', theme: 'snow', icon: 'crown', glow: true, snow: true },
  developer: { label: 'FOUNDER', theme: 'snow', icon: 'crown', glow: true, snow: true },
  founders_wife: { label: "FOUNDER'S WIFE", theme: 'sakura', icon: 'heart', glow: true, petals: true }
};
function getBadgeLocalR(){ const b=localStorage.getItem('rave_badge'); if(b) { let v=b.toLowerCase(); if(v==='developer') v='founder'; return v; } if(localStorage.getItem('rave_isCreator')==='1') return 'founder'; return null; }
function setBadgeLocalR(badge){ if(badge){ localStorage.setItem('rave_badge', String(badge).toLowerCase()); localStorage.setItem('rave_isCreator','1'); } else { localStorage.removeItem('rave_badge'); localStorage.setItem('rave_isCreator','0'); } }
function applyBadgeToProfileR(avaWrap, crownIcon, badgeEl, badge, isGuest){
  if(!avaWrap) return;
  const heartIcon = avaWrap.querySelector('.heart-icon');
  const cur=avaWrap.dataset.badge||null;
  if(cur===badge && badge && (avaWrap.querySelectorAll('.snowflake').length>=10 || avaWrap.querySelectorAll('.petal').length>=8)){
    const cfgEarly=BADGE_PRESETS_CLIENT_R[badge];
    if(crownIcon) crownIcon.style.display=(cfgEarly && cfgEarly.icon==='crown'?'block':'none');
    if(heartIcon) heartIcon.style.display=(cfgEarly && cfgEarly.icon==='heart'?'block':'none');
    if(badgeEl) badgeEl.style.display=badge && !isGuest?'inline-block':'none';
    return;
  }
  avaWrap.classList.remove('creator-badge','badge-developer','badge-founders_wife','badge-snow');
  avaWrap.querySelectorAll('.snowflake').forEach(s=>s.remove());
  avaWrap.querySelectorAll('.petal').forEach(s=>s.remove());
  delete avaWrap.dataset.badge;
  if(crownIcon) crownIcon.style.display='none';
  if(heartIcon) heartIcon.style.display='none';
  if(badgeEl){ badgeEl.style.display='none'; badgeEl.textContent='FOUNDER'; }
  if(isGuest || !badge) return;
  const cfg=BADGE_PRESETS_CLIENT_R[badge]; if(!cfg) return;
  avaWrap.dataset.badge=badge;
  if(badge==='developer' || badge==='founder') avaWrap.classList.add('badge-founder','badge-snow');
  else if(badge==='founders_wife') avaWrap.classList.add('badge-founders_wife');
  else { avaWrap.classList.add('badge-'+badge); if(cfg.snow) avaWrap.classList.add('badge-snow'); }
  if(cfg.icon==='crown' && crownIcon) crownIcon.style.display='block';
  if(cfg.icon==='heart' && heartIcon) heartIcon.style.display='block';
  if(badgeEl){ badgeEl.textContent=cfg.label||badge.toUpperCase(); badgeEl.style.display='inline-block'; }
  if(cfg.snow) createSnowflakesRoom(avaWrap);
  if(cfg.petals) createPetalsRoom(avaWrap);
}

function createPetalsRoom(container){
  container.querySelectorAll('.petal').forEach(s=>s.remove());
  for(let i=0;i<10;i++){
    const petal=document.createElement('div');
    petal.classList.add('petal');
    petal.innerHTML='<svg viewBox="0 0 24 14" width="18" height="11" fill="none" xmlns="http://www.w3.org/2000/svg"><ellipse cx="12" cy="7" rx="9" ry="5.5" fill="url(#petalGR'+i+')" transform="rotate(-18 12 7)"/><defs><linearGradient id="petalGR'+i+'" x1="4" y1="2" x2="18" y2="12"><stop stop-color="#FFD0E8"/><stop offset="1" stop-color="#FF8FB9"/></linearGradient></defs></svg>';
    const leftPos=Math.random()*88+6;
    petal.style.left=leftPos+'%';
    const duration=Math.random()*4+10;
    petal.style.animationDuration=duration+'s';
    petal.style.animationDelay=(-Math.random()*14)+'s';
    const drift=(Math.random()*40-12)+'px';
    petal.style.setProperty('--drift', drift);
    petal.style.transform='rotate('+(Math.random()*30-15)+'deg)';
    container.appendChild(petal);
  }
}

const T={
"Выйти":"Exit","Загрузка плеера...":"Loading player...","🔊 Включить звук":"🔊 Unmute",
"Чат":"Chat","Написать сообщение...":"Type a message...","Отправить":"Send",
"Пригласи друзей":"Invite friends","Скопируй код или ссылку — по ней друзья зайдут прямо в эту комнату.":"Copy the code or link — friends will join this room directly.",
"Копировать":"Copy","Участники":"Participants","Забаненные":"Banned","О комнате":"About",
"Профиль":"Profile","Выбери аватар или загрузи фото":"Choose an avatar or upload a photo",
"📷 Загрузить фото":"📷 Upload photo","Ник":"Nickname","твой ник":"your nickname",
"Описание":"About you","пару слов о себе...":"a few words about yourself...",
"Сохранить":"Save","Выйти из аккаунта":"Log out","Закрыть":"Close",
"📋 Копировать":"📋 Copy","🗑 Удалить":"🗑 Delete","удалить сообщение?":"delete message?",
"Удалено":"Deleted","only host can delete":"only the host can delete",
"Загрузка...":"Loading...","Код скопирован!":"Code copied!","Ссылка скопирована!":"Link copied!",
"Управление воспроизведением (только хост)":"Playback control (host only)","Удаление сообщений (только хост)":"Delete messages (host only)",
"О приложении":"About the app","Связь с разработчиком":"Contact developer",
"Выйти из аккаунта":"Log out","Сменить аккаунт":"Switch account",
"Имя":"Name","Имя пользователя":"Username","имя пользователя":"username","О себе":"About","о себе":"about",
"Отмена":"Cancel","Готово":"Done","Изменить фотографию":"Change photo","Изм.":"Edit","в сети":"online",
"например, Валентин":"e.g. Valentin","ваше имя":"your name",
"Это имя уже занято.":"This username is taken.","Имя пользователя должно содержать не меньше 3 символов.":"Username must be at least 3 characters.",
"Можно использовать a-z, 0-9 и -_. Минимальная длина - 3 символа.":"You can use a-z, 0-9 and -_. Minimum length - 3 characters.",
"Имя пользователя 3-20: a-z, 0-9, -_":"Username 3-20: a-z, 0-9, -_",
"Имя пользователя 3-20: a-z, 0-9, -_":"Username 3-20: a-z, 0-9, -_",
"Проверка...":"Checking...",
};
function isEn(){return false;}
function t(s){return s;}
function applyTranslations(){
  if(!isEn()) return;
  document.querySelectorAll('[data-i18n]').forEach(el=>{
    const key=el.getAttribute('data-i18n');
    if(T[key])el.textContent=T[key];
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el=>{
    const key=el.getAttribute('data-i18n-placeholder');
    if(T[key])el.placeholder=T[key];
  });
}
applyTranslations();
function letterForRoom(name){ return (name||'?').trim()[0]?.toUpperCase() || '?'; }
function avatarBgRoom(name){ let h=0; for(let i=0;i<name.length;i++) h=(h*31+name.charCodeAt(i))%360; return `hsl(${h},62%,42%)`; }
const rlBtn=document.getElementById('roomLangToggle');
if(rlBtn){rlBtn.textContent=isEn()?'RU':'EN';rlBtn.onclick=()=>{localStorage.setItem('rave_lang',isEn()?'ru':'en');location.reload();};}

const playerEl=document.getElementById('player');
const placeholder=document.getElementById('placeholder');
const messagesEl=document.getElementById('messages');
const chatInput=document.getElementById('chatInput');
const onlineEl=document.getElementById('online');
const codeBox=document.getElementById('codeBox');
const linkBox=document.getElementById('linkBox');
const participantsList=document.getElementById('participantsList');
const pCount=document.getElementById('pCount');
const hostHint=document.getElementById('hostHint');
const typingEl=document.getElementById('typing');
let currentAvatar=localStorage.getItem('rave_ava')||'😎';
let currentBio=localStorage.getItem('rave_bio')||'';

let room=null, ws=null, host=null;
let roomBans=[];
let iframe=null;
let vkPlayer=null, ytPlayer=null, ytReady=false;
let suppressSync=false; // prevent echo loop
let lastHostMuted=null;
let audioSyncPending=false;

async function loadRoom(){
  const r=await fetch('/api/rooms/'+code);
  if(!r.ok){ alert('Комната не найдена'); location.href='/'; return;}
  room=await r.json();
  host=room.host;
  document.getElementById('roomTitleTop').textContent=room.title;
  const roomCodeTop=document.getElementById('roomCodeTop');
  if(roomCodeTop) roomCodeTop.textContent=room.code;
  codeBox.textContent=room.code;
  linkBox.value=location.origin+'/room.html?code='+room.code;
  document.getElementById('roomInfo').textContent=`Видео: ${room.videoUrl}`;
  document.getElementById('platformBadge').textContent=room.platform.toUpperCase();
  document.getElementById('hostBadge').textContent='хост: '+room.host;

  let src=room.embedUrl;
  const raw=room.videoUrl||src;
  if(!src.includes('video_ext.php') && !src.includes('/play/embed/') && !src.includes('/embed/')){
    if(raw.includes('vk.com')||raw.includes('vkvideo.ru')||raw.includes('vk.ru')){
      const m=raw.match(/video(-?\d+)_(\d+)/);
      if(m){ let h=''; try{h=new URL(raw).searchParams.get('hash')||'';}catch{} src=`https://vk.com/video_ext.php?oid=${m[1]}&id=${m[2]}&hd=2&js_api=1${h?'&hash='+h:''}`; }
    } else if(raw.includes('rutube.ru')){
      const m=raw.match(/rutube\.ru\/video\/([a-f0-9]+)/i);
      if(m) src=`https://rutube.ru/play/embed/${m[1]}`;
    } else if(raw.includes('youtu.be')||raw.includes('youtube.com')){
      let id=null;
      if(raw.includes('youtu.be/')) id=raw.split('youtu.be/')[1].split(/[?&#]/)[0];
      else try{id=new URL(raw).searchParams.get('v');}catch{}
      if(id) src=`https://www.youtube.com/embed/${id}?enablejsapi=1&playsinline=1&origin=${location.origin}`;
    }
  } else {
    if(src.includes('youtube.com/embed') && !src.includes('enablejsapi')) src+=(src.includes('?')?'&':'?')+'enablejsapi=1&origin='+location.origin;
    if(src.includes('video_ext.php') && !src.includes('js_api')) src+=(src.includes('?')?'&':'?')+'js_api=1';
  }

  iframe=document.createElement('iframe');
  iframe.id='videoFrame';
  iframe.src=src;
  iframe.allow="autoplay; encrypted-media; fullscreen; picture-in-picture";
  iframe.allowFullscreen=true;
  iframe.referrerPolicy="no-referrer-when-downgrade";
  playerEl.appendChild(iframe);
  placeholder.style.display='none';
  updateHostUI();
  setupPlayer(src);
}
loadRoom();

// milana floating - smoother & even
let milanaYSeed=0;
function spawnMilana(){
  const layer=document.getElementById('milanaLayer');
  const global=document.getElementById('globalMilana');
  const target = layer || global;
  if(!target) return;
  if(document.hidden) return;
  const el=document.createElement('div');
  el.className='milana';
  el.innerHTML='<img src="/assets/witch.png" alt="">';
  // even vertical distribution
  milanaYSeed = (milanaYSeed + 37) % 60;
  const y = 18 + milanaYSeed + (Math.random()*6 -3);
  // side zones only (not over player center) - keep in dark gutters
  const isLeft = Math.random() < 0.5;
  const x = isLeft ? (5 + Math.random()*9) : (85 + Math.random()*9);
  el.style.left=x+'%';
  el.style.top=y+'%';
  const dur = 13 + Math.random()*2.5;
  el.style.animationDuration=dur+'s';
  // tiny stagger for smoothness, not sharp
  el.style.animationDelay='0.08s';
  el.style.fontSize=(14 + Math.random()*1.5)+'px';
  // subtle opacity variation
  el.style.opacity = (0.11 + Math.random()*0.04).toString();
  target.appendChild(el);
  setTimeout(()=> el.remove(), (dur+0.8)*1000);
}
setInterval(spawnMilana, 2400);
setTimeout(()=>{ spawnMilana(); setTimeout(()=>spawnMilana(), 1200); setTimeout(()=>spawnMilana(), 2400); }, 600);

function updateHostUI(){
  const isHost=me===host;
  if(hostHint){
    if(isHost){
      hostHint.textContent='Ты — хост 👑 Видео синхронно у всех — управляй плеером как обычно';
      hostHint.classList.remove('guest');
    } else {
      hostHint.textContent=`Управляет хост 👑 ${host} — у тебя тот же момент что и у него`;
      hostHint.classList.add('guest');
    }
  }
}
const unmuteBtn=null;
function tryUnmute(){
  let attempted=false;
  try{ if(vkPlayer){ vkPlayer.unmute(); vkPlayer.setVolume(100); attempted=true; } }catch{}
  try{ if(ytPlayer){ ytPlayer.unMute(); ytPlayer.setVolume(100); attempted=true; } }catch{}
  try{ if(iframe) iframe.contentWindow.postMessage({method:'unmute'},'*'); }catch{}
  try{ if(iframe) iframe.contentWindow.postMessage('{"event":"command","func":"unMute","args":""}','*'); }catch{}
  try{ if(iframe) iframe.contentWindow.postMessage({type:'player', action:'unmute'},'*'); }catch{}
  return attempted;
}
if(unmuteBtn){
  // показывать кнопку звука всем (мобильный автоплей без звука)
  setTimeout(()=>{ unmuteBtn.style.display='block'; }, 900);
  unmuteBtn.onclick=()=>{
    audioSyncPending=true;
    tryUnmute();
    if(me===host) sendSync('unmute', 0);
    let attempts=0;
    const retry=setInterval(()=>{
      attempts++;
      const ready=tryUnmute();
      if(ready || attempts>=10){
        clearInterval(retry);
        audioSyncPending=false;
        unmuteBtn.style.display='none';
      }
    },500);
  };
}
let presenceAvatars={};
function getAvatarFor(name, fallback){ return presenceAvatars[name] || fallback || '😎'; }
function isPhotoAva(a){ return a && a.startsWith('data:image/'); }
function avatarHtml(ava, size){
  if(isPhotoAva(ava)) return `<img src="${ava}" alt="">`;
  return escapeHtml(ava);
}
function renderParticipants(users,h){
  host=h||host;
  users = [...new Map(users.map(u=>[typeof u==='string'?u:u.username, u])).values()];
  // if usersDetailed provided, build map
  // users may be array of strings or objects; handled in caller
  updateHostUI();
  participantsList.innerHTML='';
  pCount.textContent=`• ${users.length}`;
  onlineEl.textContent=`${users.length} в комнате`;
  users.forEach(u=>{
    const uname = typeof u==='string'? u : u.username;
    const display = typeof u==='object' ? (u.displayName||u.username) : u;
    const ava = typeof u==='object' ? (u.avatar||getAvatarFor(uname)) : getAvatarFor(uname);
    const isHost=uname===host, isMe=uname===me;
    const d=document.createElement('div');
    d.className='participant'+(isHost?' host':'')+(isMe?' me':'');
    d.style.cursor='pointer';
    d.onclick=()=> openViewProfile(uname);
    const canBan=me===host && !isMe && !isHost;
    const banBtn=canBan?`<button class="ban-btn" style="background:none;border:none;color:#ff3b30;font-size:16px;cursor:pointer;padding:0 4px;flex-shrink:0;" title="Забанить">✕</button>`:'';
    // for participant ava we show avatar letter or photo
    const avaHtml = isPhotoAva(ava) ? `<img src="${ava}" style="width:100%;height:100%;object-fit:cover;display:block;">` : escapeHtml(letterForRoom(display));
    const avaStyle = isPhotoAva(ava) ? 'padding:0;overflow:hidden;' : `background:${avatarBgRoom(display)};color:#fff;`;
    const isGuestUser = !uname || String(uname).startsWith('guest:');
    const handleHtml = isGuestUser ? '' : `<span style="font-size:11px;color:#9a9a9a;">@${escapeHtml(uname)}</span>`;
    d.innerHTML=`<div class="ava" style="${avaStyle}">${avaHtml}</div><div class="name" style="display:flex;flex-direction:column;line-height:1.2;"><span>${escapeHtml(display)}</span>${handleHtml}</div>${banBtn}${isHost?'<span class="crown">👑</span>':''}`;
    if(canBan){
      const btn=d.querySelector('.ban-btn');
      btn.onclick=(e)=>{ e.stopPropagation(); if(confirm('Забанить '+uname+'?')){ ws.send(JSON.stringify({type:'ban',username:uname})); } };
    }
    participantsList.appendChild(d);
  });
}
function renderBans(){
  const el=document.getElementById('bansList');
  const card=document.getElementById('bansCard');
  if(!el||!card) return;
  if(me!==host||roomBans.length===0){ card.style.display='none'; return; }
  card.style.display='';
  el.innerHTML='';
  roomBans.forEach(u=>{
    const d=document.createElement('div');
    d.className='participant';
    d.style.justifyContent='space-between';
    d.innerHTML=`<div style="display:flex;align-items:center;gap:8px;"><div class="ava" style="background:#1a0f0f;color:#ff3b30;border-color:#3a2020;">🚫</div><div class="name" style="color:#ff8a8a;">${escapeHtml(u)}</div></div><button class="icon-btn" style="font-size:11px;padding:4px 10px;background:#0a0a0a;color:#fff;border:1px solid #1e1e1e;">Разбанить</button>`;
    d.querySelector('button').onclick=()=>{ ws.send(JSON.stringify({type:'unban',username:u})); };
    el.appendChild(d);
  });
}
function addMessage({username,text,ts,avatar,image},isMe){
  if(typingUsers[username]){ delete typingUsers[username]; renderTyping(); }
  const ava=avatar||getAvatarFor(username, '😎');
  const mid=`${username}-${ts}`;
  const d=document.createElement('div');
  d.className='msg'+(isMe?' me':'');
  d.dataset.id=mid;
  const t=new Date(ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
  const avaInner=isPhotoAva(ava)?`<img src="${ava}" alt="">`:escapeHtml(ava);
  const avaEl=`<div class="msg-avatar" data-user="${escapeHtml(username)}" title="${escapeHtml(username)}">${avaInner}</div>`;
  const imgHtml=image ? `<img class="msg-image" src="${image}" alt="photo" loading="lazy" />` : '';
  const textHtml=text ? escapeHtml(text) : '';
  d.innerHTML=`${avaEl}<div class="msg-content"><div class="meta">${escapeHtml(username)} · ${t}</div><div class="bubble" data-id="${mid}">${textHtml}${imgHtml}</div><div class="reactions" id="react-${mid}" style="display:none;gap:4px;margin-top:4px;"></div></div>`;
  const avaDom=d.querySelector('.msg-avatar');
  if(avaDom) avaDom.onclick=()=> openViewProfile(username);

  const bubble=d.querySelector('.bubble');
  setupLongPress(bubble, mid, username);
  messagesEl.appendChild(d);
  messagesEl.scrollTop=messagesEl.scrollHeight;
}
const messageReactions={};
function addReactionUI(messageId, emoji, from){
  const cont=document.getElementById(`react-${messageId}`);
  if(!cont) return;
  if(!messageReactions[messageId]) messageReactions[messageId]={};
  const already=messageReactions[messageId][from]===emoji;
  if(already){
    delete messageReactions[messageId][from];
  } else {
    messageReactions[messageId][from]=emoji;
  }
  const entries=Object.entries(messageReactions[messageId]);
  if(entries.length===0){
    cont.style.display='none';
    cont.innerHTML='';
    return;
  }
  const counts={};
  const who={};
  entries.forEach(([user,e])=>{
    counts[e]=(counts[e]||0)+1;
    if(!who[e]) who[e]=[];
    who[e].push(user);
  });
  cont.innerHTML='';
  Object.entries(counts).forEach(([e,c])=>{
    const pill=document.createElement('span');
    pill.className='reaction-pill'+(messageReactions[messageId][me]===e ? ' mine' : '');
    pill.title=who[e].join(', ');
    pill.textContent=c>1?`${e} ${c}`:e;
    pill.onclick=()=>{
      sendReaction(messageId, e);
      addReactionUI(messageId, e, me);
    };
    cont.appendChild(pill);
  });
  cont.style.display='flex';
  if(!already){
    const bubble=document.querySelector(`.bubble[data-id="${messageId}"]`);
    if(bubble){
      const el=document.createElement('span');
      el.textContent=emoji;
      el.style.cssText='position:absolute;right:-6px;top:-6px;font-size:14px;animation: heartPop .6s ease; pointer-events:none;';
      bubble.style.position='relative';
      bubble.appendChild(el);
      setTimeout(()=> el.remove(), 600);
    }
  }
}
function sendReaction(messageId, emoji){
  if(!ws||ws.readyState!==1) return;
  ws.send(JSON.stringify({type:'reaction', messageId, emoji}));
}
function escapeHtml(s){return (s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function sys(t){
  const d=document.createElement('div');
  d.style.cssText='text-align:center;color:#6a6a6a;font-size:11px;margin:6px 0;';
  d.textContent=t;
  messagesEl.appendChild(d);
  messagesEl.scrollTop=messagesEl.scrollHeight;
}
function fmt(s){ if(isNaN(s)||s<0) return '0:00'; s=Math.floor(s); const m=Math.floor(s/60), sec=String(s%60).padStart(2,'0'); const h=Math.floor(m/60); if(h>0) return `${h}:${String(m%60).padStart(2,'0')}:${sec}`; return `${m}:${sec}`; }

// --- player setup ---
function setupPlayer(src){
  if(src.includes('youtube.com')){
    loadYouTube();
  } else if(src.includes('vk.com/video_ext')){
    loadVK();
  } else {
    // rutube / other: no sync api, just notify
  }
}

function loadVK(){
  const s=document.createElement('script');
  s.src='https://vk.com/js/api/videoplayer.js';
  s.onload=initVK;
  s.onerror=()=> console.log('vk api load fail');
  document.head.appendChild(s);
}
function initVK(){
  if(!iframe || !window.VK || !VK.VideoPlayer) return;
  try{
    vkPlayer=VK.VideoPlayer(iframe);
  }catch(e){ console.log('vk init fail',e); return; }
  if(audioSyncPending) applySync('unmute',0);
  let lastBroadcast=0;
  setInterval(()=>{
    if(me!==host || !vkPlayer) return;
    try{
      const volume=vkPlayer.getVolume();
      const muted=volume===0;
      lastHostMuted=muted;
      const state=vkPlayer.getState();
      const playing=state===VK.VideoPlayer.States.PLAYING;
      const now=Date.now();
      if(now-lastBroadcast>900){
        lastBroadcast=now;
        sendSync('state', vkPlayer.getCurrentTime(), playing);
      }
    }catch{}
  },700);
  // host -> broadcast
  vkPlayer.on(VK.VideoPlayer.Events.STARTED, (st)=>{ if(me===host && !suppressSync) sendSync('play', st.time); });
  vkPlayer.on(VK.VideoPlayer.Events.RESUMED, (st)=>{ if(me===host && !suppressSync) sendSync('play', st.time); });
  vkPlayer.on(VK.VideoPlayer.Events.PAUSED, (st)=>{ if(me===host && !suppressSync) sendSync('pause', st.time); });
  vkPlayer.on(VK.VideoPlayer.Events.SEEKED, (st)=>{ if(me===host && !suppressSync) sendSync('seek', st.time); });
  vkPlayer.on(VK.VideoPlayer.Events.ENDED, (st)=>{ if(me===host) sendSync('pause', st.time); });

  // periodic sync for drift (host only) every 3s if playing
  setInterval(()=>{
    if(me!==host || !vkPlayer) return;
    try{
      const t=vkPlayer.getCurrentTime();
      const state=vkPlayer.getState();
      if(state===VK.VideoPlayer.States.PLAYING){
        const now=Date.now();
        if(now-lastBroadcast>3000){
          lastBroadcast=now;
          // gentle time sync without pausing
          if(ws&&ws.readyState===1) ws.send(JSON.stringify({type:'sync', action:'time', time:t}));
        }
      }
    }catch{}
  },3000);
}

function loadYouTube(){
  if(window.YT && window.YT.Player){ initYT(); return; }
  const tag=document.createElement('script');
  tag.src='https://www.youtube.com/iframe_api';
  document.head.appendChild(tag);
  window.onYouTubeIframeAPIReady=initYT;
}
function initYT(){
  if(ytPlayer || !iframe) return;
  ytPlayer=new YT.Player('videoFrame',{
    events:{
      onReady:()=>{
        ytReady=true;
        if(audioSyncPending) applySync('unmute',0);
        // polling for seek detection (host)
        let last=0;
        setInterval(()=>{
          if(me!==host || !ytReady || !ytPlayer) return;
          try{
            const state=ytPlayer.getPlayerState();
            sendSync('state', ytPlayer.getCurrentTime()||0, state===1);
          }catch{}
        },700);
        setInterval(()=>{
          if(me!==host||!ytReady||suppressSync) return;
          try{
            const cur=ytPlayer.getCurrentTime()||0;
            if(Math.abs(cur-last)>2.5){
              sendSync('seek', cur);
            }
            last=cur;
          }catch{}
        },900);
      },
      onStateChange:(e)=>{
        if(me!==host||suppressSync) return;
        try{
          const t=ytPlayer.getCurrentTime()||0;
          if(e.data===1) sendSync('play', t); // playing
          else if(e.data===2) sendSync('pause', t);
          else if(e.data===0) sendSync('pause', t); // ended
        }catch{}
      }
    }
  });
  // periodic time sync for youtube guests
  setInterval(()=>{
    if(me!==host||!ytReady) return;
    try{
      const state=ytPlayer.getPlayerState();
      if(state===1){ // playing
        const t=ytPlayer.getCurrentTime()||0;
        if(ws&&ws.readyState===1) ws.send(JSON.stringify({type:'sync', action:'time', time:t}));
      }
    }catch{}
  },3000);
}

function sendSync(action,time,playing){
  if(me!==host) return;
  if(!ws||ws.readyState!==1) return;
  const t= typeof time==='number'? time : 0;
  ws.send(JSON.stringify({type:'sync', action, time:t, playing:!!playing}));
}

function applySync(action,time,playing){
  const t= typeof time==='number'? time:0;
  // suppress echo for vk/yt events
  suppressSync=true;
  setTimeout(()=> suppressSync=false, 800);

  if(action==='unmute') return;
  // State updates are frequent; do not seek on every packet or playback will stutter.
  if(action==='state'){
    if(iframe && iframe.src.includes('youtube.com') && ytReady && ytPlayer){
      try{
        const current=ytPlayer.getCurrentTime()||0;
        const currentState=ytPlayer.getPlayerState();
        if((currentState===1)!==!!playing){
          if(playing) ytPlayer.playVideo();
          else ytPlayer.pauseVideo();
        }
        if(Math.abs(current-t)>2.2) ytPlayer.seekTo(t,true);
      }catch{}
    } else if(vkPlayer){
      try{
        const current=vkPlayer.getCurrentTime()||0;
        const currentState=vkPlayer.getState();
        if((currentState===VK.VideoPlayer.States.PLAYING)!==!!playing){
          if(playing) vkPlayer.play();
          else vkPlayer.pause();
        }
        if(Math.abs(current-t)>2.2) vkPlayer.seek(t);
      }catch{}
    }
    return;
  }
  if(iframe && iframe.src.includes('youtube.com') && ytReady && ytPlayer){
    try{
      if(action==='play'){
        ytPlayer.seekTo(t,true);
        ytPlayer.playVideo();
      } else if(action==='pause'){
        ytPlayer.seekTo(t,true);
        ytPlayer.pauseVideo();
      } else if(action==='seek'){
        ytPlayer.seekTo(t,true);
      } else if(action==='time'){
        const cur=ytPlayer.getCurrentTime()||0;
        if(Math.abs(cur-t)>1.8) ytPlayer.seekTo(t,true);
      }
    }catch{}
  } else if(vkPlayer){
    try{
      if(action==='play'){
        vkPlayer.seek(t);
        vkPlayer.play();
      } else if(action==='pause'){
        vkPlayer.seek(t);
        vkPlayer.pause();
      } else if(action==='seek'){
        vkPlayer.seek(t);
      } else if(action==='time'){
        const cur=vkPlayer.getCurrentTime()||0;
        if(Math.abs(cur-t)>1.8) vkPlayer.seek(t);
      }
    }catch{}
  } else {
    // rutube fallback: try postMessage best-effort
    try{
      const w=iframe.contentWindow;
      if(action==='play') w.postMessage({method:'play'},'*');
      else if(action==='pause') w.postMessage({method:'pause'},'*');
      else if(action==='seek') w.postMessage({method:'seek', time:t},'*');
    }catch{}
  }
}

// typing indicator state
const typingUsers={};
let typingTimeout=null;
let typingSent=false;
function renderTyping(){
  const users=Object.keys(typingUsers);
  if(users.length===0){ typingEl.style.display='none'; typingEl.innerHTML=''; return; }
  typingEl.style.display='flex';
  if(users.length===1){
    typingEl.innerHTML=`${escapeHtml(users[0])} печатает<span class="dots"><i></i><i></i><i></i></span>`;
  } else if(users.length===2){
    typingEl.innerHTML=`${escapeHtml(users[0])} и ${escapeHtml(users[1])} печатают<span class="dots"><i></i><i></i><i></i></span>`;
  } else {
    typingEl.innerHTML=`${users.length} человека печатают<span class="dots"><i></i><i></i><i></i></span>`;
  }
}
function sendTyping(isTyping){
  if(!ws||ws.readyState!==1) return;
  ws.send(JSON.stringify({type:'typing', isTyping}));
}

// ws
function connect(){
  const proto=location.protocol==='https:'?'wss:':'ws:';
  ws=new WebSocket(`${proto}//${location.host}/ws?code=${code}&token=${encodeURIComponent(token)}`);
  ws.onopen=()=> console.log('ws open');
  ws.onmessage=e=>{
    const data=JSON.parse(e.data);
    if(data.type==='init'){
      host=data.host||data.room?.host||host;
      roomBans=data.bans||[];
      // build avatar map from init
      if(data.messages){
        data.messages.forEach(m=>{ if(m.avatar) presenceAvatars[m.username]=m.avatar; });
      }
      updateHostUI();
      data.messages.forEach(m=> addMessage(m, m.username===me));
      renderBans();
    }
    if(data.type==='chat'){ if(data.avatar) presenceAvatars[data.username]=data.avatar; addMessage(data, data.username===me); }
    if(data.type==='presence'){
      if(data.usersDetailed){
        data.usersDetailed.forEach(u=> presenceAvatars[u.username]=u.avatar);
        renderParticipants(data.usersDetailed, data.host);
      } else {
        renderParticipants(data.users, data.host);
      }
    }
    if(data.type==='host_change'){
      host=data.newHost;
      document.getElementById('hostBadge').textContent='хост: '+data.newHost;
      updateHostUI();
    }
    if(data.type==='user_join'){}
    if(data.type==='user_leave'){
      if(typingUsers[data.username]){ delete typingUsers[data.username]; renderTyping(); }
    }
    if(data.type==='reaction'){
      if(data.from===me) return;
      addReactionUI(data.messageId, data.emoji, data.from);
    }
    if(data.type==='clear_chat'){
      messagesEl.innerHTML='';
    }
    if(data.type==='user_banned'){
      if(!roomBans.includes(data.username)) roomBans.push(data.username);
      renderBans();
    }
    if(data.type==='user_unbanned'){
      roomBans=roomBans.filter(u=>u!==data.username);
      renderBans();
    }
    if(data.type==='typing'){
      if(data.username===me) return; // not visible to author
      if(data.isTyping) typingUsers[data.username]=Date.now();
      else delete typingUsers[data.username];
      renderTyping();
      // auto clear after 4s if no stop signal
      if(data.isTyping) setTimeout(()=>{ if(Date.now()-typingUsers[data.username]>3500){ delete typingUsers[data.username]; renderTyping(); } },4000);
    }
    if(data.type==='delete_message'){
      const el=document.querySelector(`.msg[data-id="${data.messageId}"]`);
      if(el){ el.style.transition='opacity .2s, transform .2s'; el.style.opacity='0'; el.style.transform='scale(0.9)'; setTimeout(()=>el.remove(),200); }
    }
    if(data.type==='sync'){
      if(data.from===me) return;
      if(data.action==='time'){
        applySync('time', data.time);
      } else {
        applySync(data.action, data.time, data.playing);
      }
    }
    if(data.type==='error'){}
  };
  ws.onclose=e=>{
    if(e.code===1008){
      if(e.reason==='You are banned from this room'){ alert('Ты забанен в этой комнате.'); location.href='/'; }
      else{ alert('Ошибка: '+e.reason); location.href='/'; }
    }
    else setTimeout(connect,2000);
  };
}
setTimeout(connect,300);

function sendChat(){
  const text=chatInput.value.trim();
  if(!text) return;
  if(ws&&ws.readyState===1){
    ws.send(JSON.stringify({type:'chat', text}));
    sendTyping(false);
    typingSent=false;
  }
  chatInput.value='';
  clearTimeout(typingTimeout);
}
document.getElementById('sendBtn').onclick=sendChat;
chatInput.addEventListener('keydown',e=>{if(e.key==='Enter') sendChat();});
chatInput.addEventListener('input', ()=>{
  const hasText=chatInput.value.trim().length>0;
  if(hasText && !typingSent){
    sendTyping(true);
    typingSent=true;
  }
  if(!hasText && typingSent){
    sendTyping(false);
    typingSent=false;
  }
  clearTimeout(typingTimeout);
  typingTimeout=setTimeout(()=>{
    if(typingSent){ sendTyping(false); typingSent=false; }
  },1500);
});
chatInput.addEventListener('blur', ()=>{
  if(typingSent){ sendTyping(false); typingSent=false; }
  clearTimeout(typingTimeout);
});

// --- photo upload ---
const photoBtn=document.getElementById('photoBtn');
const photoFile=document.getElementById('photoFile');
let pendingImage=null;

if(photoBtn && photoFile){
  photoBtn.onclick=()=> photoFile.click();
  photoFile.onchange=()=>{
    const file=photoFile.files[0];
    if(!file) return;
    if(!file.type.startsWith('image/')){ return; }
    if(file.size>5*1024*1024){ return; }
    const reader=new FileReader();
    reader.onload=()=>{
      let dataUrl=reader.result;
      const img=new Image();
      img.onload=()=>{
        const canvas=document.createElement('canvas');
        const max=800;
        let w=img.width, h=img.height;
        if(w>h){ if(w>max){ h*=max/w; w=max; } } else { if(h>max){ w*=max/h; h=max; } }
        canvas.width=w; canvas.height=h;
        const ctx=canvas.getContext('2d');
        ctx.drawImage(img,0,0,w,h);
        dataUrl=canvas.toDataURL('image/jpeg',0.75);
        if(dataUrl.length>2*1024*1024){ return; }
        pendingImage=dataUrl;
        chatInput.placeholder='Фото выбрано ✅';
        chatInput.focus();
      };
      img.src=dataUrl;
    };
    reader.readAsDataURL(file);
    photoFile.value='';
  };
}

const origSendChat=sendChat;
sendChat=function(){
  const text=chatInput.value.trim();
  if(!text && !pendingImage) return;
  if(ws&&ws.readyState===1){
    ws.send(JSON.stringify({type:'chat', text:text||'', image:pendingImage||null}));
    sendTyping(false);
    typingSent=false;
  }
  chatInput.value='';
  pendingImage=null;
  chatInput.placeholder='Написать сообщение...';
  clearTimeout(typingTimeout);
};
document.getElementById('sendBtn').onclick=sendChat;

// --- long press + context menu ---
const ctxMenu=document.getElementById('msgContextMenu');
let longPressTimer=null;
let ctxMsgId=null;
let ctxMsgUser=null;
let ctxMsgText='';
let ctxBubbleEl=null;
let ctxJustOpened=false;

function setupLongPress(bubble, messageId, msgUser){
  // Right-click on desktop
  bubble.addEventListener('contextmenu',(e)=>{
    e.preventDefault();
    openCtxMenu(messageId,msgUser,bubble,e.clientX,e.clientY);
  });

  // Long press on touch devices
  let touchStartY=0;
  bubble.addEventListener('touchstart',(e)=>{
    touchStartY=e.touches[0].clientY;
    longPressTimer=setTimeout(()=>{
      openCtxMenu(messageId,msgUser,bubble,e.touches[0].clientX,e.touches[0].clientY);
    },500);
  },{passive:true});
  bubble.addEventListener('touchmove',(e)=>{
    const dy=Math.abs(e.touches[0].clientY-touchStartY);
    if(dy>10) clearTimeout(longPressTimer);
  },{passive:true});
  bubble.addEventListener('touchend',()=>clearTimeout(longPressTimer));
  bubble.addEventListener('touchcancel',()=>clearTimeout(longPressTimer));
}

function openCtxMenu(messageId, msgUser, bubble, x, y){
  ctxMsgId=messageId;
  ctxMsgUser=msgUser;
  ctxBubbleEl=bubble;
  ctxMsgText=bubble.textContent||'';

  const isOwn=msgUser===me;
  const deleteBtn=ctxMenu.querySelector('[data-action="delete"]');
  if(deleteBtn) deleteBtn.style.display=isOwn?'':'none';
  ctxMenu.classList.add('show');
  ctxJustOpened=true;
  setTimeout(()=>ctxJustOpened=false,100);

  const menuRect=ctxMenu.getBoundingClientRect();
  let left=Math.max(8, Math.min(x-menuRect.width/2, window.innerWidth-menuRect.width-8));
  let top=y-menuRect.height-10;
  if(top<8) top=y+10;
  if(top+menuRect.height>window.innerHeight-8) top=window.innerHeight-menuRect.height-8;
  ctxMenu.style.left=left+'px';
  ctxMenu.style.top=top+'px';
}

function closeCtxMenu(){
  ctxMenu.classList.remove('show');
  fullEmojiPicker.classList.remove('show');
  ctxMsgId=null;
  ctxMsgUser=null;
  ctxMsgText='';
  ctxBubbleEl=null;
}

ctxMenu.querySelectorAll('.ctx-react-btn').forEach(btn=>{
  btn.addEventListener('click',(e)=>{
    e.stopPropagation();
    const emoji=btn.dataset.emoji;
    if(!emoji) return;
    if(ctxMsgId){
      sendReaction(ctxMsgId,emoji);
      addReactionUI(ctxMsgId,emoji,me);
    }
    closeCtxMenu();
  });
});

// full emoji picker
const fullEmojiPicker=document.getElementById('emojiPickerFull');
const ALL_EMOJIS=['😀','😃','😄','😁','😆','🥹','😅','🤣','😂','🙂','🥰','😍','🤩','😘','😗','😚','😋','😛','🤔','🤫','🤭','🫡','🤐','😐','🙄','😬','😮‍💨','😌','😔','😪','🤤','😴','😷','🤒','🤕','🥴','😵‍💫','🤯','🤠','🥳','🥸','😎','🤓','🧐','😤','😡','🤬','😈','👿','💀','☠️','💩','🤡','👹','👺','👻','👽','🤖','😺','😸','😻','🙀','😿','🙈','🙉','🙊','❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','👍','👎','👊','✊','🤛','🤜','🤝','🙏','🫶','👏','🙌','👐','💪','🦾','🔥','✨','💫','⭐','🌟','🎉','🎊','💯','💢','💥','💦','💨','🕊️'];
ALL_EMOJIS.forEach(e=>{
  const btn=document.createElement('button');
  btn.className='emoji-item';
  btn.textContent=e;
  const handler=(ev)=>{
    ev.stopPropagation();
    ev.preventDefault();
    if(ctxMsgId){
      sendReaction(ctxMsgId,e);
      addReactionUI(ctxMsgId,e,me);
    }
    closeCtxMenu();
  };
  btn.addEventListener('click',handler);
  btn.addEventListener('touchend',(ev)=>{
    ev.preventDefault();
    handler(ev);
  });
  fullEmojiPicker.appendChild(btn);
});

document.getElementById('ctxMoreEmoji').addEventListener('click',(e)=>{
  e.stopPropagation();
  const menuRect=ctxMenu.getBoundingClientRect();
  fullEmojiPicker.style.left=menuRect.left+'px';
  fullEmojiPicker.style.bottom=(window.innerHeight-menuRect.top+6)+'px';
  fullEmojiPicker.style.top='auto';
  fullEmojiPicker.classList.add('show');
});

ctxMenu.querySelectorAll('.ctx-action-btn').forEach(btn=>{
  btn.addEventListener('click',(e)=>{
    e.stopPropagation();
    const action=btn.dataset.action;
    if(action==='copy'){
      navigator.clipboard.writeText(ctxMsgText).catch(()=>{
        const ta=document.createElement('textarea');
        ta.value=ctxMsgText; document.body.appendChild(ta);
        ta.select(); document.execCommand('copy');
        ta.remove();
      });
    }
    if(action==='delete'){
      if(ctxMsgId && ws&&ws.readyState===1){
        ws.send(JSON.stringify({type:'delete_message',messageId:ctxMsgId}));
      }
    }
    closeCtxMenu();
  });
});

document.addEventListener('mousedown',(e)=>{
  if(!ctxMenu.contains(e.target) && !fullEmojiPicker.contains(e.target) && !ctxJustOpened){
    closeCtxMenu();
  }
});

// welcome done

document.getElementById('copyCode').onclick=async()=>{
  await navigator.clipboard.writeText(codeBox.textContent);
  const b=document.getElementById('copyCode'); const t=b.textContent; b.textContent='✓'; setTimeout(()=>b.textContent=t,1200);
};
document.getElementById('copyLink').onclick=async()=>{
  await navigator.clipboard.writeText(linkBox.value);
  const b=document.getElementById('copyLink'); const t=b.textContent; b.textContent='✓'; setTimeout(()=>b.textContent=t,1200);
};

function isPhotoRoom(ava){ return ava && ava.startsWith('data:image/'); }
function letterForRoom(name){ return (name||'?').trim()[0]?.toUpperCase() || '?'; }
function avatarBgRoom(name){ let h=0; for(let i=0;i<name.length;i++) h=(h*31+name.charCodeAt(i))%360; return `hsl(${h},62%,42%)`; }
function renderAvaBtnRoom(btn, ava, fallback){
  const name=fallback||localStorage.getItem('rave_display')||localStorage.getItem('rave_user')||'Г';
  if(isPhotoRoom(ava)){ btn.innerHTML=`<img src="${ava}" alt="ava">`; btn.classList.add('has-photo'); btn.style.background=''; btn.style.color=''; }
  else { btn.textContent=letterForRoom(name); btn.style.background=avatarBgRoom(name); btn.style.color='#fff'; btn.classList.remove('has-photo'); }
}
function renderAvaLargeRoomEl(el, ava, fallback){
  if(!el) return;
  if(isPhotoRoom(ava)){ el.innerHTML=`<img src="${ava}" alt="ava">`; el.classList.add('has-photo'); el.style.background=''; el.style.color=''; }
  else { const name=fallback||localStorage.getItem('rave_display')||localStorage.getItem('rave_user')||'?'; el.textContent=letterForRoom(name); el.style.background=avatarBgRoom(name); el.style.color='#fff'; el.classList.remove('has-photo'); el.style.backgroundImage='none'; }
}
// --- profile in room ---
let currentDisplayNameRoom=localStorage.getItem('rave_display')||'';
let currentUsernameRoom=localStorage.getItem('rave_user')||'';
(async()=>{
  try{
    const r=await fetch('/api/me', {headers:{Authorization:'Bearer '+token}});
    if(r.ok){ const j=await r.json(); currentAvatar=j.avatar||''; currentBio=j.bio||''; currentDisplayNameRoom=j.displayName||j.username||''; currentUsernameRoom=j.username||''; localStorage.setItem('rave_ava', currentAvatar); localStorage.setItem('rave_bio', currentBio); if(j.displayName) localStorage.setItem('rave_display', j.displayName); if(j.username) localStorage.setItem('rave_user', j.username); if(j.email) localStorage.setItem('rave_email', j.email); setBadgeLocalR(j.badge || (j.isCreator ? 'founder' : null)); }
  }catch{}
  injectProfileBtn();
})();
function injectProfileBtn(){
  const nav=document.querySelector('.nav-right');
  if(!nav || document.getElementById('profileBtnRoom')) return;
  const btn=document.createElement('button');
  btn.className='avatar-btn';
  const ava=currentAvatar;
  const fallback=currentDisplayNameRoom||currentUsernameRoom;
  if(isPhotoRoom(ava)) btn.classList.add('has-photo');
  else btn.style.background=avatarBgRoom(fallback);
  btn.id='profileBtnRoom';
  if(isPhotoRoom(ava)) btn.innerHTML=`<img src="${ava}" alt="ava">`;
  else { btn.textContent=letterForRoom(fallback); btn.style.color='#fff'; }
  btn.title='Профиль';
  btn.onclick=openProfileRoom;
  const exitBtn=nav.querySelector('.btn-ghost');
  nav.insertBefore(btn, exitBtn);
}
const profileModalRoom=document.getElementById('profileModal');
const editModalRoom=document.getElementById('editModal');
const pAvaLargeRoom=document.getElementById('pAvaLarge');
const eAvaLargeRoom=document.getElementById('eAvaLarge');
const pUsernameRoom=document.getElementById('pUsername');
const eUsernameRoom=document.getElementById('eUsername');
const eDisplayNameRoom=document.getElementById('eDisplayName');
const pBioRoom=document.getElementById('pBio');
const pErrorRoom=document.getElementById('pError');
const pSaveRoom=document.getElementById('pSave');
const pLogoutRoom=document.getElementById('pLogout');
const bioCountRoom=document.getElementById('bioCount');
const openEditBtnRoom=document.getElementById('openEditBtn');
const editCancelRoom=document.getElementById('editCancel');
const editDoneRoom=document.getElementById('editDone');
const changePhotoLinkRoom=document.getElementById('changePhotoLink');
let selectedAvaRoom='';
function openProfileRoom(){
  const ava=localStorage.getItem('rave_ava')||currentAvatar||'';
  const bio=localStorage.getItem('rave_bio')||currentBio||'';
  const disp=localStorage.getItem('rave_display')||currentDisplayNameRoom||'';
  const handle=localStorage.getItem('rave_user')||currentUsernameRoom||'';
  selectedAvaRoom=ava;
  const pViewDisp=document.getElementById('pViewDisplayName');
  const pViewUser=document.getElementById('pViewUsername');
  const pViewBioEl=document.getElementById('pViewBio');
  if(pViewDisp) pViewDisp.textContent=disp||'?';
  if(pViewUser) pViewUser.textContent= handle ? '@'+handle : 'гость';
  if(pViewBioEl) pViewBioEl.textContent=bio||'—';
  renderAvaLargeRoomEl(pAvaLargeRoom, ava, disp);
  if(eAvaLargeRoom) renderAvaLargeRoomEl(eAvaLargeRoom, ava, disp);
  pErrorRoom.classList.remove('show'); pErrorRoom.textContent=''; pErrorRoom.style.display='none';
  // immediate sync so button appears instantly
  const localIsGuestRoom = !handle || String(handle).startsWith('guest:');
  if(openEditBtnRoom) openEditBtnRoom.style.display = localIsGuestRoom ? 'none' : '';
  const cardSync=document.getElementById('profileInfoCard');
  if(cardSync) cardSync.style.display = localIsGuestRoom ? 'none' : '';
  // instant badge from localStorage - всё оформление привязано к бейджу + fallback owner
  const localBadgeR = getBadgeLocalR() || (handle.toLowerCase() === 'owner' ? 'founder' : null);
  const crownIconSyncR = document.getElementById('pCrownIcon');
  const creatorBadgeSyncR = document.getElementById('pCreatorBadge');
  const avaWrapSyncR = document.getElementById('pAvaWrap');
  applyBadgeToProfileR(avaWrapSyncR, crownIconSyncR, creatorBadgeSyncR, localBadgeR, localIsGuestRoom);
  // confirm via server (update if changed)
  fetch('/api/me', {headers:{Authorization:'Bearer '+token}}).then(r=>r.json()).then(j=>{
    const guest=j.isGuest;
    if(openEditBtnRoom) openEditBtnRoom.style.display = guest ? 'none' : '';
    const card=document.getElementById('profileInfoCard');
    if(card) card.style.display = guest ? 'none' : '';
    const badge = j.badge || (j.isCreator ? 'founder' : null);
    setBadgeLocalR(badge);
    const crownIcon = document.getElementById('pCrownIcon');
    const creatorBadge = document.getElementById('pCreatorBadge');
    const avaWrap = document.getElementById('pAvaWrap');
    applyBadgeToProfileR(avaWrap, crownIcon, creatorBadge, badge, guest);
  }).catch(()=>{});
  profileModalRoom.classList.add('show');
}

function createSnowflakesRoom(container) {
  // Remove existing snowflakes
  container.querySelectorAll('.snowflake').forEach(s => s.remove());
  
  // Create 12 snowflakes with natural drift - медленное появление сверху до низа
  for(let i = 0; i < 12; i++) {
    const snowflake = document.createElement('div');
    snowflake.classList.add('snowflake');
    snowflake.innerHTML = '❄';
    
    const leftPos = Math.random() * 88 + 6;
    snowflake.style.left = leftPos + '%';
    
    const duration = Math.random() * 4 + 10;
    snowflake.style.animationDuration = duration + 's';
    
    snowflake.style.animationDelay = (-Math.random() * 14) + 's';
    
    snowflake.style.fontSize = (Math.random() * 5 + 10) + 'px';
    
    const drift = (Math.random() * 35 - 10) + 'px';
    snowflake.style.setProperty('--drift', drift);
    
    container.appendChild(snowflake);
  }
}
function closeProfileRoom(){ profileModalRoom.classList.remove('show'); }
function openEditRoom(){
  const ava=localStorage.getItem('rave_ava')||currentAvatar||'';
  const bio=localStorage.getItem('rave_bio')||currentBio||'';
  const disp=localStorage.getItem('rave_display')||currentDisplayNameRoom||'';
  const handle=localStorage.getItem('rave_user')||currentUsernameRoom||'';
  selectedAvaRoom=ava;
  if(eDisplayNameRoom) eDisplayNameRoom.value=disp;
  if(eUsernameRoom) eUsernameRoom.value=handle;
  if(pBioRoom) pBioRoom.value=bio;
  if(bioCountRoom) bioCountRoom.textContent=bio.length;
  const eEmail=document.getElementById('eEmail');
  if(eEmail) eEmail.textContent=localStorage.getItem('rave_email')||'—';
  renderAvaLargeRoomEl(eAvaLargeRoom, ava, disp);
  pErrorRoom.classList.remove('show'); pErrorRoom.style.display='none';
  profileModalRoom.classList.remove('show');
  if(editModalRoom) editModalRoom.classList.add('show');
  setTimeout(()=>{ const st=document.getElementById('eUsernameStatus'); if(eUsernameRoom && st) eUsernameRoom.dispatchEvent(new Event('input')); }, 50);
}
function closeEditRoom(){ if(editModalRoom) editModalRoom.classList.remove('show'); }
if(profileModalRoom){
  profileModalRoom.addEventListener('click', e=>{ if(e.target===profileModalRoom) closeProfileRoom(); });
  profileModalRoom.querySelectorAll('[data-close]').forEach(b=> b.onclick=closeProfileRoom);
  if(openEditBtnRoom) openEditBtnRoom.onclick=openEditRoom;
  if(editCancelRoom) editCancelRoom.onclick=()=>{ closeEditRoom(); openProfileRoom(); };
  if(editDoneRoom) editDoneRoom.onclick=()=> document.getElementById('pSave')?.click();
  if(changePhotoLinkRoom) changePhotoLinkRoom.onclick=()=> document.getElementById('avatarFile').click();
  if(editModalRoom) editModalRoom.addEventListener('click', e=>{ if(e.target===editModalRoom) closeEditRoom(); });
  const avatarFileRoom=document.getElementById('avatarFile');
  if(avatarFileRoom) avatarFileRoom.onchange=()=>{
    const file=avatarFileRoom.files[0];
    if(!file) return;
    if(file.size>2*1024*1024){ pErrorRoom.textContent='Фото до 2MB'; pErrorRoom.style.display=''; pErrorRoom.classList.add('show'); return; }
    if(!file.type.startsWith('image/')){ pErrorRoom.textContent='Только изображения'; pErrorRoom.style.display=''; pErrorRoom.classList.add('show'); return; }
    const reader=new FileReader();
    reader.onload=()=>{
      let dataUrl=reader.result;
      const apply=(d)=>{
        selectedAvaRoom=d;
        const dn=eDisplayNameRoom?.value||localStorage.getItem('rave_display')||'?';
        renderAvaLargeRoomEl(pAvaLargeRoom, d, dn);
        renderAvaLargeRoomEl(eAvaLargeRoom, d, dn);
        pErrorRoom.style.display='none'; pErrorRoom.classList.remove('show');
      };
      if(dataUrl.length>400*1024){
        const img=new Image();
        img.onload=()=>{
          const canvas=document.createElement('canvas');
          const max=256;
          let w=img.width, h=img.height;
          if(w>h){ if(w>max){ h*=max/w; w=max; } } else { if(h>max){ w*=max/h; h=max; } }
          canvas.width=w; canvas.height=h;
          const ctx=canvas.getContext('2d');
          ctx.drawImage(img,0,0,w,h);
          dataUrl=canvas.toDataURL('image/jpeg',0.75);
          if(dataUrl.length>500*1024){ pErrorRoom.textContent='Фото слишком большое после сжатия'; pErrorRoom.style.display=''; pErrorRoom.classList.add('show'); return; }
          apply(dataUrl);
        };
        img.src=dataUrl;
      } else {
        apply(dataUrl);
      }
    };
    reader.readAsDataURL(file);
    avatarFileRoom.value='';
  };
  if(pBioRoom) pBioRoom.addEventListener('input', ()=> { if(bioCountRoom) bioCountRoom.textContent=pBioRoom.value.length; });
  pLogoutRoom.onclick=()=>{ localStorage.removeItem('rave_token'); localStorage.removeItem('rave_user'); localStorage.removeItem('rave_display'); localStorage.removeItem('rave_email'); localStorage.removeItem('rave_isCreator'); location.href='/'; };
  pSaveRoom.onclick=async()=>{
    pErrorRoom.style.display='none'; pErrorRoom.classList.remove('show');
    const newDisplay=(document.getElementById('eDisplayName')?.value||'').trim();
    const newHandle=(document.getElementById('eUsername')?.value||'').trim().toLowerCase();
    const newBio=pBioRoom.value.trim();
    if(!newDisplay) { pErrorRoom.textContent='Имя не может быть пустым'; pErrorRoom.style.display=''; pErrorRoom.classList.add('show'); return; }
    if(newDisplay.length>20){ pErrorRoom.textContent='Максимум 20 символов'; pErrorRoom.style.display=''; pErrorRoom.classList.add('show'); return; }
    if(!newHandle){ pErrorRoom.textContent='Введите имя пользователя'; pErrorRoom.style.display=''; pErrorRoom.classList.add('show'); return; }
    if(!/^[a-z0-9_-]{3,20}$/.test(newHandle)){ pErrorRoom.textContent='Имя пользователя 3-20: a-z, 0-9, -_'; pErrorRoom.style.display=''; pErrorRoom.classList.add('show'); return; }
    pSaveRoom.disabled=true; pSaveRoom.textContent='Сохранение...';
    try{
      const r=await fetch('/api/me', { method:'PUT', headers:{'Content-Type':'application/json', Authorization:'Bearer '+token}, body: JSON.stringify({displayName:newDisplay, username:newHandle, avatar:selectedAvaRoom, bio:newBio}) });
      const j=await r.json();
      if(!r.ok) throw new Error(j.error||'Ошибка');
      localStorage.setItem('rave_token', j.token);
      localStorage.setItem('rave_display', j.displayName);
      localStorage.setItem('rave_user', j.username);
      localStorage.setItem('rave_ava', j.avatar);
      localStorage.setItem('rave_bio', j.bio);
      setBadgeLocalR(j.badge || (j.isCreator ? 'founder' : null));
      currentAvatar=j.avatar; currentDisplayNameRoom=j.displayName; currentUsernameRoom=j.username;
      const btn=document.getElementById('profileBtnRoom');
      if(btn) renderAvaBtnRoom(btn, j.avatar, j.displayName);
      if(editModalRoom) editModalRoom.classList.remove('show');
      closeProfileRoom();
      location.reload();
    }catch(e){ pErrorRoom.textContent=e.message; pErrorRoom.style.display=''; pErrorRoom.classList.add('show'); }
    finally{ pSaveRoom.disabled=false; pSaveRoom.textContent='Сохранить'; pSaveRoom.textContent=t('Сохранить'); }
  };
  // handle check in room edit
  const eUserStatusRoom=document.getElementById('eUsernameStatus');
  const eUserInputRoom=document.getElementById('eUsername');
  if(eUserInputRoom && eUserStatusRoom){
    let tmr;
    const runRoomCheck=()=>{
      clearTimeout(tmr);
      const v=eUserInputRoom.value.trim().toLowerCase();
      if(!v){ eUserStatusRoom.textContent=t('Можно использовать a-z, 0-9 и -_. Минимальная длина - 3 символа.'); eUserStatusRoom.style.color='#9a9a9a'; return; }
      if(v.length<3){ eUserStatusRoom.textContent=t('Имя пользователя должно содержать не меньше 3 символов.'); eUserStatusRoom.style.color='#ff3b30'; return; }
      if(!/^[a-z0-9_-]{3,20}$/.test(v)){ eUserStatusRoom.textContent=t('Имя не поддерживается.  Можно использовать a-z, 0-9 и -_. Минимальная длина - 3 символа.'); eUserStatusRoom.style.color='#ff3b30'; return; }
      eUserStatusRoom.textContent=t('Проверка...'); eUserStatusRoom.style.color='#9a9a9a';
      tmr=setTimeout(async()=>{
        try{
          const r=await fetch('/api/check-username?username='+encodeURIComponent(v), {headers:{Authorization:'Bearer '+token}});
          const j=await r.json();
          if(j.available){ eUserStatusRoom.textContent=t('Имя пользователя доступно.'); eUserStatusRoom.style.color='#4ade80'; }
          else { if(j.reason==='invalid'){ eUserStatusRoom.textContent=t('Имя не поддерживается.  Можно использовать a-z, 0-9 и -_. Минимальная длина - 3 символа.'); eUserStatusRoom.style.color='#ff3b30'; } else { eUserStatusRoom.textContent=t('Это имя уже занято.'); eUserStatusRoom.style.color='#ff3b30'; } }
        }catch{ eUserStatusRoom.textContent=''; }
      },380);
    };
    eUserInputRoom.addEventListener('input', runRoomCheck);
  }
}
// view other profile (read-only, same card as own)
const viewProfileModal=document.getElementById('viewProfileModal');
const vAvaLarge=document.getElementById('vAvaLarge');
const vUsername=document.getElementById('vUsername');
const vHandle=document.getElementById('vHandle');
const vBio=document.getElementById('vBio');
function openViewProfile(username){
  // username here is handle; fetch user data
  fetch(`/api/users/${encodeURIComponent(username)}`).then(r=>r.json()).then(u=>{
    const ava=u.avatar||presenceAvatars[username]||'';
    const disp=u.displayName||u.username||username;
    const handle=u.username||null;
    const bio=u.bio||'';
    const isGuest = !handle || String(handle).startsWith('guest:');
    const badge = u.badge || (u.isCreator ? 'founder' : null);
    
    if(ava && ava.startsWith('data:image/')){ vAvaLarge.innerHTML=`<img src="${ava}" alt="">`; vAvaLarge.classList.add('has-photo'); vAvaLarge.style.background=''; vAvaLarge.style.color=''; }
    else { vAvaLarge.textContent=letterForRoom(disp); vAvaLarge.style.background=avatarBgRoom(disp); vAvaLarge.style.color='#fff'; vAvaLarge.classList.remove('has-photo'); vAvaLarge.style.backgroundImage='none'; }
    vUsername.textContent=disp;
    const card=document.getElementById('viewProfileCard');
    if(card) card.style.display = isGuest ? 'none' : '';
    if(!isGuest){
      if(vHandle) vHandle.textContent='@'+handle;
      vBio.textContent=bio||'—';
      vBio.style.color=bio?'#e5e5e5':'#9a9a9a';
    }
    
    // Show badge - всё оформление привязано к бейджу
    const vCrownIcon = document.getElementById('vCrownIcon');
    const vCreatorBadge = document.getElementById('vCreatorBadge');
    const vAvaWrap = document.getElementById('vAvaWrap');
    applyBadgeToProfileR(vAvaWrap, vCrownIcon, vCreatorBadge, badge, isGuest);
    
    viewProfileModal.classList.add('show');
  }).catch(()=>{
    const ava=presenceAvatars[username]||'';
    const disp=username;
    const isGuest = String(username).startsWith('guest:');
    if(ava && ava.startsWith('data:image/')){ vAvaLarge.innerHTML=`<img src="${ava}" alt="">`; vAvaLarge.classList.add('has-photo'); }
    else { vAvaLarge.textContent=letterForRoom(disp); vAvaLarge.style.background=avatarBgRoom(disp); vAvaLarge.style.color='#fff'; vAvaLarge.classList.remove('has-photo'); }
    vUsername.textContent=disp;
    const card=document.getElementById('viewProfileCard');
    if(card) card.style.display = isGuest ? 'none' : '';
    if(!isGuest && document.getElementById('vHandle')) document.getElementById('vHandle').textContent='@'+username;
    if(!isGuest) vBio.textContent='—';
    
    // Hide creator badge on error
    const vCrownIcon = document.getElementById('vCrownIcon');
    const vCreatorBadge = document.getElementById('vCreatorBadge');
    const vAvaWrap = document.getElementById('vAvaWrap');
    if(vCrownIcon) vCrownIcon.style.display = 'none';
    if(vCreatorBadge) vCreatorBadge.style.display = 'none';
    if(vAvaWrap) {
      vAvaWrap.classList.remove('creator-badge');
      vAvaWrap.querySelectorAll('.snowflake').forEach(s=>s.remove());
    }
    
    viewProfileModal.classList.add('show');
  });
}
if(viewProfileModal){
  viewProfileModal.addEventListener('click', e=>{ if(e.target===viewProfileModal) viewProfileModal.classList.remove('show'); });
  viewProfileModal.querySelectorAll('[data-close]').forEach(b=> b.onclick=()=> viewProfileModal.classList.remove('show'));
}

let lastScrollY=0;
let ticking=false;
window.addEventListener('scroll',()=>{
  if(!ticking){
    requestAnimationFrame(()=>{
      const topbar=document.querySelector('.topbar');
      if(!topbar){ ticking=false; return; }
      const y=window.scrollY;
      if(y>60){
        if(y>lastScrollY) topbar.classList.add('hidden');
        else topbar.classList.remove('hidden');
      } else {
        topbar.classList.remove('hidden');
      }
      lastScrollY=y;
      ticking=false;
    });
    ticking=true;
  }
});

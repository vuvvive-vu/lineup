const params = new URLSearchParams(location.search);
const code = (params.get('code')||'').toUpperCase();
if(!code) location.href='/';
const token = localStorage.getItem('rave_token');
const me = localStorage.getItem('rave_user')||'гость';
if(!token) location.href='/?needAuth=1';

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
const guestOverlay=document.getElementById('guestOverlay');
const typingEl=document.getElementById('typing');
let currentAvatar=localStorage.getItem('rave_ava')||'😎';
let currentBio=localStorage.getItem('rave_bio')||'';

let room=null, ws=null, host=null;
let iframe=null;
let vkPlayer=null, ytPlayer=null, ytReady=false;
let suppressSync=false; // prevent echo loop

async function loadRoom(){
  const r=await fetch('/api/rooms/'+code);
  if(!r.ok){ alert('Комната не найдена'); location.href='/'; return;}
  room=await r.json();
  host=room.host;
  document.getElementById('roomTitleTop').textContent=room.title;
  document.getElementById('roomCodeTop').textContent=room.code;
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

function updateHostUI(){
  const isHost=me===host;
  guestOverlay.style.display=isHost?'none':'block';
  guestOverlay.title=isHost?'':'Только хост управляет плеером';
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
const unmuteBtn=document.getElementById('unmuteBtn');
if(unmuteBtn){
  // показывать кнопку звука всем (мобильный автоплей без звука)
  setTimeout(()=>{ unmuteBtn.style.display='block'; }, 900);
  unmuteBtn.onclick=()=>{
    try{ if(vkPlayer){ vkPlayer.unmute(); vkPlayer.setVolume(1); } }catch{}
    try{ if(ytPlayer){ ytPlayer.unMute(); try{ytPlayer.setVolume(100);}catch{} } }catch{}
    try{ iframe.contentWindow.postMessage({method:'unmute'},'*'); }catch{}
    try{ iframe.contentWindow.postMessage('{"event":"command","func":"unMute","args":""}','*'); }catch{}
    try{ iframe.contentWindow.postMessage({type:'player', action:'unmute'},'*'); }catch{}
    unmuteBtn.style.display='none';
    sys('🔊 Звук включён');
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
  // if usersDetailed provided, build map
  // users may be array of strings or objects; handled in caller
  updateHostUI();
  participantsList.innerHTML='';
  pCount.textContent=`• ${users.length}`;
  onlineEl.textContent=`${users.length} в комнате`;
  users.forEach(u=>{
    const uname = typeof u==='string'? u : u.username;
    const ava = typeof u==='object' ? (u.avatar||getAvatarFor(uname)) : getAvatarFor(uname);
    const isHost=uname===host, isMe=uname===me;
    const d=document.createElement('div');
    d.className='participant'+(isHost?' host':'')+(isMe?' me':'');
    d.style.cursor='pointer';
    d.onclick=()=> openViewProfile(uname);
    const avaInner=isPhotoAva(ava)?`<img src="${ava}" alt="">`: escapeHtml(ava[0]||ava);
    // for participant ava we show avatar
    d.innerHTML=`<div class="ava" style="${isPhotoAva(ava)?'padding:0;overflow:hidden;':''}">${isPhotoAva(ava)?`<img src="${ava}" style="width:100%;height:100%;object-fit:cover;display:block;">`:escapeHtml(ava)}</div><div class="name">${escapeHtml(uname)}</div>${isHost?'<span class="crown">👑</span>':''}`;
    participantsList.appendChild(d);
  });
}
function addMessage({username,text,ts,avatar},isMe){
  if(typingUsers[username]){ delete typingUsers[username]; renderTyping(); }
  const ava=avatar||getAvatarFor(username, '😎');
  const mid=`${username}-${ts}`;
  const d=document.createElement('div');
  d.className='msg'+(isMe?' me':'');
  d.dataset.id=mid;
  const t=new Date(ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
  const avaInner=isPhotoAva(ava)?`<img src="${ava}" alt="">`:escapeHtml(ava);
  const avaEl=`<div class="msg-avatar" data-user="${escapeHtml(username)}" title="${escapeHtml(username)}">${avaInner}</div>`;
  d.innerHTML=`${avaEl}<div class="msg-content"><div class="meta">${escapeHtml(username)} · ${t}</div><div class="bubble" data-id="${mid}">${escapeHtml(text)}</div><div class="reactions" id="react-${mid}" style="display:none;gap:4px;margin-top:4px;"></div></div>`;
  const avaDom=d.querySelector('.msg-avatar');
  if(avaDom) avaDom.onclick=()=> openViewProfile(username);
  // double click / double tap -> heart
  const bubble=d.querySelector('.bubble');
  let lastTap=0;
  function handleHeart(){
    sendReaction(mid, '❤️');
    addReactionUI(mid, '❤️', me);
  }
  bubble.addEventListener('dblclick', handleHeart);
  bubble.addEventListener('touchend', (e)=>{
    const now=Date.now();
    if(now-lastTap<400){ e.preventDefault(); handleHeart(); }
    lastTap=now;
  });
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
  // group by emoji
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
    pill.className='reaction-pill'+(Object.values(messageReactions[messageId]).includes(e) && messageReactions[messageId][me]===e ? ' mine' : '');
    pill.title=who[e].join(', ');
    pill.textContent=c>1?`${e} ${c}`:e;
    pill.onclick=()=>{
      // toggle own reaction by clicking pill
      if(messageReactions[messageId][me]===e){
        sendReaction(messageId, e);
        addReactionUI(messageId, e, me);
      }
    };
    cont.appendChild(pill);
  });
  cont.style.display='flex';
  if(!already){
    const bubble=document.querySelector(`.bubble[data-id="${messageId}"]`);
    if(bubble){
      const heart=document.createElement('span');
      heart.textContent='❤️';
      heart.style.cssText='position:absolute;right:-6px;top:-6px;font-size:14px;animation: heartPop .6s ease; pointer-events:none;';
      bubble.style.position='relative';
      bubble.appendChild(heart);
      setTimeout(()=> heart.remove(), 600);
    }
  }
}
function sendReaction(messageId, emoji){
  if(!ws||ws.readyState!==1) return;
  ws.send(JSON.stringify({type:'reaction', messageId, emoji}));
}
function escapeHtml(s){return s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
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
  let lastBroadcast=0;
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
        // polling for seek detection (host)
        let last=0;
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

function sendSync(action,time){
  if(me!==host) return;
  if(!ws||ws.readyState!==1) return;
  const t= typeof time==='number'? time : 0;
  ws.send(JSON.stringify({type:'sync', action, time:t}));
}

function applySync(action,time){
  const t= typeof time==='number'? time:0;
  // suppress echo for vk/yt events
  suppressSync=true;
  setTimeout(()=> suppressSync=false, 800);

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
  // tiny hint
  if(action!=='time'){
    const labels={play:`▶ Хост запустил ${fmt(t)}`, pause:`⏸ Пауза ${fmt(t)}`, seek:`⏩ ${fmt(t)}`};
    sys(labels[action]||`${action} ${fmt(t)}`);
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
      // build avatar map from init
      if(data.messages){
        data.messages.forEach(m=>{ if(m.avatar) presenceAvatars[m.username]=m.avatar; });
      }
      updateHostUI();
      data.messages.forEach(m=> addMessage(m, m.username===me));
      if(data.messages.length===0) sys('Чат пуст. Напиши первым!');
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
      sys(`👑 Корона перешла от ${data.oldHost} к ${data.newHost}`);
    }
    if(data.type==='user_join') sys(`${data.username} вошёл`);
    if(data.type==='user_leave'){
      sys(`${data.username} вышел`);
      if(typingUsers[data.username]){ delete typingUsers[data.username]; renderTyping(); }
    }
    if(data.type==='reaction'){
      if(data.from===me) return;
      addReactionUI(data.messageId, data.emoji, data.from);
    }
    if(data.type==='typing'){
      if(data.username===me) return; // not visible to author
      if(data.isTyping) typingUsers[data.username]=Date.now();
      else delete typingUsers[data.username];
      renderTyping();
      // auto clear after 4s if no stop signal
      if(data.isTyping) setTimeout(()=>{ if(Date.now()-typingUsers[data.username]>3500){ delete typingUsers[data.username]; renderTyping(); } },4000);
    }
    if(data.type==='sync'){
      if(data.from===me) return;
      if(data.action==='time'){
        applySync('time', data.time);
      } else {
        applySync(data.action, data.time);
      }
    }
    if(data.type==='error') sys(data.text);
  };
  ws.onclose=e=>{
    if(e.code===1008){ alert('Ошибка: '+e.reason); location.href='/'; }
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
guestOverlay.addEventListener('click',()=> sys('Только хост управляет. У тебя всегда тот же момент что и у него — он перемотал, у тебя тоже.'));

document.getElementById('copyCode').onclick=async()=>{
  await navigator.clipboard.writeText(codeBox.textContent);
  const b=document.getElementById('copyCode'); const t=b.textContent; b.textContent='Скопировано!'; setTimeout(()=>b.textContent=t,1500);
};
document.getElementById('copyLink').onclick=async()=>{
  await navigator.clipboard.writeText(linkBox.value);
  const b=document.getElementById('copyLink'); const t=b.textContent; b.textContent='Скопировано!'; setTimeout(()=>b.textContent=t,1500);
};

function isPhotoRoom(ava){ return ava && ava.startsWith('data:image/'); }
function renderAvaBtnRoom(btn, ava){
  if(isPhotoRoom(ava)){ btn.innerHTML=`<img src="${ava}" alt="ava">`; btn.classList.add('has-photo'); }
  else { btn.textContent=ava; btn.classList.remove('has-photo'); }
}
function renderAvaLargeRoomEl(el, ava){
  if(isPhotoRoom(ava)){ el.innerHTML=`<img src="${ava}" alt="ava">`; el.classList.add('has-photo'); }
  else { el.textContent=ava; el.classList.remove('has-photo'); el.innerHTML=ava; if(el.textContent!==ava) el.textContent=ava; }
}
// --- profile in room ---
(async()=>{
  try{
    const r=await fetch('/api/me', {headers:{Authorization:'Bearer '+token}});
    if(r.ok){ const j=await r.json(); currentAvatar=j.avatar||'😎'; currentBio=j.bio||''; localStorage.setItem('rave_ava', currentAvatar); localStorage.setItem('rave_bio', currentBio); localStorage.setItem('rave_user', j.username); }
  }catch{}
  injectProfileBtn();
})();
function injectProfileBtn(){
  const nav=document.querySelector('.nav-right');
  if(!nav || document.getElementById('profileBtnRoom')) return;
  const btn=document.createElement('button');
  btn.className='avatar-btn';
  if(isPhotoRoom(currentAvatar)) btn.classList.add('has-photo');
  btn.id='profileBtnRoom';
  if(isPhotoRoom(currentAvatar)) btn.innerHTML=`<img src="${currentAvatar}" alt="ava">`;
  else btn.textContent=currentAvatar;
  btn.title='Профиль';
  btn.onclick=openProfileRoom;
  const exitBtn=nav.querySelector('.btn-ghost');
  nav.insertBefore(btn, exitBtn);
}
const profileModalRoom=document.getElementById('profileModal');
const pAvaLargeRoom=document.getElementById('pAvaLarge');
const pUsernameRoom=document.getElementById('pUsername');
const pBioRoom=document.getElementById('pBio');
const pErrorRoom=document.getElementById('pError');
const pSaveRoom=document.getElementById('pSave');
const pLogoutRoom=document.getElementById('pLogout');
const bioCountRoom=document.getElementById('bioCount');
let selectedAvaRoom='';
function openProfileRoom(){
  const ava=localStorage.getItem('rave_ava')||currentAvatar||'😎';
  const bio=localStorage.getItem('rave_bio')||currentBio||'';
  const uname=localStorage.getItem('rave_user')||'';
  selectedAvaRoom=ava;
  renderAvaLargeRoomEl(pAvaLargeRoom, ava);
  pUsernameRoom.value=uname;
  pBioRoom.value=bio;
  bioCountRoom.textContent=bio.length;
  pErrorRoom.classList.remove('show');
  document.querySelectorAll('#avaGrid button').forEach(b=> b.classList.toggle('active', !isPhotoRoom(ava) && b.dataset.ava===ava));
  profileModalRoom.classList.add('show');
}
function closeProfileRoom(){ profileModalRoom.classList.remove('show'); }
if(profileModalRoom){
  profileModalRoom.addEventListener('click', e=>{ if(e.target===profileModalRoom) closeProfileRoom(); });
  profileModalRoom.querySelectorAll('[data-close]').forEach(b=> b.onclick=closeProfileRoom);
  document.querySelectorAll('#avaGrid button').forEach(b=>{
    b.onclick=()=>{
      selectedAvaRoom=b.dataset.ava;
      renderAvaLargeRoomEl(pAvaLargeRoom, selectedAvaRoom);
      document.querySelectorAll('#avaGrid button').forEach(x=> x.classList.remove('active'));
      b.classList.add('active');
    };
  });
  // photo upload in room
  const avatarFileRoom=document.getElementById('avatarFile');
  const uploadAvaBtnRoom=document.getElementById('uploadAvaBtn');
  if(uploadAvaBtnRoom) uploadAvaBtnRoom.onclick=()=> avatarFileRoom.click();
  if(avatarFileRoom) avatarFileRoom.onchange=()=>{
    const file=avatarFileRoom.files[0];
    if(!file) return;
    if(file.size>2*1024*1024){ pErrorRoom.textContent='Фото до 2MB'; pErrorRoom.classList.add('show'); return; }
    if(!file.type.startsWith('image/')){ pErrorRoom.textContent='Только изображения'; pErrorRoom.classList.add('show'); return; }
    const reader=new FileReader();
    reader.onload=()=>{
      let dataUrl=reader.result;
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
          if(dataUrl.length>500*1024){ pErrorRoom.textContent='Фото слишком большое после сжатия'; pErrorRoom.classList.add('show'); return; }
          selectedAvaRoom=dataUrl;
          renderAvaLargeRoomEl(pAvaLargeRoom, selectedAvaRoom);
          document.querySelectorAll('#avaGrid button').forEach(x=> x.classList.remove('active'));
        };
        img.src=dataUrl;
      } else {
        selectedAvaRoom=dataUrl;
        renderAvaLargeRoomEl(pAvaLargeRoom, selectedAvaRoom);
        document.querySelectorAll('#avaGrid button').forEach(x=> x.classList.remove('active'));
      }
      pErrorRoom.classList.remove('show');
    };
    reader.readAsDataURL(file);
    avatarFileRoom.value='';
  };
  pBioRoom.addEventListener('input', ()=> bioCountRoom.textContent=pBioRoom.value.length);
  pLogoutRoom.onclick=()=>{ localStorage.removeItem('rave_token'); localStorage.removeItem('rave_user'); location.href='/'; };
  pSaveRoom.onclick=async()=>{
    pErrorRoom.classList.remove('show');
    const newName=pUsernameRoom.value.trim();
    const newBio=pBioRoom.value.trim();
    if(!newName) { pErrorRoom.textContent='Username не может быть пустым'; pErrorRoom.classList.add('show'); return; }
    pSaveRoom.disabled=true; pSaveRoom.textContent='Сохранение...';
    try{
      const r=await fetch('/api/me', { method:'PUT', headers:{'Content-Type':'application/json', Authorization:'Bearer '+token}, body: JSON.stringify({username:newName, avatar:selectedAvaRoom, bio:newBio}) });
      const j=await r.json();
      if(!r.ok) throw new Error(j.error||'Ошибка');
      localStorage.setItem('rave_token', j.token);
      localStorage.setItem('rave_user', j.username);
      localStorage.setItem('rave_ava', j.avatar);
      localStorage.setItem('rave_bio', j.bio);
      currentAvatar=j.avatar;
      const btn=document.getElementById('profileBtnRoom');
      if(btn) renderAvaBtnRoom(btn, j.avatar);
      closeProfileRoom();
      location.reload();
    }catch(e){ pErrorRoom.textContent=e.message; pErrorRoom.classList.add('show'); }
    finally{ pSaveRoom.disabled=false; pSaveRoom.textContent='Сохранить'; }
  };
}
// view profile (read-only)
const viewProfileModal=document.getElementById('viewProfileModal');
const vAvaLarge=document.getElementById('vAvaLarge');
const vUsername=document.getElementById('vUsername');
const vBio=document.getElementById('vBio');
function openViewProfile(username){
  // if own profile -> still view only (edit via top bar)
  fetch(`/api/users/${encodeURIComponent(username)}`).then(r=>r.json()).then(u=>{
    const ava=u.avatar||presenceAvatars[username]||'😎';
    if(ava && ava.startsWith('data:image/')){ vAvaLarge.innerHTML=`<img src="${ava}" alt="">`; vAvaLarge.classList.add('has-photo'); }
    else { vAvaLarge.textContent=ava; vAvaLarge.classList.remove('has-photo'); }
    vUsername.textContent=u.username;
    vBio.textContent=u.bio||'— нет описания —';
    vBio.style.color=u.bio?'#8a8a8a':'#555';
    viewProfileModal.classList.add('show');
  }).catch(()=>{
    // fallback to local map
    const ava=presenceAvatars[username]||'😎';
    if(ava && ava.startsWith('data:image/')){ vAvaLarge.innerHTML=`<img src="${ava}" alt="">`; vAvaLarge.classList.add('has-photo'); }
    else { vAvaLarge.textContent=ava; vAvaLarge.classList.remove('has-photo'); }
    vUsername.textContent=username;
    vBio.textContent='— нет описания —';
    viewProfileModal.classList.add('show');
  });
}
if(viewProfileModal){
  viewProfileModal.addEventListener('click', e=>{ if(e.target===viewProfileModal) viewProfileModal.classList.remove('show'); });
  viewProfileModal.querySelectorAll('[data-close]').forEach(b=> b.onclick=()=> viewProfileModal.classList.remove('show'));
}

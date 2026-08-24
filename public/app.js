const $ = s => document.querySelector(s);
const authScreen = $('#authScreen');
const lobby = $('#lobby');
const navRight = $('#navRight');
const authError = $('#authError');
const usernameEl = $('#username');
const authBtn = $('#authBtn');

function showError(el, msg){
  el.textContent = msg;
  el.classList.add('show');
}
function hideError(el){ el.classList.remove('show'); }

function token(){ return localStorage.getItem('rave_token'); }
function setToken(t, u, ava, bio){ localStorage.setItem('rave_token', t); localStorage.setItem('rave_user', u); if(ava) localStorage.setItem('rave_ava', ava); if(bio!==undefined) localStorage.setItem('rave_bio', bio); }
async function logout(){
  const t = token();
  if(t){
    try{ await fetch('/api/logout', { method:'POST', headers:{ Authorization:'Bearer '+t } }); }catch{}
  }
  localStorage.removeItem('rave_token');
  localStorage.removeItem('rave_user');
  localStorage.removeItem('rave_ava');
  localStorage.removeItem('rave_bio');
  location.reload();
}

let currentAvatar='😎', currentBio='', currentUsername='';
function isEn(){ return localStorage.getItem('rave_lang')==='en'; }
function setLang(en){ localStorage.setItem('rave_lang', en?'en':'ru'); document.documentElement.lang=en?'en':'ru'; }
const T={ru:{'Создать комнату':'Создать комнату','Создай комнату...':'Создай комнату...','Войти по коду':'Войти по коду','Войти в комнату':'Войти в комнату','Выйти':'Выйти','Username':'Username','Например, anomalyco':'например, anomalyco','Немного про нас':'Немного про нас','Связь с разработчиком':'Связь с разработчиком','Смотрите фильмы и сериалы вместе с togetherly.':'Смотрите фильмы и сериалы вместе с togetherly.','Создай комнату, выбери фильм с VK / RuTube / YouTube и скинь ссылку/код друзьям.':'Создай комнату, выбери фильм с VK / RuTube / YouTube и скинь ссылку/код друзьям.'},en:{'Создать комнату':'Create room','Создай комнату...':'Create a room...','Войти по коду':'Join by code','Войти в комнату':'Join room','Выйти':'Logout','Username':'Username','Например, anomalyco':'e.g. anomalyco','Немного про нас':'About us','Связь с разработчиком':'Contact developer','Смотрите фильмы и сериалы вместе with togetherly.':'Watch movies and series together with togetherly.','Создай комнату, выбери фильм с VK / RuTube / YouTube и скинь ссылку/код друзьям.':'Create a room, pick a video from VK / RuTube / YouTube and share the link/code with friends.'}};
function t(s){ return (isEn()?T.en:T.ru)[s]||s; }
function toggleLang(){ setLang(!isEn()); location.reload(); }
function translatePage(){
  if(!isEn()) return;
  const h1=document.querySelector('.hero h1'); if(h1) h1.textContent='Watch movies and series together with togetherly.';
  const hp=document.querySelector('.hero p'); if(hp) hp.textContent='Create a room, pick a video from VK / RuTube / YouTube and share the link/code with friends.';
  const h3s=document.querySelectorAll('.card h3');
  if(h3s[0]) h3s[0].textContent='Create room';
  if(h3s[1]) h3s[1].textContent='Join by code';
  const ps=document.querySelectorAll('.card p');
  if(ps[0]) ps[0].textContent='Choose a platform — VK, RuTube or YouTube — paste a video link and share the room link/code with a friend.';
  if(ps[1]) ps[1].textContent='Got a link or code from a friend? Paste it and jump straight into the room.';
  const btns=document.querySelectorAll('.card .btn-primary');
  if(btns[0]) btns[0].textContent='Create room';
  if(btns[1]) btns[1].textContent='Join room';
  const aboutH2=document.querySelector('.about-section h2'); if(aboutH2) aboutH2.textContent='About us';
  const aboutP=document.querySelector('.about-section p'); if(aboutP) aboutP.textContent='Togetherly is a convenient platform for watching any media content from available platforms in a player. The service grows every day, adding new features for your comfort!';
  const contactH3=document.querySelector('.about-section h3'); if(contactH3) contactH3.textContent='Contact developer';
  const privacyLink=document.querySelector('a[href="/privacy"]'); if(privacyLink) privacyLink.textContent='Privacy Policy';
  const faqLink=document.querySelector('a[href="/faq"]'); if(faqLink) faqLink.textContent='FAQ';
  document.querySelectorAll('#authScreen .auth-card h1').forEach(h=>h.textContent='Login');
  document.querySelectorAll('#authScreen .auth-card p').forEach(p=>p.textContent='Enter a username and watch any movies and series without ads or other nonsense!');
  if(authBtn) authBtn.textContent='Login';
  document.querySelectorAll('.modal-head h3').forEach(h=>{
    if(h.textContent==='Войти в комнату') h.textContent='Join room';
    if(h.textContent==='Создать комнату') h.textContent='Create room';
    if(h.textContent==='Профиль') h.textContent='Profile';
  });
}
async function checkAuth(){
  const t = token();
  if(!t){ showAuth(); return; }
  try{
    const r = await fetch('/api/me', { headers:{ Authorization:'Bearer '+t }});
    if(!r.ok) throw new Error();
    const j = await r.json();
    currentAvatar=j.avatar||localStorage.getItem('rave_ava')||'😎'; currentBio=j.bio||''; currentUsername=j.username;
    localStorage.setItem('rave_ava', currentAvatar); localStorage.setItem('rave_bio', currentBio);
    showLobby(j.username, currentAvatar);
  }catch{ showAuth(); }
}
function showAuth(){
  authScreen.style.display='grid';
  lobby.classList.remove('show');
  navRight.innerHTML=`<button class="btn-ghost lang-btn" id="langToggle" style="font-size:12px;padding:6px 12px;font-weight:700;">EN</button>`;
  $('#langToggle').onclick=toggleLang;
}
function isPhoto(ava){ return ava && ava.startsWith('data:image/'); }
function renderAvaBtn(btn, ava){
  if(isPhoto(ava)){ btn.innerHTML=`<img src="${ava}" alt="ava">`; btn.classList.add('has-photo'); }
  else { btn.textContent=ava; btn.classList.remove('has-photo'); }
}
function renderAvaLargeEl(el, ava){
  if(isPhoto(ava)){ el.innerHTML=`<img src="${ava}" alt="ava">`; el.classList.add('has-photo'); }
  else { el.textContent=ava; el.classList.remove('has-photo'); el.innerHTML=ava; }
}
function showLobby(username, avatar){
  avatar=avatar||localStorage.getItem('rave_ava')||'😎';
  authScreen.style.display='none';
  lobby.classList.add('show');
  const avaHtml = isPhoto(avatar) ? `<img src="${avatar}" alt="ava">` : avatar;
  const avaCls = isPhoto(avatar) ? ' has-photo' : '';
  navRight.innerHTML = `<button class="btn-ghost lang-btn" id="langToggle" style="font-size:12px;padding:6px 12px;font-weight:700;">${isEn()?'RU':'EN'}</button><button class="avatar-btn${avaCls}" id="profileBtn" title="Профиль">${avaHtml}</button><button class="btn-ghost" id="logoutBtn">${isEn()?'Logout':'Выйти'}</button>`;
  $('#logoutBtn').onclick = logout;
  $('#profileBtn').onclick = openProfile;
  $('#langToggle').onclick = toggleLang;
}
function escapeHtml(s){ return (s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
checkAuth();
translatePage();

authBtn.onclick = async ()=>{
  hideError(authError);
  const username = usernameEl.value.trim();
  if(!username) return showError(authError,'Введи username');
  if(username.length>20) return showError(authError,'Максимум 20 символов');
  authBtn.disabled = true;
  try{
    const ava=localStorage.getItem('rave_ava')||'😎';
    const bio=localStorage.getItem('rave_bio')||'';
    const r = await fetch('/api/auth', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({username, avatar: ava, bio})});
    const j = await r.json();
    if(!r.ok) throw new Error(j.error||'Ошибка');
    setToken(j.token, j.username, j.avatar, j.bio);
    currentAvatar=j.avatar||'😎'; currentBio=j.bio||''; currentUsername=j.username;
    showLobby(j.username, currentAvatar);
  }catch(e){ showError(authError, e.message); }
  finally{ authBtn.disabled=false; }
};
usernameEl.addEventListener('keydown', e=>{ if(e.key==='Enter') authBtn.click(); });

// modals
const joinModal = $('#joinModal');
const createModal = $('#createModal');
$('#openJoin').onclick = ()=> joinModal.classList.add('show');
$('#openCreate').onclick = ()=> createModal.classList.add('show');
document.querySelectorAll('[data-close]').forEach(b=> b.onclick = ()=> $('#'+b.dataset.close).classList.remove('show'));
[ joinModal, createModal ].forEach(m=> m.addEventListener('click', e=>{ if(e.target===m) m.classList.remove('show'); }));

// platform switch
let platform = 'vk';
const platBtns = document.querySelectorAll('.plat');
const linkLabel = $('#linkLabel');
const videoUrl = $('#videoUrl');
const hint = $('#platformHint');
const hints = {
  vk: 'Вставь обычную ссылку на VK видео, например https://vk.com/video-123456_789 или https://vkvideo.ru/video-123456_789 — мы покажем только плеер без ленты.',
  rutube: 'RuTube: скопируй ссылку на видео, например https://rutube.ru/video/xxxx — мы превратим её в плеер.',
  youtube: 'YouTube: поддерживается youtu.be, youtube.com/watch?v=, и прямые embed ссылки.'
};
const labels = { vk:'Ссылка на видео VK', rutube:'Ссылка на RuTube', youtube:'Ссылка на YouTube' };
const placeholders = { vk:'https://vk.com/video-123_456', rutube:'https://rutube.ru/video/xxx', youtube:'https://www.youtube.com/watch?v=dQw4w9WgXcQ' };
function isValidVideoUrlClient(plat, url){
  url=url.trim();
  if(plat==='vk') return /^(https?:\/\/)?(m\.)?(vk\.com|vk\.ru|vkvideo\.ru)\/video-?\d+_\d+/.test(url) || /video_ext\.php\?.*oid=-?\d+.*id=\d+/.test(url);
  if(plat==='rutube') return /^(https?:\/\/)?(www\.)?rutube\.ru\/(video|play\/embed)\/[a-f0-9]+/i.test(url);
  if(plat==='youtube') return /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|embed\/)|youtu\.be\/)[\w-]+/.test(url);
  return false;
}
const videoUrlStatus=$('#videoUrlStatus');
function validateVideoUrl(){
  const url=videoUrl.value.trim();
  if(!url){ videoUrlStatus.textContent=''; videoUrlStatus.style.color=''; videoUrl.classList.remove('input-ok','input-err'); return false; }
  if(isValidVideoUrlClient(platform, url)){
    videoUrlStatus.textContent='✓ Ссылка корректна';
    videoUrlStatus.style.color='#34c759';
    videoUrl.classList.add('input-ok'); videoUrl.classList.remove('input-err');
    return true;
  } else {
    const ex={vk:'Пример: https://vk.com/video-123456_789', rutube:'Пример: https://rutube.ru/video/...', youtube:'Пример: https://youtu.be/...'};
    videoUrlStatus.textContent=`Неверный формат для ${platform.toUpperCase()}. ${ex[platform]}`;
    videoUrlStatus.style.color='#ff3b30';
    videoUrl.classList.add('input-err'); videoUrl.classList.remove('input-ok');
    return false;
  }
}
videoUrl.addEventListener('input', validateVideoUrl);
platBtns.forEach(b=> b.onclick = ()=>{
  platBtns.forEach(x=> x.classList.remove('active'));
  b.classList.add('active');
  platform = b.dataset.plat;
  linkLabel.textContent = labels[platform];
  videoUrl.placeholder = placeholders[platform];
  hint.textContent = hints[platform];
  validateVideoUrl();
});

// create room
$('#createBtn').onclick = async ()=>{
  const err = $('#createError');
  hideError(err);
  const url = videoUrl.value.trim();
  const title = $('#roomTitle').value.trim();
  if(!url) return showError(err,'Вставь ссылку на видео');
  if(!isValidVideoUrlClient(platform, url)){
    validateVideoUrl();
    const ex={ vk:'https://vk.com/video-123456_789', rutube:'https://rutube.ru/video/...', youtube:'https://youtu.be/...'};
    return showError(err, `Неверная ссылка для ${platform.toUpperCase()}. Вставь правильную: ${ex[platform]}`);
  }
  $('#createBtn').disabled=true;
  try{
    const r = await fetch('/api/rooms', {
      method:'POST',
      headers:{ 'Content-Type':'application/json', Authorization:'Bearer '+token() },
      body:JSON.stringify({ platform, videoUrl:url, title })
    });
    const j = await r.json();
    if(!r.ok) throw new Error(j.error);
    location.href = '/room.html?code='+j.code;
  }catch(e){ showError(err, e.message); }
  finally{ $('#createBtn').disabled=false; }
};

// join
function extractCode(input){
  input = input.trim();
  try{
    const u = new URL(input);
    const c = u.searchParams.get('code');
    if(c) return c.toUpperCase();
  }catch{}
  const m = input.toUpperCase().match(/[A-Z0-9]{6}/);
  return m ? m[0] : input.toUpperCase();
}
$('#joinBtn').onclick = async ()=>{
  const err = $('#joinError');
  hideError(err);
  const raw = $('#joinInput').value.trim();
  if(!raw) return showError(err,'Вставь код');
  const code = extractCode(raw);
  const r = await fetch('/api/rooms/'+code);
  if(!r.ok){ const j=await r.json(); return showError(err, j.error||'Комната не найдена'); }
  location.href = '/room.html?code='+code;
};
$('#joinInput').addEventListener('keydown', e=>{ if(e.key==='Enter') $('#joinBtn').click(); });

// --- profile ---
const profileModal=$('#profileModal');
const pAvaLarge=$('#pAvaLarge');
const pUsername=$('#pUsername');
const pBio=$('#pBio');
const pError=$('#pError');
const pSave=$('#pSave');
const pLogout=$('#pLogout');
const bioCount=$('#bioCount');
const avatarFile=$('#avatarFile');
const uploadAvaBtn=$('#uploadAvaBtn');
let selectedAva='';

function openProfile(){
  const ava=localStorage.getItem('rave_ava')||currentAvatar||'😎';
  const bio=localStorage.getItem('rave_bio')||currentBio||'';
  const uname=localStorage.getItem('rave_user')||currentUsername||'';
  selectedAva=ava;
  renderAvaLargeEl(pAvaLarge, ava);
  pUsername.value=uname;
  pBio.value=bio;
  bioCount.textContent=bio.length;
  hideError(pError);
  document.querySelectorAll('#avaGrid button').forEach(b=>{
    b.classList.toggle('active', !isPhoto(ava) && b.dataset.ava===ava);
  });
  profileModal.classList.add('show');
}
function closeProfile(){ profileModal.classList.remove('show'); }
profileModal.addEventListener('click', e=>{ if(e.target===profileModal) closeProfile(); });

document.querySelectorAll('#avaGrid button').forEach(b=>{
  b.onclick=()=>{
    selectedAva=b.dataset.ava;
    renderAvaLargeEl(pAvaLarge, selectedAva);
    document.querySelectorAll('#avaGrid button').forEach(x=> x.classList.remove('active'));
    b.classList.add('active');
  };
});
pBio.addEventListener('input', ()=> bioCount.textContent=pBio.value.length);
pLogout.onclick=logout;

// photo upload
uploadAvaBtn.onclick=()=> avatarFile.click();
avatarFile.onchange=()=>{
  const file=avatarFile.files[0];
  if(!file) return;
  if(file.size>2*1024*1024){ showError(pError,'Фото до 2MB'); return; }
  if(!file.type.startsWith('image/')){ showError(pError,'Только изображения'); return; }
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
        if(dataUrl.length>500*1024){ showError(pError,'Фото слишком большое после сжатия'); return; }
        selectedAva=dataUrl;
        renderAvaLargeEl(pAvaLarge, selectedAva);
        document.querySelectorAll('#avaGrid button').forEach(x=> x.classList.remove('active'));
      };
      img.src=dataUrl;
    } else {
      selectedAva=dataUrl;
      renderAvaLargeEl(pAvaLarge, selectedAva);
      document.querySelectorAll('#avaGrid button').forEach(x=> x.classList.remove('active'));
    }
    hideError(pError);
  };
  reader.readAsDataURL(file);
  avatarFile.value='';
};

pSave.onclick=async()=>{
  hideError(pError);
  const newName=pUsername.value.trim();
  const newBio=pBio.value.trim();
  if(!newName) return showError(pError,'Username не может быть пустым');
  if(newName.length>20) return showError(pError,'Максимум 20 символов');
  pSave.disabled=true; pSave.textContent='Сохранение...';
  try{
    const r=await fetch('/api/me', {
      method:'PUT',
      headers:{ 'Content-Type':'application/json', Authorization:'Bearer '+token() },
      body: JSON.stringify({ username:newName, avatar:selectedAva, bio:newBio })
    });
    const j=await r.json();
    if(!r.ok) throw new Error(j.error||'Ошибка');
    localStorage.setItem('rave_token', j.token);
    localStorage.setItem('rave_user', j.username);
    localStorage.setItem('rave_ava', j.avatar);
    localStorage.setItem('rave_bio', j.bio);
    currentAvatar=j.avatar; currentBio=j.bio; currentUsername=j.username;
    const avaBtn=document.getElementById('profileBtn');
    if(avaBtn) renderAvaBtn(avaBtn, j.avatar);
    const bEl=document.querySelector('.nav-right b');
    if(bEl) bEl.textContent=j.username;
    closeProfile();
  }catch(e){ showError(pError, e.message); }
  finally{ pSave.disabled=false; pSave.textContent='Сохранить'; }
};

// milana global - smoother & everywhere empty
let milanaY=0;
function spawnGlobalMilana(){
  const layer=document.getElementById('globalMilana');
  if(!layer || document.hidden) return;
  const el=document.createElement('div');
  el.className='milana';
  el.textContent='♥️';
  milanaY = (milanaY + 29) % 68;
  const y=12 + milanaY + (Math.random()*4-2);
  const x= 4 + Math.random()*88;
  // avoid center where cards are on lobby/auth - shift to sides on those pages
  const isLobby = lobby && lobby.classList.contains('show');
  const isAuth = authScreen && authScreen.style.display!=='none';
  let finalX=x;
  if((isAuth || isLobby) && x>28 && x<72) finalX = Math.random()<0.5 ? (6+Math.random()*14) : (80+Math.random()*14);
  el.style.left=finalX+'%';
  el.style.top=y+'%';
  el.style.animationDuration=(13 + Math.random()*2)+'s';
  el.style.fontSize=(14 + Math.random()*1.2)+'px';
  el.style.opacity=(0.10 + Math.random()*0.05).toString();
  layer.appendChild(el);
  setTimeout(()=> el.remove(), 14500);
}
setInterval(spawnGlobalMilana, 1900);
setTimeout(()=>{ spawnGlobalMilana(); setTimeout(spawnGlobalMilana, 900); setTimeout(spawnGlobalMilana, 1800); }, 500);

// hide topbar on scroll down, show on scroll up
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

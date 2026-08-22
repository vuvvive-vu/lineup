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
function logout(){ localStorage.removeItem('rave_token'); localStorage.removeItem('rave_user'); localStorage.removeItem('rave_ava'); localStorage.removeItem('rave_bio'); location.reload(); }

let currentAvatar='😎', currentBio='', currentUsername='';
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
  navRight.innerHTML='';
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
  navRight.innerHTML = `<span style="display:flex;align-items:center;gap:6px;">привет, <b>${escapeHtml(username)}</b></span><button class="avatar-btn${avaCls}" id="profileBtn" title="Профиль">${avaHtml}</button><button class="btn-ghost" id="logoutBtn">Выйти</button>`;
  $('#logoutBtn').onclick = logout;
  $('#profileBtn').onclick = openProfile;
}
function escapeHtml(s){ return (s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
checkAuth();

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

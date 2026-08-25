const $ = s => document.querySelector(s);
const authScreen = $('#authScreen');
const lobby = $('#lobby');
const navRight = $('#navRight');
const authError = $('#authError');
const usernameEl = $('#username');

// welcome modal
const welcomeModal = document.getElementById('welcomeModal');
const welcomeContinue = document.getElementById('welcomeContinue');
if(welcomeModal && welcomeContinue){
  if(!sessionStorage.getItem('togetherly_welcomed')){
    welcomeModal.classList.add('show');
  }
  welcomeContinue.onclick = ()=>{
    welcomeModal.classList.remove('show');
    sessionStorage.setItem('togetherly_welcomed','1');
  };
}

function showError(el, msg){
  el.textContent = msg;
  el.classList.add('show');
}
function hideError(el){ el.classList.remove('show'); }

function token(){ return localStorage.getItem('rave_token'); }
const BADGE_PRESETS_CLIENT = {
  developer: { label: 'DEVELOPER', theme: 'snow', snow: true }
};

function setToken(t, displayName, username, ava, bio, badgeOrCreator){
  if (bio===undefined){
    bio=ava; ava=username; username=displayName; displayName=username;
  }
  localStorage.setItem('rave_token', t);
  if(displayName) localStorage.setItem('rave_display', displayName);
  if(username) localStorage.setItem('rave_user', username);
  if(ava!==undefined) localStorage.setItem('rave_ava', ava||'');
  if(bio!==undefined) localStorage.setItem('rave_bio', bio||'');
  if(badgeOrCreator!==undefined) {
    // поддержка и строки badge и булева isCreator
    if (typeof badgeOrCreator === 'string' && badgeOrCreator) {
      localStorage.setItem('rave_badge', badgeOrCreator.toLowerCase());
      localStorage.setItem('rave_isCreator', '1');
    } else if (badgeOrCreator === true || badgeOrCreator === '1') {
      localStorage.setItem('rave_badge', 'developer');
      localStorage.setItem('rave_isCreator', '1');
    } else if (badgeOrCreator === false || badgeOrCreator === null) {
      localStorage.removeItem('rave_badge');
      localStorage.setItem('rave_isCreator', '0');
    } else {
      localStorage.setItem('rave_badge', String(badgeOrCreator).toLowerCase());
    }
  }
}

function getBadgeLocal() {
  const b = localStorage.getItem('rave_badge');
  if (b) return b.toLowerCase();
  // легаси
  if (localStorage.getItem('rave_isCreator') === '1') return 'developer';
  return null;
}
function setBadgeLocal(badge) {
  if (badge) {
    localStorage.setItem('rave_badge', String(badge).toLowerCase());
    localStorage.setItem('rave_isCreator', '1');
  } else {
    localStorage.removeItem('rave_badge');
    localStorage.setItem('rave_isCreator', '0');
  }
}
function getDisplayName(){ return localStorage.getItem('rave_display') || localStorage.getItem('rave_user') || 'гость'; }
function getUsername(){ return localStorage.getItem('rave_user') || ''; }
async function logout(){
  const t = token();
  if(t){
    try{ fetch('/api/logout', { method:'POST', headers:{ Authorization:'Bearer '+t } }); }catch{}
  }
  localStorage.removeItem('rave_token');
  localStorage.removeItem('rave_user');
  localStorage.removeItem('rave_display');
  localStorage.removeItem('rave_email');
  localStorage.removeItem('rave_ava');
  localStorage.removeItem('rave_bio');
  localStorage.removeItem('rave_isCreator');
  localStorage.removeItem('rave_badge');
  location.reload();
}

let currentAvatar='', currentBio='', currentUsername='', currentDisplayName='';
function isEn(){ return false; }
function setLang(en){ localStorage.setItem('rave_lang','ru'); document.documentElement.lang='ru'; }
const T={
  // Auth
  'Регистрация':'Registration','Вход':'Login','Режим гостя':'Guest mode',
  'Зарегистрируйтесь чтобы продолжить.':'Sign up to continue.',
  'Войдите в аккаунт чтобы продолжить.':'Log in to your account to continue.',
  'Быстрый вход по нику.':'Quick login by nickname',
  'Почта':'Email','Быстро':'Quick',
  'Ник':'Nickname','Пароль':'Password','Войти':'Log in','Зарегистрироваться':'Sign up',
  'Забыли пароль?':'Forgot password?',
  'Уже есть аккаунт?':'Already have an account?','Нет аккаунта?':'Don\'t have an account?',
  'Введите ник':'Enter nickname','Ник максимум 20 символов':'Nickname max 20 characters',
  'Введите email':'Enter email','Введите пароль':'Enter password',
  'Введи ник':'Enter nickname','Email уже зарегистрирован':'Email already registered',
  'Этот ник уже занят':'This nickname is taken',
  'Некорректный email':'Invalid email','Пароль минимум 6 символов':'Password min 6 characters',
  'минимум 6 символов':'min 6 characters','твой ник':'your nickname',
  'например, anomalyco':'e.g. anomalyco','пару слов о себе...':'a few words about yourself...',
  'Введите email и код':'Enter email and code','Неверный или просроченный код':'Invalid or expired code',
  'Неверный код':'Invalid code','Введите 6-значный код':'Enter 6-digit code',
  'Проверьте почту — мы отправили код подтверждения.':'Check your email — we sent a verification code.',
  'Код из письма':'Code from email','Подтвердить':'Confirm',
  'Назад ко входу':'Back to login','Войти в аккаунт чтобы продолжить':'Log in to continue',
  'Введите email — отправим код для сброса':'Enter email — we\'ll send a reset code',
  'Отправить':'Send','Назад':'Back',
  'Введи код':'Enter code','Комната не найдена':'Room not found',
  'Слишком много попыток':'Too many attempts',
  // Lobby
  'Смотрите фильмы и сериалы вместе с togetherly.':'Watch movies and series together with togetherly.',
  'Togetherly — сервис для удобного совместного просмотра любого медиаконтента из доступных площадок в плеере. Сервис развивается с каждым днём, добавляются новые функции для вашего удобства!':'Togetherly is a service for convenient joint viewing of any media content from available platforms in the player. The service is evolving every day, adding new features for your convenience!',
  'Создать комнату':'Create room','Войти по коду':'Join by code','Войти в комнату':'Join room',
  'Немного про нас':'About us','Связь с разработчиком':'Contact developer',
  'Создай комнату, выбери фильм с VK / RuTube / YouTube и скинь ссылку/код друзьям.':
    'Create a room, pick a video from VK, RuTube or YouTube and share the link/code with friends.',
  'Выбери площадку — VK, RuTube или YouTube — вставь ссылку на видео и поделись ссылкой/кодом с другом.':
    'Choose a platform — VK, RuTube or YouTube — paste a video link and share it with a friend.',
  'У тебя есть ссылка или код от друга? Вставь его и сразу попадёшь в комнату.':
    'Have a link or code from a friend? Paste it and join the room instantly.',
  // Profile/auth new
  'Имя':'Name','Имя пользователя':'Username','имя пользователя':'username','О себе':'About','о себе':'about',
  'Отмена':'Cancel','Готово':'Done','Изменить фотографию':'Change photo','Изм.':'Edit','в сети':'online',
  'например, Валентин':'e.g. Valentin','ваше имя':'your name',
  'Это имя уже занято.':'This username is taken.','Имя пользователя должно содержать не меньше 3 символов.':'Username must be at least 3 characters.',
  'Можно использовать a-z, 0-9 и -_. Минимальная длина - 3 символа.':'You can use a-z, 0-9 and -_. Minimum length - 3 characters.',
  'Имя пользователя 3-20: a-z, 0-9, -_':'Username 3-20: a-z, 0-9, -_',
  'Имя пользователя 3-20: a-z, 0-9, -_':'Username 3-20: a-z, 0-9, -_',
  'Имя пользователя 3-20 символов: a-z, 0-9, _':'Username 3-20 characters: a-z, 0-9, -_',
  'Имя пользователя 3-20 символов: a-z, 0-9, -_':'Username 3-20 characters: a-z, 0-9, -_',
  'Проверка...':'Checking...',
  // Room
  'Профиль':'Profile','Описание':'Description','Сохранить':'Save',
  'Выбери аватар или загрузи фото':'Choose an avatar or upload a photo',
  '📷 Загрузить фото':'📷 Upload photo',
  'Выйти из аккаунта':'Log out','Сменить аккаунт':'Switch account',
  'Админ-панель':'Admin panel','Управление пользователями':'User management',
  'Вставь ссылку или код (например, 7X9KQ2 или https://.../room?code=7X9KQ2)':'Paste a link or code (e.g. 7X9KQ2 or https://.../room?code=7X9KQ2)',
  'Код / Ссылка':'Code / Link',
  'Название комнаты (необязательно)':'Room name (optional)',
  'Ссылка на видео VK':'Video link (VK)',
  'Создать и войти':'Create and join',
  'Вечерний кинчик':'Evening movies',
  'Вставь обычную ссылку на VK видео':'Paste a regular VK video link',
  'Ник не может быть пустым':'Nickname cannot be empty','Максимум 20 символов':'Max 20 characters',
  'Фото до 2MB':'Photo up to 2MB','Только изображения':'Images only',
  'Фото слишком большое после сжатия':'Photo too large after compression',
  'Загрузить фото':'Upload photo','Выйти из аккаунта':'Log out',
  'Прикрепить фото':'Attach photo','Отправить':'Send','Копировать':'Copy',
  'Удалить':'Delete','Закрыть':'Close',
  'Приглашение в комнату':'Room invite','Код':'Code',
  'Поделиться ссылкой':'Share link','Скопировано':'Copied',
  'Создай комнату...':'Create a room...',
  // Nav
  'Logout':'Logout',
};
function t(s){ if(!isEn()) return s; return T[s]||s; }
function applyTranslations(){
  document.querySelectorAll('[data-i18n]').forEach(el=>{
    const key=el.getAttribute('data-i18n');
    if(T[key]) el.textContent=isEn()?T[key]:key;
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el=>{
    const key=el.getAttribute('data-i18n-placeholder');
    if(T[key]) el.placeholder=isEn()?T[key]:key;
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el=>{
    const key=el.getAttribute('data-i18n-title');
    if(T[key]) el.title=isEn()?T[key]:key;
  });
}
function toggleLang(){ setLang(!isEn()); location.reload(); }

async function checkAuth(){
  const t = token();
  if(!t){ showAuth(); return; }
  try{
    const r = await fetch('/api/me', { headers:{ Authorization:'Bearer '+t }});
    if(!r.ok) throw new Error();
    const j = await r.json();
    currentAvatar=j.avatar||localStorage.getItem('rave_ava')||''; currentBio=j.bio||''; currentUsername=j.username||''; currentDisplayName=j.displayName||j.username||localStorage.getItem('rave_display')||currentUsername;
    localStorage.setItem('rave_ava', currentAvatar); localStorage.setItem('rave_bio', currentBio); if(currentDisplayName) localStorage.setItem('rave_display', currentDisplayName); if(currentUsername) localStorage.setItem('rave_user', currentUsername); if(j.email) localStorage.setItem('rave_email', j.email); else if(!j.isGuest) localStorage.setItem('rave_email', j.email||''); setBadgeLocal(j.badge || (j.isCreator ? 'developer' : null));
    if(!j.emailVerified && j.email){
      showAuth();
      inVerification=true;
      window._pendingToken=t;
      window._pendingVerifyEmail=j.email;
      authEmailEl.parentElement.parentElement.style.display='none';
      authBtnEl.parentElement.style.display='none';
      authSwitchEl.style.display='none';
      forgotLink.style.display='none';
      document.getElementById('authError').style.display='none';
      authSuccessEl.style.display='';
    } else {
      showLobby(currentDisplayName, currentAvatar);
    }
  }catch{ showAuth(); }
}

function showAuth(){
  authScreen.style.display='grid';
  lobby.classList.remove('show');
  navRight.innerHTML=``;
  applyTranslations();
  // show verified/success params
  const params=new URLSearchParams(location.search);
  if(params.get('verified')==='1'){
    const s=$('#authSuccess'); if(s) s.style.display='block';
    window.history.replaceState({},'',location.pathname);
  }
}

function isPhoto(ava){ return ava && ava.startsWith('data:image/'); }
function renderAvaBtn(btn, ava){
  if(isPhoto(ava)){ btn.innerHTML=`<img src="${ava}" alt="ava">`; btn.classList.add('has-photo'); }
  else { btn.textContent=ava; btn.classList.remove('has-photo'); }
}
function renderAvaLargeEl(el, ava){
  if(isPhoto(ava)){ el.innerHTML=`<img src="${ava}" alt="">`; el.classList.add('has-photo'); }
  else { el.textContent=ava; el.classList.remove('has-photo'); }
}

function showLobby(displayName, avatar){
  avatar=avatar||localStorage.getItem('rave_ava')||'';
  const nameForLetter = displayName || getDisplayName() || 'Г';
  authScreen.style.display='none';
  lobby.classList.add('show');
  const avaHtml = isPhoto(avatar) ? `<img src="${avatar}" alt="ava">` : letterFor(nameForLetter);
  const avaCls = isPhoto(avatar) ? ' has-photo letter-avatar' : ' letter-avatar';
  const bg = isPhoto(avatar) ? '' : ` style="background:${avatarBg(nameForLetter)};color:#fff;"`;
  navRight.innerHTML = `<button class="avatar-btn${avaCls}" id="profileBtn" title="Профиль"${bg}>${avaHtml}</button><button class="btn-ghost" id="logoutBtn">Выйти</button>`;
  $('#logoutBtn').onclick = logout;
  $('#profileBtn').onclick = openProfile;
  applyTranslations();
}

function escapeHtml(s){ return (s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
checkAuth();

// --- Auth tabs ---
let authMode='register'; // login or register
let inVerification=false; // currently showing code input
const authTabs=document.getElementById('authTabs');
const tabEmail=document.getElementById('tabEmail');
const tabQuick=document.getElementById('tabQuick');
const emailFields=document.getElementById('emailFields');
const regUsernameField=document.getElementById('regUsernameField');
const regDisplayNameField=document.getElementById('regDisplayNameField');
const authEmailEl=document.getElementById('authEmail');
const authPasswordEl=document.getElementById('authPassword');
const authBtnEl=document.getElementById('authBtn');
const authSwitchEl=document.getElementById('authSwitch');
const forgotForm=document.getElementById('forgotForm');
const forgotLink=document.getElementById('forgotLink');
const backToLogin=document.getElementById('backToLogin');
const forgotBtnEl=document.getElementById('forgotBtn');
const forgotEmailEl=document.getElementById('forgotEmail');
const authSuccessEl=document.getElementById('authSuccess');
const switchToReg=document.getElementById('switchToReg');

if(authTabs){
  const authTitle=document.getElementById('authTitle');
  const authSubtitle=document.getElementById('authSubtitle');
  function updateAuthTitles(){
    if(authMode==='register'){
      if(authTitle) authTitle.textContent=t('Регистрация');
      if(authSubtitle) authSubtitle.textContent=t('Зарегистрируйтесь чтобы продолжить.');
    } else {
      if(authTitle) authTitle.textContent=t('Вход');
      if(authSubtitle) authSubtitle.textContent=t('Войдите в аккаунт чтобы продолжить.');
    }
  }
  authTabs.querySelectorAll('button').forEach(btn=>{
    btn.onclick=()=>{
      if(inVerification) return;
      if(forgotForm && forgotForm.style.display!=='none') return;
      const rf=document.getElementById('resetForm');
      if(rf && rf.style.display!=='none') return;
      authTabs.querySelectorAll('button').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      if(btn.dataset.tab==='email'){
        tabEmail.style.display=''; tabQuick.style.display='none';
        updateAuthTitles();
      } else {
        tabEmail.style.display='none'; tabQuick.style.display='';
        if(authTitle) authTitle.textContent=t('Режим гостя');
        if(authSubtitle) authSubtitle.textContent=t('Быстрый вход по нику.');
      }
    };
  });
}

if(switchToReg){
  switchToReg.onclick=(e)=>{
    e.preventDefault();
    authMode='login';
    if(regUsernameField) regUsernameField.style.display='none';
    if(regDisplayNameField) regDisplayNameField.style.display='none';
    authBtnEl.textContent=t('Войти');
    authSwitchEl.innerHTML=t('Нет аккаунта?')+' <a href="#" id="switchToLogin" style="color:#fff;font-weight:600;">'+t('Зарегистрироваться')+'</a>';
    const authTitle=document.getElementById('authTitle');
    const authSubtitle=document.getElementById('authSubtitle');
    if(authTitle) authTitle.textContent=t('Вход');
    if(authSubtitle) authSubtitle.textContent=t('Войдите в аккаунт чтобы продолжить.');
    document.getElementById('switchToLogin').onclick=(e)=>{
      e.preventDefault();
      authMode='register';
      if(regUsernameField) regUsernameField.style.display='';
      if(regDisplayNameField) regDisplayNameField.style.display='';
      authBtnEl.textContent=t('Зарегистрироваться');
      authSwitchEl.innerHTML=t('Уже есть аккаунт?')+' <a href="#" id="switchToReg" style="color:#fff;font-weight:600;">'+t('Войти')+'</a>';
      document.getElementById('switchToReg').onclick=switchToReg.onclick;
      if(authTitle) authTitle.textContent=t('Регистрация');
      if(authSubtitle) authSubtitle.textContent=t('Зарегистрируйтесь чтобы продолжить.');
    };
  };
}

if(forgotLink){
  forgotLink.onclick=(e)=>{
    e.preventDefault();
    tabEmail.style.display='none';
    forgotForm.style.display='';
    authSuccessEl.style.display='none';
  };
}
if(backToLogin){
  backToLogin.onclick=(e)=>{
    e.preventDefault();
    forgotForm.style.display='none';
    tabEmail.style.display='';
  };
}
const backToLogin2=document.getElementById('backToLogin2');
if(backToLogin2){
  backToLogin2.onclick=(e)=>{
    e.preventDefault();
    document.getElementById('resetForm').style.display='none';
    tabEmail.style.display='';
  };
}

// Email login/register
if(authBtnEl){
  authBtnEl.onclick=async()=>{
    hideError(authError);
    const email=authEmailEl.value.trim();
    const password=authPasswordEl.value;
    if(!email) return showError(authError,'Введите email');
    if(!password) return showError(authError,'Введите пароль');
    authBtnEl.disabled=true;
    try{
      if(authMode==='register'){
        const displayName=(document.getElementById('regDisplayName')?.value||'').trim();
        const username=(document.getElementById('regUsername')?.value||'').trim().toLowerCase();
        if(!displayName) return showError(authError,'Введите имя');
        if(displayName.length>20) return showError(authError,'Имя максимум 20 символов');
        if(!username) return showError(authError,'Введите имя пользователя');
        if(!/^[a-z0-9_-]{3,20}$/.test(username)) return showError(authError,'Имя пользователя 3-20: a-z, 0-9, -_');
        const r=await fetch('/api/auth/register-email',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({displayName,username,email,password})});
        const j=await r.json();
        if(!r.ok) throw new Error(j.error||'Ошибка');
        currentAvatar=j.avatar||''; currentBio=j.bio||''; currentUsername=j.username; currentDisplayName=j.displayName||displayName;
        if(!j.emailVerified){
          window._pendingToken=j.token;
          window._pendingVerifyEmail=email;
          inVerification=true;
          authEmailEl.parentElement.parentElement.style.display='none';
          authBtnEl.parentElement.style.display='none';
          authSwitchEl.style.display='none';
          forgotLink.style.display='none';
          const dField=document.getElementById('regDisplayNameField'); if(dField) dField.style.display='none';
          if(regUsernameField) regUsernameField.style.display='none';
          document.getElementById('authError').style.display='none';
          authSuccessEl.style.display='';
        } else {
          setToken(j.token,j.displayName||displayName,j.username,j.avatar,j.bio, j.badge || (j.isCreator ? 'developer' : null));
          localStorage.setItem('rave_email', j.email||email);
          showLobby(j.displayName||displayName,currentAvatar);
        }
      } else {
        const r=await fetch('/api/auth/login-email',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});
        const j=await r.json();
        if(!r.ok) throw new Error(j.error||'Ошибка');
        currentAvatar=j.avatar||''; currentBio=j.bio||''; currentUsername=j.username; currentDisplayName=j.displayName||j.username;
        if(!j.emailVerified){
          window._pendingToken=j.token;
          window._pendingVerifyEmail=email;
          inVerification=true;
          authEmailEl.parentElement.parentElement.style.display='none';
          authBtnEl.parentElement.style.display='none';
          authSwitchEl.style.display='none';
          forgotLink.style.display='none';
          document.getElementById('authError').style.display='none';
          authSuccessEl.style.display='';
        } else {
          setToken(j.token,j.displayName||j.username,j.username,j.avatar,j.bio, j.badge || (j.isCreator ? 'developer' : null));
          localStorage.setItem('rave_email', j.email||email);
          showLobby(j.displayName||j.username,currentAvatar);
        }
      }
    }catch(e){ showError(authError,e.message); }
    finally{ authBtnEl.disabled=false; }
  };
}

// Forgot password
if(forgotBtnEl){
  forgotBtnEl.onclick=async()=>{
    hideError(authError);
    const email=forgotEmailEl.value.trim();
    if(!email) return showError(authError,'Введите email');
    forgotBtnEl.disabled=true;
    try{
      await fetch('/api/auth/forgot',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});
      forgotForm.style.display='none';
      document.getElementById('resetForm').style.display='';
      document.getElementById('resetEmail').value=email;
    }catch(e){ showError(authError,e.message); }
    finally{ forgotBtnEl.disabled=false; }
  };
}

// Verify code after registration
const verifyCodeBtn=document.getElementById('verifyCodeBtn');
const verifyCodeInput=document.getElementById('verifyCodeInput');
const verifyCodeError=document.getElementById('verifyCodeError');
if(verifyCodeBtn){
  verifyCodeBtn.onclick=async()=>{
    verifyCodeError.style.display='none';
    const code=verifyCodeInput.value.trim();
    if(!code||code.length!==6) return(()=>{ verifyCodeError.textContent='Введите 6-значный код'; verifyCodeError.style.display=''; })();
    verifyCodeBtn.disabled=true;
    try{
      const r=await fetch('/api/auth/verify-code',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:window._pendingVerifyEmail,code})});
      const j=await r.json();
      if(!r.ok) throw new Error(j.error||'Ошибка');
      inVerification=false;
      setToken(window._pendingToken,currentDisplayName||currentUsername,currentUsername,currentAvatar,currentBio);
      if(window._pendingVerifyEmail) localStorage.setItem('rave_email', window._pendingVerifyEmail);
      window._pendingToken=null;
      showLobby(currentDisplayName||currentUsername,currentAvatar);
    }catch(e){ verifyCodeError.textContent=e.message; verifyCodeError.style.display=''; }
    finally{ verifyCodeBtn.disabled=false; }
  };
  verifyCodeInput.addEventListener('keydown',e=>{if(e.key==='Enter') verifyCodeBtn.click(); });
}

// Reset password with code
const resetBtn=document.getElementById('resetBtn');
if(resetBtn){
  resetBtn.onclick=async()=>{
    hideError(authError);
    const email=document.getElementById('resetEmail').value.trim();
    const code=document.getElementById('resetCode').value.trim();
    const password=document.getElementById('resetPassword').value;
    if(!email||!code) return showError(authError,'Введите email и код');
    if(!password||password.length<6) return showError(authError,'Пароль минимум 6 символов');
    resetBtn.disabled=true;
    try{
      const r=await fetch('/api/auth/reset',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,code,password})});
      const j=await r.json();
      if(!r.ok) throw new Error(j.error||'Ошибка');
      document.getElementById('resetForm').style.display='none';
      authSuccessEl.querySelector('p').textContent='Пароль сброшен! Теперь войдите';
      authSuccessEl.querySelector('div').textContent='✅';
      authSuccessEl.style.display='';
      setTimeout(()=>{ authSuccessEl.style.display='none'; },3000);
    }catch(e){ showError(authError,e.message); }
    finally{ resetBtn.disabled=false; }
  };
}

// Quick auth (old style)
const quickAuthBtn=document.getElementById('quickAuthBtn');
if(quickAuthBtn){
  quickAuthBtn.onclick=async()=>{
    hideError(authError);
    const displayName=usernameEl.value.trim();
    if(!displayName) return showError(authError,'Введи имя');
    if(displayName.length>20) return showError(authError,'Имя максимум 20 символов');
    quickAuthBtn.disabled=true;
    try{
      const ava=localStorage.getItem('rave_ava')||'';
      const bio=localStorage.getItem('rave_bio')||'';
      const r=await fetch('/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({displayName,avatar:ava,bio})});
      const txt=await r.text();
      let j; try{ j=JSON.parse(txt); }catch{ throw new Error(txt||'Ошибка сервера'); }
      if(!r.ok) throw new Error(j.error||'Ошибка');
      setToken(j.token,j.displayName||j.username,j.username,j.avatar,j.bio);
      currentAvatar=j.avatar||''; currentBio=j.bio||''; currentUsername=j.username||''; currentDisplayName=j.displayName||displayName;
      localStorage.removeItem('rave_email');
      showLobby(j.displayName||displayName,currentAvatar);
    }catch(e){ showError(authError,e.message); }
    finally{ quickAuthBtn.disabled=false; }
  };
  usernameEl.addEventListener('keydown',e=>{if(e.key==='Enter') quickAuthBtn.click(); });
}

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

// --- profile (view + edit) ---
const profileModal=$('#profileModal');
const editModal=$('#editModal');
const pAvaLarge=$('#pAvaLarge');
const eAvaLarge=document.getElementById('eAvaLarge');
const pUsername=$('#pUsername');
const eUsername=document.getElementById('eUsername');
const eDisplayName=document.getElementById('eDisplayName');
const pBio=$('#pBio');
const pError=$('#pError');
const pSave=$('#pSave');
const pLogout=$('#pLogout');
const bioCount=$('#bioCount');
const avatarFile=$('#avatarFile');
const changePhotoLink=document.getElementById('changePhotoLink');
const openEditBtn=document.getElementById('openEditBtn');
const editCancel=document.getElementById('editCancel');
const editDone=document.getElementById('editDone');
const pViewDisplayName=document.getElementById('pViewDisplayName');
const pViewUsername=document.getElementById('pViewUsername');
const pViewBio=document.getElementById('pViewBio');
let selectedAva='';

function letterFor(name){ return (name||'?').trim()[0]?.toUpperCase() || '?'; }
function avatarBg(name){ let h=0; for(let i=0;i<name.length;i++) h=(h*31+name.charCodeAt(i))%360; return `hsl(${h}, 62%, 42%)`; }

// override render helpers for letter avatar
const _origRenderAvaLargeEl = typeof renderAvaLargeEl !== 'undefined' ? renderAvaLargeEl : null;
function renderAvaLargeElNew(el, ava, fallback){
  if(!el) return;
  if(isPhoto(ava)){
    el.innerHTML=`<img src="${ava}" alt="">`;
    el.style.background=''; el.style.backgroundColor='';
    el.style.color='';
    el.classList.add('has-photo');
  } else {
    const name = (fallback && fallback.trim()) ? fallback : (currentDisplayName && currentDisplayName.trim() ? currentDisplayName : (currentUsername || '?'));
    const letter = letterFor(name);
    const bg = avatarBg(name);
    el.classList.remove('has-photo');
    el.innerHTML='';
    el.textContent=letter;
    el.style.background=''; el.style.backgroundColor=bg;
    el.style.backgroundImage='none';
    el.style.color='#fff';
    el.style.borderColor='transparent';
  }
}
// patch global renderAvaLargeEl
if (typeof window !== 'undefined') window.renderAvaLargeEl = renderAvaLargeElNew;

function openProfile(){
  // fetch fresh me to show correct data
  const ava=localStorage.getItem('rave_ava')||currentAvatar||'';
  const bio=localStorage.getItem('rave_bio')||currentBio||'';
  const disp=localStorage.getItem('rave_display')||currentDisplayName||currentUsername||'';
  const handle=localStorage.getItem('rave_user')||currentUsername||'';
  const email = localStorage.getItem('rave_email') || ''; // may not be stored, fallback via checkAuth
  // guest detection: no handle? Actually guest has display but no handle? For guest handle is maybe empty
  const isGuest = !handle || handle.startsWith('guest_') || !localStorage.getItem('rave_token') || false; // will refine via /api/me isGuest
  selectedAva=ava;
  if(pViewDisplayName) pViewDisplayName.textContent=disp||'?';
  if(pViewUsername) pViewUsername.textContent= handle ? '@'+handle : 'гость';
  if(pViewBio) pViewBio.textContent=bio||'—';
  // avatar view
  renderAvaLargeElNew(pAvaLarge, ava, disp);
  renderAvaLargeElNew(eAvaLarge, ava, disp);
  hideError(pError);
  // immediate sync check so button appears instantly, no flicker
  const localIsGuest = !handle || String(handle).startsWith('guest:');
  if(openEditBtn) openEditBtn.style.display = localIsGuest ? 'none' : '';
  const cardSync=document.getElementById('profileInfoCard');
  if(cardSync) cardSync.style.display = localIsGuest ? 'none' : '';
  // instant badge from localStorage (no delay) - привязано всё оформление
  const localBadge = getBadgeLocal();
  const crownIconSync = document.getElementById('pCrownIcon');
  const creatorBadgeSync = document.getElementById('pCreatorBadge');
  const avaWrapSync = document.getElementById('pAvaWrap');
  applyBadgeToProfile(avaWrapSync, crownIconSync, creatorBadgeSync, localBadge, localIsGuest);
  // confirm via server (update if changed)
  fetch('/api/me', { headers:{ Authorization:'Bearer '+token() }}).then(r=>r.json()).then(j=>{
    const guest = j.isGuest;
    if(openEditBtn) openEditBtn.style.display = guest ? 'none' : '';
    const card=document.getElementById('profileInfoCard');
    if(card) card.style.display = guest ? 'none' : '';
    const badge = j.badge || (j.isCreator ? 'developer' : null);
    setBadgeLocal(badge);
    // Show badge (server truth)
    const crownIcon = document.getElementById('pCrownIcon');
    const creatorBadge = document.getElementById('pCreatorBadge');
    const avaWrap = document.getElementById('pAvaWrap');
    applyBadgeToProfile(avaWrap, crownIcon, creatorBadge, badge, guest);
  }).catch(()=>{});
  profileModal.classList.add('show');
}

function applyBadgeToProfile(avaWrap, crownIcon, badgeEl, badge, isGuest) {
  if (!avaWrap) return;
  // очистить старые бейдж-классы
  avaWrap.classList.remove('creator-badge', 'badge-developer', 'badge-snow');
  avaWrap.querySelectorAll('.snowflake').forEach(s => s.remove());
  delete avaWrap.dataset.badge;
  if (crownIcon) crownIcon.style.display = 'none';
  if (badgeEl) { badgeEl.style.display = 'none'; badgeEl.textContent = 'DEVELOPER'; }
  if (isGuest || !badge) return;
  const cfg = BADGE_PRESETS_CLIENT[badge];
  if (!cfg) return;
  avaWrap.dataset.badge = badge;
  // все оформление привязано к бейджу
  if (badge === 'developer') {
    avaWrap.classList.add('badge-developer', 'badge-snow');
  } else {
    avaWrap.classList.add('badge-' + badge);
    if (cfg.snow) avaWrap.classList.add('badge-snow');
  }
  if (cfg.icon === 'crown' && crownIcon) crownIcon.style.display = 'block';
  if (badgeEl) {
    badgeEl.textContent = cfg.label || badge.toUpperCase();
    badgeEl.style.display = 'inline-block';
  }
  if (cfg.snow) createSnowflakes(avaWrap);
}

function createSnowflakes(container) {
  // Remove existing snowflakes
  container.querySelectorAll('.snowflake').forEach(s => s.remove());
  
  // Create 12 snowflakes with natural drift - медленное появление сверху до низа
  for(let i = 0; i < 12; i++) {
    const snowflake = document.createElement('div');
    snowflake.classList.add('snowflake');
    snowflake.innerHTML = '❄';
    
    // Spread across 260px wrap
    const leftPos = Math.random() * 88 + 6;
    snowflake.style.left = leftPos + '%';
    
    // Очень медленно 10-14 секунд чтобы не резко
    const duration = Math.random() * 4 + 10;
    snowflake.style.animationDuration = duration + 's';
    
    // Negative delay = уже в полете, распределение по времени + дополнительная случайность
    snowflake.style.animationDelay = (-Math.random() * 14) + 's';
    
    // Varied sizes 10-15px
    snowflake.style.fontSize = (Math.random() * 5 + 10) + 'px';
    
    // Мягкий дрифт -10 to +25px
    const drift = (Math.random() * 35 - 10) + 'px';
    snowflake.style.setProperty('--drift', drift);
    
    container.appendChild(snowflake);
  }
}
function closeProfile(){ profileModal.classList.remove('show'); }
function openEdit(){
  const ava=localStorage.getItem('rave_ava')||currentAvatar||'';
  const bio=localStorage.getItem('rave_bio')||currentBio||'';
  const disp=localStorage.getItem('rave_display')||currentDisplayName||'';
  const handle=localStorage.getItem('rave_user')||currentUsername||'';
  selectedAva=ava;
  if(eDisplayName) eDisplayName.value=disp;
  if(eUsername) eUsername.value=handle;
  if(pBio) pBio.value=bio;
  if(bioCount) bioCount.textContent=bio.length;
  const eEmail=document.getElementById('eEmail');
  if(eEmail){
    const em = localStorage.getItem('rave_email')||''; // we will store on login
    eEmail.textContent = em || '—';
  }
  renderAvaLargeElNew(eAvaLarge, ava, disp);
  hideError(pError);
  profileModal.classList.remove('show');
  if(editModal) editModal.classList.add('show');
  // trigger handle check to show current status
  setTimeout(()=>{ const st=document.getElementById('eUsernameStatus'); if(eUsername && st){ eUsername.dispatchEvent(new Event('input')); } }, 50);
}
function closeEdit(){ if(editModal) editModal.classList.remove('show'); }
profileModal.addEventListener('click', e=>{ if(e.target===profileModal) closeProfile(); });
if(editModal) editModal.addEventListener('click', e=>{ if(e.target===editModal) closeEdit(); });
if(openEditBtn) openEditBtn.onclick=openEdit;
if(editCancel) editCancel.onclick=()=>{ closeEdit(); openProfile(); };
if(editDone) editDone.onclick=()=> document.getElementById('pSave')?.click();
if(changePhotoLink) changePhotoLink.onclick=()=> avatarFile.click();
if(pBio) pBio.addEventListener('input', ()=> { if(bioCount) bioCount.textContent=pBio.value.length; });
if(pLogout) pLogout.onclick=logout;
avatarFile.onchange=()=>{
  const file=avatarFile.files[0];
  if(!file) return;
  if(file.size>2*1024*1024){ showError(pError,'Фото до 2MB'); return; }
  if(!file.type.startsWith('image/')){ showError(pError,'Только изображения'); return; }
  const reader=new FileReader();
  reader.onload=()=>{
    let dataUrl=reader.result;
    const apply=(d)=>{
      selectedAva=d;
      renderAvaLargeElNew(pAvaLarge, d, eDisplayName?.value || currentDisplayName);
      renderAvaLargeElNew(eAvaLarge, d, eDisplayName?.value || currentDisplayName);
      hideError(pError);
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
        if(dataUrl.length>500*1024){ showError(pError,'Фото слишком большое после сжатия'); return; }
        apply(dataUrl);
      };
      img.src=dataUrl;
    } else {
      apply(dataUrl);
    }
  };
  reader.readAsDataURL(file);
  avatarFile.value='';
};

pSave.onclick=async()=>{
  hideError(pError);
  const newDisplay=(document.getElementById('eDisplayName')?.value||'').trim();
  const newHandle=(document.getElementById('eUsername')?.value||'').trim().toLowerCase();
  const newBio=pBio.value.trim();
  if(!newDisplay) return showError(pError,'Имя не может быть пустым');
  if(newDisplay.length>20) return showError(pError,'Максимум 20 символов');
  if(!newHandle) return showError(pError,'Введите имя пользователя');
  if(!/^[a-z0-9_-]{3,20}$/.test(newHandle)) return showError(pError,'Имя пользователя 3-20: a-z, 0-9, -_');
  pSave.disabled=true; pSave.textContent='Сохранение...';
  try{
    const r=await fetch('/api/me', {
      method:'PUT',
      headers:{ 'Content-Type':'application/json', Authorization:'Bearer '+token() },
      body: JSON.stringify({ displayName:newDisplay, username:newHandle, avatar:selectedAva, bio:newBio })
    });
    const j=await r.json();
    if(!r.ok) throw new Error(j.error||'Ошибка');
    localStorage.setItem('rave_token', j.token);
    localStorage.setItem('rave_display', j.displayName);
    localStorage.setItem('rave_user', j.username);
    localStorage.setItem('rave_ava', j.avatar);
    localStorage.setItem('rave_bio', j.bio);
    setBadgeLocal(j.badge || (j.isCreator ? 'developer' : null));
    currentAvatar=j.avatar; currentBio=j.bio; currentUsername=j.username; currentDisplayName=j.displayName;
    const avaBtn=document.getElementById('profileBtn');
    if(avaBtn){
      if(isPhoto(j.avatar)) avaBtn.innerHTML=`<img src="${j.avatar}" alt="">`, avaBtn.classList.add('has-photo');
      else { avaBtn.textContent=letterFor(j.displayName); avaBtn.style.background=avatarBg(j.displayName); avaBtn.classList.remove('has-photo'); }
    }
    const bEl=document.querySelector('.nav-right b');
    if(bEl) bEl.textContent=j.displayName;
    if(editModal) editModal.classList.remove('show');
    closeProfile();
    // update view if still open
    if(pViewDisplayName) pViewDisplayName.textContent=j.displayName;
    if(pViewUsername) pViewUsername.textContent='@'+j.username;
    if(pViewBio) pViewBio.textContent=j.bio||'—';
  }catch(e){ showError(pError, e.message); }
  finally{ pSave.disabled=false; pSave.textContent='Сохранить'; }
};

// handle availability check
function setupHandleCheck(input, statusEl){
  if(!input||!statusEl) return;
  let t;
  const run=()=>{
    clearTimeout(t);
    const v=input.value.trim().toLowerCase();
    if(!v){ statusEl.textContent=t('Можно использовать a-z, 0-9 и -_. Минимальная длина - 3 символа.'); statusEl.style.color='#9a9a9a'; return; }
    if(v.length < 3){ statusEl.textContent=t('Имя пользователя должно содержать не меньше 3 символов.'); statusEl.style.color='#ff3b30'; return; }
    if(!/^[a-z0-9_-]{3,20}$/.test(v)){ statusEl.textContent=t('Имя не поддерживается.  Можно использовать a-z, 0-9 и -_. Минимальная длина - 3 символа.'); statusEl.style.color='#ff3b30'; return; }
    statusEl.textContent=t('Проверка...');
    statusEl.style.color='#9a9a9a';
    t=setTimeout(async()=>{
      try{
        const tok=localStorage.getItem('rave_token');
        const headers={};
        if(tok) headers['Authorization']='Bearer '+tok;
        const r=await fetch('/api/check-username?username='+encodeURIComponent(v), {headers});
        const j=await r.json();
        if(j.available){
          statusEl.textContent=t('Имя пользователя доступно.');
          statusEl.style.color='#4ade80';
        } else {
          if(j.reason==='invalid'){ statusEl.textContent=t('Имя не поддерживается.  Можно использовать a-z, 0-9 и -_. Минимальная длина - 3 символа.'); statusEl.style.color='#ff3b30'; }
          else { statusEl.textContent=t('Это имя уже занято.'); statusEl.style.color='#ff3b30'; }
        }
      }catch{ statusEl.textContent=''; }
    },380);
  };
  input.addEventListener('input', run);
  input.addEventListener('paste', ()=> setTimeout(run, 10));
}
setupHandleCheck(document.getElementById('regUsername'), document.getElementById('regUsernameStatus'));
setupHandleCheck(document.getElementById('eUsername'), document.getElementById('eUsernameStatus'));

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

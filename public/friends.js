// ======================= FRIENDS (togetherly v2) =======================
// Requires app.js helpers: token(), escapeHtml(), avatarBg(), letterFor().
// All calls are runtime-safe: every helper is resolved lazily.

function frToken() { try { return (typeof token === 'function' ? token() : localStorage.getItem('rave_token')); } catch { return null; } }
function frEsc(s) { try { return (typeof escapeHtml === 'function' ? escapeHtml(s) : String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '&gt;': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))); } catch { return ''; } }
function frLetter(name) {
  try { if (typeof letterFor === 'function') return letterFor(name); } catch {}
  return ((name || '?').trim()[0] || '?').toUpperCase();
}
function frBg(name) {
  try { if (typeof avatarBg === 'function') return avatarBg(name); } catch {}
  let h = 0; const s = name || '?';
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return `hsl(${h},62%,42%)`;
}
function frIsPhoto(a) { return !!a && String(a).startsWith('data:image/'); }
function frIsGuest() {
  try {
    if (localStorage.getItem('rave_isGuest') === '1') return true;
    if (!localStorage.getItem('rave_email')) return true;
  } catch {}
  return false;
}

async function frReq(path, opts) {
  opts = opts || {};
  const r = await fetch(path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + frToken() },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Ошибка');
  return j;
}

function frAvatarHtml(u, size) {
  size = size || 44;
  const name = u.displayName || u.username || '?';
  if (frIsPhoto(u.avatar)) return `<div class="fr-ava" style="width:${size}px;height:${size}px;"><img src="${u.avatar}" alt=""></div>`;
  return `<div class="fr-ava" style="width:${size}px;height:${size}px;background:${frBg(name)};color:#fff;">${frEsc(frLetter(name))}</div>`;
}

let frToastTimer = null;
function frToast(msg) {
  const el = document.getElementById('frToast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(frToastTimer);
  frToastTimer = setTimeout(() => el.classList.remove('show'), 3500);
}

function frRelButton(u) {
  // u.rel: none | pending_sent | pending_received | accepted
  if (u.rel === 'accepted') return `<button class="fr-btn ghost" data-fr-remove="${frEsc(u.username)}" title="Удалить из друзей">✓ Друзья</button>`;
  if (u.rel === 'pending_sent') return `<button class="fr-btn ghost" data-fr-cancel-id="${frEsc(u.requestId || '')}" title="Отменить заявку">Заявка ✓</button>`;
  if (u.rel === 'pending_received') return `<button class="fr-btn accept" data-fr-accept-id="${frEsc(u.requestId || '')}" title="Принять">Принять</button>`;
  return `<button class="fr-btn accept" data-fr-add="${frEsc(u.username)}" title="Добавить в друзья">＋</button>`;
}

function frUserRow(u, rightHtml, sub) {
  const uname = frEsc(u.username || '');
  return `<div class="fr-row fr-clickable" ${uname ? `data-fr-user="${uname}" title="Открыть профиль"` : ''}>
    ${frAvatarHtml(u)}
    <div class="fr-row-info">
      <div class="fr-row-name">${frEsc(u.displayName || u.username)}</div>
      <div class="fr-row-handle">${u.username ? '@' + uname : ''}${sub ? ` <span class="fr-sub">· ${frEsc(sub)}</span>` : ''}</div>
    </div>
    <div class="fr-row-actions">${rightHtml || ''}</div>
  </div>`;
}

// --- friend profile popup (read-only, opens from any row) ---
let frProfSeq = 0;
function frProfileModalEl() {
  let m = document.getElementById('frProfileModal');
  if (m) return m;
  m = document.createElement('div');
  m.id = 'frProfileModal';
  m.className = 'modal-bg';
  m.innerHTML = `<div class="modal fr-profile-modal">
    <div class="modal-head"><h3>Профиль</h3><button class="x" id="frProfileClose">✕</button></div>
    <div id="frProfileBody"></div>
  </div>`;
  document.body.appendChild(m);
  document.getElementById('frProfileClose').onclick = () => m.classList.remove('show');
  m.addEventListener('click', e => { if (e.target === m) m.classList.remove('show'); });
  return m;
}
function frBadgeLabel(b) {
  b = String(b || '').toLowerCase();
  if (b === 'founder' || b === 'developer') return 'FOUNDER';
  if (b === 'founders_wife') return "FOUNDER'S WIFE";
  if (b === 'boo') return 'BOO!';
  return b.toUpperCase();
}
// Профиль друга — только просмотр, 1-в-1 как карточка в комнате (viewProfileModal):
// аватар, имя + бейдж, инфо-карточка (имя пользователя / о себе). Без кнопок действий.
// (Управлять дружбой можно из списка друзей: ✓ / ✕ / Принять.)
function frProfileActionBtn() { return ''; }
function frProfileHtml(u, username) {
  const disp = u.displayName || u.username || username;
  const badge = (u.activeBadge || u.badge) ? `<span class="fr-profile-badge">${frEsc(frBadgeLabel(u.activeBadge || u.badge))}</span>` : '';
  const handle = u.username ? '@' + frEsc(u.username) : 'гость';
  const bio = (u.bio || '').trim() || '—';
  return `<div class="fr-profile-top">
      ${frAvatarHtml({ displayName: disp, username: u.username, avatar: u.avatar }, 96)}
      <div class="fr-profile-name">${frEsc(disp)} ${badge}</div>
    </div>
    <div class="fr-profile-card">
      <div class="fr-profile-row">
        <div class="fr-profile-label">имя пользователя</div>
        <div class="fr-profile-handle-green">${handle}</div>
      </div>
      <div class="fr-profile-row">
        <div class="fr-profile-label">о себе</div>
        <div class="fr-profile-bio">${frEsc(bio)}</div>
      </div>
    </div>`;
}
async function openFrProfile(username) {
  username = String(username || '').replace(/^@+/, '').trim();
  if (!username) return;
  const m = frProfileModalEl();
  const body = document.getElementById('frProfileBody');
  const mySeq = ++frProfSeq;
  m.classList.add('show');
  body.innerHTML = '<div class="fr-empty">Загрузка...</div>';
  try {
    const [u, rel] = await Promise.all([
      fetch('/api/users/' + encodeURIComponent(username)).then(r => r.json()),
      frReq('/api/relationship/' + encodeURIComponent(username)).catch(() => ({ status: 'none', requestId: null }))
    ]);
    if (mySeq !== frProfSeq) return;
    if (!u || u.error) throw new Error((u && u.error) || 'Пользователь не найден');
    body.innerHTML = frProfileHtml(u, username);
  } catch (e) {
    if (mySeq !== frProfSeq) return;
    body.innerHTML = `<div class="fr-empty">${frEsc(e.message)}</div>`;
  }
}
async function openFrProfileRefresh(username) {
  // silent refresh of open popup (keeps modal open, no flicker)
  const body = document.getElementById('frProfileBody');
  if (!body) return;
  const mySeq = ++frProfSeq;
  try {
    const [u, rel] = await Promise.all([
      fetch('/api/users/' + encodeURIComponent(username)).then(r => r.json()),
      frReq('/api/relationship/' + encodeURIComponent(username)).catch(() => ({ status: 'none', requestId: null }))
    ]);
    if (mySeq !== frProfSeq) return;
    const m = document.getElementById('frProfileModal');
    if (!m || !m.classList.contains('show')) return;
    body.innerHTML = frProfileHtml(u, username);
  } catch {}
}

function frWhen(iso) {
  try {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

async function frAct(path, btn, okMsg) {
  if (btn) btn.disabled = true;
  try {
    const r = await frReq(path, { method: 'POST' });
    if (okMsg) frToast(typeof okMsg === 'function' ? okMsg(r) : okMsg);
    await renderFriendsModal();
  } catch (e) { frToast(e.message); if (btn) btn.disabled = false; }
}

function frBindActionButtons(root) {
  root.querySelectorAll('[data-fr-user]').forEach(row => {
    row.onclick = e => {
      if (e.target.closest('button')) return;
      openFrProfile(row.getAttribute('data-fr-user'));
    };
  });
  root.querySelectorAll('[data-fr-add]').forEach(b => b.onclick = async e => {
    e.stopPropagation(); b.disabled = true;
    try {
      const r = await frReq('/api/friend-requests', { method: 'POST', body: { username: b.getAttribute('data-fr-add') } });
      frToast(r.autoAccepted ? 'Теперь вы друзья 🤝' : 'Заявка отправлена 🤝');
      await renderFriendsModal();
      const s = document.getElementById('friendsSearch'); if (s && s.value.trim()) frSearchNow(s.value.trim());
    } catch (e2) { frToast(e2.message); b.disabled = false; }
  });
  root.querySelectorAll('[data-fr-accept-id]').forEach(b => b.onclick = e => { e.stopPropagation(); frAct('/api/friend-requests/' + b.getAttribute('data-fr-accept-id') + '/accept', b, 'Заявка принята 🤝'); });
  root.querySelectorAll('[data-fr-reject-id]').forEach(b => b.onclick = e => { e.stopPropagation(); frAct('/api/friend-requests/' + b.getAttribute('data-fr-reject-id') + '/reject', b, null); });
  root.querySelectorAll('[data-fr-cancel-id]').forEach(b => b.onclick = e => { e.stopPropagation(); frAct('/api/friend-requests/' + b.getAttribute('data-fr-cancel-id') + '/cancel', b, 'Заявка отменена'); });
  root.querySelectorAll('[data-fr-remove]').forEach(b => b.onclick = async e => {
    e.stopPropagation();
    if (!confirm('Удалить из друзей?')) return;
    b.disabled = true;
    try { await frReq('/api/friends/remove', { method: 'POST', body: { username: b.getAttribute('data-fr-remove') } }); frToast('Удалено из друзей'); await renderFriendsModal(); }
    catch (e2) { frToast(e2.message); b.disabled = false; }
  });
}

let frRenderSeq = 0;
let frDataKey = null;
async function renderFriendsModal(opts) {
  opts = opts || {};
  const modal = document.getElementById('friendsModal');
  if (!modal || !modal.classList.contains('show')) return;
  const mySeq = ++frRenderSeq;
  const listEl = document.getElementById('friendsList');
  const incSec = document.getElementById('friendsIncomingSec');
  const incList = document.getElementById('friendsIncomingList');
  const outSec = document.getElementById('friendsOutgoingSec');
  const outList = document.getElementById('friendsOutgoingList');
  const countEl = document.getElementById('friendsCount');
  const guestHint = document.getElementById('friendsGuestHint');
  // loading placeholder only on manual open / first paint — never on background refresh
  if (opts.loading && !frDataKey) listEl.innerHTML = '<div class="fr-empty">Загрузка...</div>';
  try {
    const [f, inc, out] = await Promise.all([
      frReq('/api/friends'),
      frReq('/api/friend-requests/incoming'),
      frReq('/api/friend-requests/outgoing')
    ]);
    if (mySeq !== frRenderSeq) return; // stale response — discard (fixes "need reopen" race)
    if (!modal.classList.contains('show')) return;
    // skip DOM update when nothing changed (silent background tick)
    const key = JSON.stringify([
      (f.friends || []).map(u => u.username),
      (inc.requests || []).map(r => r.id),
      (out.requests || []).map(r => r.id)
    ]);
    if (opts.silent && key === frDataKey) return;
    frDataKey = key;
    if (guestHint) guestHint.style.display = 'none';
    if (countEl) countEl.textContent = (f.friends || []).length ? `· ${(f.friends || []).length}` : '';
    if ((inc.requests || []).length) {
      incSec.style.display = '';
      incList.innerHTML = inc.requests.map(rq => frUserRow(rq.user,
        `<button class="fr-btn accept" data-fr-accept-id="${frEsc(rq.id)}" title="Принять">✓</button><button class="fr-btn ghost" data-fr-reject-id="${frEsc(rq.id)}" title="Отклонить">✕</button>`,
        frWhen(rq.createdAt))).join('');
    } else { incSec.style.display = 'none'; incList.innerHTML = ''; }
    if ((out.requests || []).length) {
      outSec.style.display = '';
      outList.innerHTML = out.requests.map(rq => frUserRow(rq.user,
        `<button class="fr-btn ghost" data-fr-cancel-id="${frEsc(rq.id)}" title="Отменить">↩</button>`,
        'заявка отправлена')).join('');
    } else { outSec.style.display = 'none'; outList.innerHTML = ''; }
    listEl.innerHTML = (f.friends || []).length
      ? f.friends.map(u => frUserRow(u, `<button class="fr-btn ghost" data-fr-remove="${frEsc(u.username)}" title="Удалить">✕</button>`)).join('')
      : '<div class="fr-empty">Пока друзей нет — найди людей через поиск выше</div>';
    frBindActionButtons(modal);
  } catch (e) {
    if (mySeq !== frRenderSeq) return;
    if (/именем пользователя|Не авторизован/i.test(e.message || '') && guestHint) guestHint.style.display = '';
    listEl.innerHTML = `<div class="fr-empty">${frEsc(e.message)}</div>`;
    if (incSec) incSec.style.display = 'none';
    if (outSec) outSec.style.display = 'none';
  }
}

let frSearchTimer = null;
let frSearchSeq = 0;
async function frSearchNow(q) {
  const box = document.getElementById('friendsSearchResults');
  const mySeq = ++frSearchSeq;
  try {
    const j = await frReq('/api/search/users?q=' + encodeURIComponent(q));
    if (mySeq !== frSearchSeq) return;
    if (!(j.users || []).length) { box.innerHTML = '<div class="fr-empty">Никого не нашли. Проверь @username.</div>'; return; }
    box.innerHTML = j.users.map(u => frUserRow(u, frRelButton(u))).join('');
    frBindActionButtons(box);
  } catch (e) {
    if (mySeq !== frSearchSeq) return;
    box.innerHTML = `<div class="fr-empty">${frEsc(e.message)}</div>`;
  }
}

function bindFriendsNav() {
  if (frIsGuest()) return; // гостям раздел друзей недоступен
  const btn = document.getElementById('friendsBtnNav');
  const modal = document.getElementById('friendsModal');
  if (!btn || !modal || btn.dataset.frBound) return;
  btn.dataset.frBound = '1';
  btn.onclick = () => {
    modal.classList.add('show');
    const s = document.getElementById('friendsSearch');
    if (s) { s.value = ''; }
    document.getElementById('friendsSearchResults').innerHTML = '';
    frDataKey = null; // fresh paint on open
    renderFriendsModal({ loading: true });
  };
  document.getElementById('friendsClose').onclick = () => modal.classList.remove('show');
  modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('show'); });
  const s = document.getElementById('friendsSearch');
  s.addEventListener('input', () => {
    clearTimeout(frSearchTimer);
    const v = s.value.trim();
    if (!v) { document.getElementById('friendsSearchResults').innerHTML = ''; return; }
    frSearchTimer = setTimeout(() => frSearchNow(v), 350);
  });
  frUpdateNavBadge();
}

// --- single polling loop: toast for new requests + nav dot ---
let frLastIncoming = null;
async function frTick() {
  if (!frToken() || frIsGuest()) return;
  try {
    const j = await frReq('/api/friends/summary');
    if (frLastIncoming !== null && j.incoming > frLastIncoming) frToast('Новая заявка в друзья! Открой раздел «Друзья» 🤝');
    frLastIncoming = j.incoming;
    const btn = document.getElementById('friendsBtnNav');
    if (btn) {
      let dot = btn.querySelector('.fr-dot');
      if (j.incoming > 0) {
        btn.classList.add('has-incoming');
        if (!dot) { dot = document.createElement('span'); dot.className = 'fr-dot'; btn.appendChild(dot); }
        dot.textContent = j.incoming > 9 ? '9+' : String(j.incoming);
      } else {
        btn.classList.remove('has-incoming');
        if (dot) dot.remove();
      }
    }
    const modal = document.getElementById('friendsModal');
    if (modal && modal.classList.contains('show') && document.hasFocus()) renderFriendsModal({ silent: true });
  } catch {}
}
async function frUpdateNavBadge() { await frTick(); }
setInterval(frTick, 25000);
bindFriendsNav();
setTimeout(() => { try { frTick(); } catch {} }, 3000);

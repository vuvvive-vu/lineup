// ======================= FRIENDS =======================

function frEsc(s){ return escapeHtml(s||''); }
function frAvatarHtml(u, size){
  size = size || 44;
  const name = u.displayName || u.username || '?';
  if (u.avatar && String(u.avatar).startsWith('data:image/')) {
    return `<div class="fr-ava" style="width:${size}px;height:${size}px;"><img src="${u.avatar}" alt=""></div>`;
  }
  return `<div class="fr-ava" style="width:${size}px;height:${size}px;background:${avatarBg(name)};color:#fff;">${frEsc(letterFor(name))}</div>`;
}

let frToastTimer=null;
function frToast(msg){
  let el=document.getElementById('frToast');
  if(!el){
    el=document.createElement('div');
    el.id='frToast';
    document.body.appendChild(el);
  }
  el.textContent=msg;
  el.classList.add('show');
  clearTimeout(frToastTimer);
  frToastTimer=setTimeout(()=>el.classList.remove('show'), 3500);
}

// --- friends modal ---
const friendsModal=document.getElementById('friendsModal');
const friendsBtnNav=document.getElementById('friendsBtnNav');
function frReq(path, opts){
  opts=opts||{};
  return fetch(path, { method: opts.method||'GET', headers:{ 'Content-Type':'application/json', Authorization:'Bearer '+token() }, body: opts.body?JSON.stringify(opts.body):undefined }).then(async r=>{
    const j=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(j.error||'Ошибка');
    return j;
  });
}

function frUserRow(u, rightHtml, opts){
  opts=opts||{};
  return `<div class="fr-row" data-open-user="${frEsc(u.username||'')}" ${opts.rowAttrs||''}>
    ${frAvatarHtml(u)}
    <div class="fr-row-info">
      <div class="fr-row-name">${frEsc(u.displayName||u.username)}</div>
      <div class="fr-row-handle">${u.username?'@'+frEsc(u.username):''}${opts.sub?` <span style="color:#6a6a6a;">· ${opts.sub}</span>`:''}</div>
    </div>
    <div class="fr-row-actions">${rightHtml||''}</div>
  </div>`;
}

function frBindRows(container){
  container.querySelectorAll('[data-open-user]').forEach(row=>{
    row.onclick=(e)=>{
      if(e.target.closest('button')) return;
      const uname=row.getAttribute('data-open-user');
      if(!uname) return;
      friendsModal.classList.remove('show');
      openViewProfileIndex(uname);
    };
  });
}

async function renderFriendsModal(){
  const listEl=document.getElementById('friendsList');
  const incSec=document.getElementById('friendsIncomingSec');
  const incList=document.getElementById('friendsIncomingList');
  const outSec=document.getElementById('friendsOutgoingSec');
  const outList=document.getElementById('friendsOutgoingList');
  listEl.innerHTML='<div class="fr-empty">Загрузка...</div>';
  try{
    const [f, inc, out] = await Promise.all([
      frReq('/api/friends'),
      frReq('/api/friend-requests/incoming'),
      frReq('/api/friend-requests/outgoing')
    ]);
    // incoming
    if(inc.requests.length){
      incSec.style.display='';
      incList.innerHTML=inc.requests.map(rq=>frUserRow(rq.user,
        `<button class="fr-btn accept" data-fr-accept="${rq.id}" title="Принять">✓</button>
         <button class="fr-btn reject" data-fr-reject="${rq.id}" title="Отклонить">✕</button>`,
        { sub: new Date(rq.createdAt).toLocaleString('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}) }
      )).join('');
    } else { incSec.style.display='none'; incList.innerHTML=''; }
    // outgoing
    if(out.requests.length){
      outSec.style.display='';
      outList.innerHTML=out.requests.map(rq=>frUserRow(rq.user,
        `<button class="fr-btn ghost" data-fr-cancel="${rq.id}" title="Отменить заявку">↩</button>`,
        { sub: 'заявка отправлена' }
      )).join('');
    } else { outSec.style.display='none'; outList.innerHTML=''; }
    // friends
    if(f.friends.length){
      listEl.innerHTML=f.friends.map(u=>frUserRow(u,
        `<button class="fr-btn ghost" data-fr-remove="${frEsc(u.username)}" title="Удалить из друзей">🗑</button>`
      )).join('');
    } else {
      listEl.innerHTML=`<div class="fr-empty">Пока друзей нет. Найдите людей через поиск выше!</div>`;
    }
    frBindRows(listEl); frBindRows(incList); frBindRows(outList);
    incList.querySelectorAll('[data-fr-accept]').forEach(b=>b.onclick=async()=>{
      b.disabled=true;
      try{ await frReq('/api/friend-requests/'+b.getAttribute('data-fr-accept')+'/accept',{method:'POST'}); frToast('Заявка принята'); renderFriendsModal(); }catch(e){ frToast(e.message); b.disabled=false; }
    });
    incList.querySelectorAll('[data-fr-reject]').forEach(b=>b.onclick=async()=>{
      b.disabled=true;
      try{ await frReq('/api/friend-requests/'+b.getAttribute('data-fr-reject')+'/reject',{method:'POST'}); renderFriendsModal(); }catch(e){ frToast(e.message); b.disabled=false; }
    });
    outList.querySelectorAll('[data-fr-cancel]').forEach(b=>b.onclick=async()=>{
      b.disabled=true;
      try{ await frReq('/api/friend-requests/'+b.getAttribute('data-fr-cancel')+'/cancel',{method:'POST'}); renderFriendsModal(); }catch(e){ frToast(e.message); b.disabled=false; }
    });
    listEl.querySelectorAll('[data-fr-remove]').forEach(b=>b.onclick=async(e)=>{
      e.stopPropagation();
      if(!confirm('Удалить пользователя из друзей?')) { return; }
      b.disabled=true;
      try{ await frReq('/api/friends/remove',{method:'POST',body:{username:b.getAttribute('data-fr-remove')}}); frToast('Удалено из друзей'); renderFriendsModal(); }catch(e2){ frToast(e2.message); b.disabled=false; }
    });
  }catch(e){
    listEl.innerHTML=`<div class="fr-empty">${frEsc(e.message)}</div>`;
    incSec.style.display='none'; outSec.style.display='none';
  }
}

let frSearchTimer=null;
const friendsSearchInput=document.getElementById('friendsSearch');
const friendsSearchResults=document.getElementById('friendsSearchResults');
if(friendsSearchInput){
  friendsSearchInput.addEventListener('input', ()=>{
    clearTimeout(frSearchTimer);
    const v=friendsSearchInput.value.trim();
    if(!v){ friendsSearchResults.innerHTML=''; return; }
    frSearchTimer=setTimeout(async()=>{
      try{
        const j=await frReq('/api/search/users?q='+encodeURIComponent(v));
        if(!j.users.length){ friendsSearchResults.innerHTML=`<div class="fr-empty">Пользователь не найден</div>`; return; }
        friendsSearchResults.innerHTML=j.users.map(u=>frUserRow(u,
          `<button class="fr-btn accept" data-fr-add="${frEsc(u.username)}" title="Добавить в друзья">＋</button>`
        )).join('');
        frBindRows(friendsSearchResults);
        friendsSearchResults.querySelectorAll('[data-fr-add]').forEach(b=>b.onclick=async(e)=>{
          e.stopPropagation();
          b.disabled=true;
          try{
            const r=await frReq('/api/friend-requests',{method:'POST',body:{username:b.getAttribute('data-fr-add')}});
            frToast(r.autoAccepted ? 'Теперь вы друзья' : 'Заявка отправлена');
            renderFriendsModal();
            b.textContent='✓'; b.classList.add('ghost'); b.disabled=true;
          }catch(e2){ frToast(e2.message); b.disabled=false; }
        });
      }catch(e){ friendsSearchResults.innerHTML=`<div class="fr-empty">${frEsc(e.message)}</div>`; }
    }, 350);
  });
}

if(friendsBtnNav){
  friendsBtnNav.onclick=()=>{
    friendsModal.classList.add('show');
    friendsSearchInput.value='';
    friendsSearchResults.innerHTML='';
    renderFriendsModal();
  };
}
const friendsCloseBtn=document.getElementById('friendsClose');
if(friendsCloseBtn) friendsCloseBtn.onclick=()=>friendsModal.classList.remove('show');
if(friendsModal) friendsModal.addEventListener('click', e=>{ if(e.target===friendsModal) friendsModal.classList.remove('show'); });

// --- view other profile (index) ---
const vpModal=document.getElementById('viewProfileModalIndex');
const vpAvaLarge=document.getElementById('vpAvaLarge');
const svgUserPlus=`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="16" y1="11" x2="22" y2="11"/></svg>`;

function frActionBtnsFor(status){
  if(status==='self') return '';
  if(status==='none') return `<button class="fr-action primary" id="vpAddBtn">${svgUserPlus} <span>Добавить в друзья</span></button>`;
  if(status==='pending_sent') return `<button class="fr-action ghost" id="vpCancelBtn">Отменить заявку</button>`;
  if(status==='pending_received') return `<button class="fr-action primary" id="vpAcceptBtn">✓ Принять заявку</button><button class="fr-action ghost" id="vpRejectBtn">Отклонить</button>`;
  if(status==='accepted') return `<button class="fr-action ghost" id="vpRemoveBtn">✓ Друзья</button>`;
  return '';
}

function vpBindActions(username){
  const add=document.getElementById('vpAddBtn');
  if(add) add.onclick=async()=>{
    add.disabled=true;
    try{
      const r=await frReq('/api/friend-requests',{method:'POST',body:{username}});
      frToast(r.autoAccepted ? 'Теперь вы друзья' : 'Заявка отправлена');
      openViewProfileIndex(username);
    }catch(e){ frToast(e.message); add.disabled=false; }
  };
  const cancel=document.getElementById('vpCancelBtn');
  if(cancel) cancel.onclick=async()=>{
    cancel.disabled=true;
    try{
      const rel=await frReq('/api/relationship/'+encodeURIComponent(username));
      await frReq('/api/friend-requests/'+rel.requestId+'/cancel',{method:'POST'});
      frToast('Заявка отменена'); openViewProfileIndex(username);
    }catch(e){ frToast(e.message); cancel.disabled=false; }
  };
  const accept=document.getElementById('vpAcceptBtn');
  if(accept) accept.onclick=async()=>{
    accept.disabled=true;
    try{
      const rel=await frReq('/api/relationship/'+encodeURIComponent(username));
      await frReq('/api/friend-requests/'+rel.requestId+'/accept',{method:'POST'});
      frToast('Заявка принята'); openViewProfileIndex(username);
    }catch(e){ frToast(e.message); accept.disabled=false; }
  };
  const reject=document.getElementById('vpRejectBtn');
  if(reject) reject.onclick=async()=>{
    reject.disabled=true;
    try{
      const rel=await frReq('/api/relationship/'+encodeURIComponent(username));
      await frReq('/api/friend-requests/'+rel.requestId+'/reject',{method:'POST'});
      openViewProfileIndex(username);
    }catch(e){ frToast(e.message); reject.disabled=false; }
  };
  const remove=document.getElementById('vpRemoveBtn');
  if(remove) remove.onclick=async()=>{
    if(!confirm('Удалить пользователя из друзей?')) { openViewProfileIndex(username); return; }
    remove.disabled=true;
    try{
      await frReq('/api/friends/remove',{method:'POST',body:{username}});
      frToast('Удалено из друзей'); openViewProfileIndex(username);
    }catch(e){ frToast(e.message); remove.disabled=false; }
  };
}

async function openViewProfileIndex(username){
  vpModal.classList.add('show');
  vpAvaLarge.textContent='…';
  document.getElementById('vpDisplayName').textContent='…';
  document.getElementById('vpHandle').textContent='@'+username;
  document.getElementById('vpBio').textContent='…';
  document.getElementById('vpActions').innerHTML='';
  try{
    const [u, rel] = await Promise.all([
      fetch('/api/users/'+encodeURIComponent(username)).then(r=>r.json()),
      token() ? frReq('/api/relationship/'+encodeURIComponent(username)).catch(()=>({status:'none',requestId:null})) : Promise.resolve({status:'none',requestId:null})
    ]);
    const disp=u.displayName||u.username||username;
    if(u.avatar && u.avatar.startsWith('data:image/')){ vpAvaLarge.innerHTML=`<img src="${u.avatar}" alt="">`; vpAvaLarge.classList.add('has-photo'); vpAvaLarge.style.background=''; }
    else { vpAvaLarge.textContent=letterFor(disp); vpAvaLarge.style.background=avatarBg(disp); vpAvaLarge.style.color='#fff'; vpAvaLarge.classList.remove('has-photo'); }
    document.getElementById('vpDisplayName').textContent=disp;
    document.getElementById('vpHandle').textContent=u.username?'@'+u.username:'';
    const bio=(u.bio||'').trim();
    document.getElementById('vpBio').textContent=bio||'—';
    document.getElementById('vpBioRow').style.display=bio?'':'none';
    if(u.createdAt){ const d=new Date(u.createdAt); if(!isNaN(d)) document.getElementById('vpJoinedDate').textContent=d.toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'}); }
    // badge (same presets as room profile card)
    const badgeRaw=u.activeBadge||u.badge||(u.isCreator?'founder':null);
    const badge=badgeRaw==='developer'?'founder':badgeRaw;
    if(typeof applyBadgeToProfile==='function'){
      applyBadgeToProfile(document.getElementById('vpAvaWrap'), document.getElementById('vpCrownIcon'), document.getElementById('vpCreatorBadge'), badge, !u.username);
    }
    // actions
    const actions=document.getElementById('vpActions');
    actions.innerHTML=frActionBtnsFor(rel.status);
    vpBindActions(u.username||username);
  }catch(e){
    document.getElementById('vpDisplayName').textContent='Пользователь не найден';
    document.getElementById('vpHandle').textContent='';
    document.getElementById('vpBio').textContent='';
    document.getElementById('vpBioRow').style.display='none';
    document.getElementById('vpJoinedDate').textContent='—';
  }
}

const vpCloseBtn=document.getElementById('vpClose');
if(vpCloseBtn) vpCloseBtn.onclick=()=>vpModal.classList.remove('show');
if(vpModal) vpModal.addEventListener('click', e=>{ if(e.target===vpModal) vpModal.classList.remove('show'); });

// --- notifications polling (incoming requests) ---
let frLastIncoming=null;
async function frPoll(){
  if(!token()) return;
  try{
    const j=await frReq('/api/friends/summary');
    if(frLastIncoming===null){ frLastIncoming=j.incoming; return; }
    if(j.incoming>frLastIncoming){
      frToast('Новая заявка в друзья! Открой раздел Друзья');
    }
    frLastIncoming=j.incoming;
  }catch{}
}
setInterval(frPoll, 20000);
frPoll();

// badge dot on friends nav button
async function frUpdateNavBadge(){
  if(!friendsBtnNav || !token()) return;
  try{
    const j=await frReq('/api/friends/summary');
    let dot=friendsBtnNav.querySelector('.fr-dot');
    if(j.incoming>0){
      if(!dot){ dot=document.createElement('span'); dot.className='fr-dot'; friendsBtnNav.appendChild(dot); }
    } else if(dot){ dot.remove(); }
  }catch{}
}
frUpdateNavBadge();
setInterval(frUpdateNavBadge, 20000);

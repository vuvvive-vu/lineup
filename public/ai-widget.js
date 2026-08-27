(() => {
  // only on lobby page (index.html) вЂ” has #lobby
  if (!document.getElementById('lobby')) return;

  const LS_KEY = 'ai_history_v1';
  let history = [];
  try { history = JSON.parse(localStorage.getItem(LS_KEY) || '[]'); if(!Array.isArray(history)) history=[]; } catch { history=[]; }
  history = history.slice(-12);

  function saveHistory(){ try{ localStorage.setItem(LS_KEY, JSON.stringify(history.slice(-20))); }catch{} }

  function esc(s){ return (s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  // create FAB
  const fab = document.createElement('button');
  fab.id = 'aiFab';
  fab.setAttribute('aria-label','РР РїРѕРјРѕС‰РЅРёРє');
  fab.title = 'РР РїРѕРјРѕС‰РЅРёРє';
  fab.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 3l1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7L12 3z"/>
      <path d="M19 13l1 2.2L22 16l-2 0.8L19 19l-1-2.2L16 16l2-.8L19 13z"/>
      <path d="M5 13l1 1.6L8 16l-2 1.4L5 19l-1-1.6L2 16l2-1.4L5 13z"/>
    </svg>
    <span class="aiFab-dot" aria-hidden="true"></span>
  `;

  const panel = document.createElement('div');
  panel.id = 'aiPanel';
  panel.setAttribute('role','dialog');
  panel.setAttribute('aria-label','Р§Р°С‚ СЃ РР');
  panel.innerHTML = `
    <div class="ai-head">
      <div class="ai-head-left">
        <div class="ai-head-icon">вњ¦</div>
        <div>
          <div class="ai-head-title">РР РїРѕРјРѕС‰РЅРёРє</div>
          <div class="ai-head-sub">togetherly</div>
        </div>
      </div>
      <div class="ai-head-actions">
        <button id="aiClear" title="РћС‡РёСЃС‚РёС‚СЊ">рџ—‘</button>
        <button id="aiClose" title="Р—Р°РєСЂС‹С‚СЊ">вњ•</button>
      </div>
    </div>
    <div class="ai-messages" id="aiMessages"></div>
    <div class="ai-hint">Р Р°СЃСЃРєР°Р¶Сѓ РїСЂРѕ СЃРµСЂРІРёСЃ, РїРѕРјРѕРіСѓ СЃ РЅР°СЃС‚СЂРѕР№РєРѕР№!</div>
    <div class="ai-input">
      <input id="aiInput" placeholder="РЎРїСЂРѕСЃРё РїСЂРѕ togetherly РёР»Рё РІРєР»СЋС‡Рё РІРёРґРµРѕ..." maxlength="500" autocomplete="off" />
      <button id="aiSend" class="ai-send" aria-label="РћС‚РїСЂР°РІРёС‚СЊ">вћ¤</button>
    </div>
  `;

  const overlay = document.createElement('div');
  overlay.id = 'aiOverlay';
  document.body.appendChild(fab);
  document.body.appendChild(overlay);
  document.body.appendChild(panel);

  const msgsEl = panel.querySelector('#aiMessages');
  const inputEl = panel.querySelector('#aiInput');
  const sendBtn = panel.querySelector('#aiSend');
  const closeBtn = panel.querySelector('#aiClose');
  const clearBtn = panel.querySelector('#aiClear');

  function linkify(s){
    const esc = (x)=> x.replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    return esc(s).replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" style="color:#7c3aed;text-decoration:underline;word-break:break-all;">$1</a>');
  }
  function addBubble(role, text, opts){
    const div = document.createElement('div');
    div.className = 'ai-bubble ' + (role === 'user' ? 'user' : 'assistant');
    if (opts && opts.html) div.innerHTML = opts.html;
    else div.innerHTML = linkify(text);
    msgsEl.appendChild(div);
    msgsEl.scrollTop = msgsEl.scrollHeight;
    return div;
  }
  function addTyping(){
    const d = document.createElement('div');
    d.className = 'ai-bubble assistant typing';
    d.innerHTML = '<span>РР РїРµС‡Р°С‚Р°РµС‚</span><i></i><i></i><i></i>';
    msgsEl.appendChild(d);
    msgsEl.scrollTop = msgsEl.scrollHeight;
    return d;
  }
  function addCard(code, title){
    const card = document.createElement('div');
    card.className = 'ai-card';
    card.innerHTML = `
      <div class="ai-card-title">вњ… РљРѕРјРЅР°С‚Р° СЃРѕР·РґР°РЅР° вЂ” ${esc(title||'Р‘РµР· РЅР°Р·РІР°РЅРёСЏ')}</div>
      <div class="ai-card-sub">РљРѕРґ: <b>${esc(code)}</b></div>
      <button class="btn-primary">РџРµСЂРµР№С‚Рё РІ РєРѕРјРЅР°С‚Сѓ</button>
    `;
    const btn = card.querySelector('button');
    btn.onclick = () => { location.href = '/room.html?code=' + encodeURIComponent(code); };
    msgsEl.appendChild(card);
    msgsEl.scrollTop = msgsEl.scrollHeight;
  }

  function renderHistory(){
    msgsEl.innerHTML='';
    if(!isRegistered()){
      renderGuestBlock();
      return;
    }
    inputEl.disabled = false;
    inputEl.placeholder = 'РЎРїСЂРѕСЃРё РїСЂРѕ togetherly РёР»Рё РІРєР»СЋС‡Рё РІРёРґРµРѕ...';
    sendBtn.disabled = false;
    if(!history.length){
      addBubble('assistant','РџСЂРёРІРµС‚! РЇ РїРѕРјРѕС‰РЅРёРє СЃРµСЂРІРёСЃР° Togetherly.\n\nР—Р°РґР°РІР°Р№ СЃРІРѕР№ РІРѕРїСЂРѕСЃ РЅРёР¶Рµ, РѕС‚РІРµС‡Сѓ РЅР° РІСЃРµ РєР°СЃР°РµРјРѕ Togetherly.\nРџСЂРёРјРµСЂ: РџСЂРёРІРµС‚, РјРѕР¶РЅРѕ Р»Рё С‚СѓС‚ РґРѕР±Р°РІР»СЏС‚СЊ РґСЂСѓР·РµР№?, РџСЂРёРІРµС‚, РІРєР»СЋС‡Рё СЂР°РЅРґРѕРјРЅС‹Р№ С„РёР»СЊРј.\n\nР“РѕСЃС‚РµРІС‹Рµ Р°РєРєР°СѓРЅС‚С‹ РЅРµ РїРѕРґРґРµСЂР¶РёРІР°СЋС‚ РёСЃРїРѕР»СЊР·РѕРІР°РЅРёРµ РР-РїРѕРјРѕС‰РЅРёРєР°.\nР”Р»СЏ РґРѕСЃС‚СѓРїР° Рє РїРѕР»РЅРѕРјСѓ С„СѓРЅРєС†РёРѕРЅР°Р»Сѓ Р·Р°СЂРµРіРёСЃС‚СЂРёСЂСѓР№С‚РµСЃСЊ СЃ РёСЃРїРѕР»СЊР·РѕРІР°РЅРёРµРј СЌР»РµРєС‚СЂРѕРЅРЅРѕР№ РїРѕС‡С‚С‹.');
    } else {
      for(const m of history){
        addBubble(m.role, m.content);
        if(m.card) addCard(m.card.code, m.card.title);
      }
    }
  }
  renderHistory();

  function open(){
    syncFab();
    if(!isRegistered()){
      panel.classList.add('open');
      overlay.classList.add('open');
      renderHistory();
      return;
    }
    panel.classList.add('open');
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    renderHistory();
    setTimeout(()=>{ inputEl.focus(); msgsEl.scrollTop = msgsEl.scrollHeight; }, 50);
  }
  function close(){
    panel.classList.remove('open');
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  }
  fab.onclick = () => { if(panel.classList.contains('open')) close(); else open(); };
  closeBtn.onclick = close;
  overlay.onclick = close;
  clearBtn.onclick = () => { history=[]; saveHistory(); renderHistory(); };
  document.addEventListener('keydown', e=>{ if(e.key==='Escape' && panel.classList.contains('open')) close(); });

  function isRegistered(){
    return !!localStorage.getItem('rave_email');
  }
  // hide FAB on auth screen + С‚РѕР»СЊРєРѕ РґР»СЏ Р·Р°СЂРµРіРёСЃС‚СЂРёСЂРѕРІР°РЅРЅС‹С… (РіРѕСЃС‚СЏРј вЂ” СЃРєСЂС‹С‚)
  function syncFab(){
    const lobby = document.getElementById('lobby');
    const lobbyVisible = lobby && lobby.classList.contains('show');
    if (lobbyVisible && isRegistered()) fab.style.display='grid';
    else fab.style.display='none';
    // С‚Р°РєР¶Рµ Р±Р»РѕРєРёСЂСѓРµРј РїР°РЅРµР»СЊ РґР»СЏ РіРѕСЃС‚РµР№
    if(!isRegistered() && panel.classList.contains('open')){
      panel.classList.remove('open');
      overlay.classList.remove('open');
      document.body.style.overflow='';
    }
  }
  // РµСЃР»Рё РіРѕСЃС‚СЊ вЂ” РїРѕРєР°Р·С‹РІР°РµРј РїРѕРґСЃРєР°Р·РєСѓ РІРјРµСЃС‚Рѕ С‡Р°С‚Р°
  function renderGuestBlock(){
    msgsEl.innerHTML='';
    addBubble('assistant','РР-РїРѕРјРѕС‰РЅРёРє РґРѕСЃС‚СѓРїРµРЅ С‚РѕР»СЊРєРѕ РґР»СЏ Р·Р°СЂРµРіРёСЃС‚СЂРёСЂРѕРІР°РЅРЅС‹С… РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№.\n\nР’РѕР№РґРёС‚Рµ С‡РµСЂРµР· РїРѕС‡С‚Сѓ вЂ” РіРѕСЃС‚РµРІС‹Рµ Р°РєРєР°СѓРЅС‚С‹ РЅРµ РїРѕРґРґРµСЂР¶РёРІР°СЋС‚СЃСЏ.\nР—Р°СЂРµРіРёСЃС‚СЂРёСЂСѓР№С‚РµСЃСЊ, С‡С‚РѕР±С‹ СЃРїСЂР°С€РёРІР°С‚СЊ РїСЂРѕ СЃРµСЂРІРёСЃ Рё РІРєР»СЋС‡Р°С‚СЊ РІРёРґРµРѕ РїРѕ РЅР°Р·РІР°РЅРёСЋ.');
    inputEl.disabled = true;
    inputEl.placeholder = 'Р”РѕСЃС‚СѓРїРЅРѕ С‚РѕР»СЊРєРѕ РїРѕСЃР»Рµ РІС…РѕРґР° С‡РµСЂРµР· РїРѕС‡С‚Сѓ';
    sendBtn.disabled = true;
  }
  // observe lobby class changes
  const lobbyEl = document.getElementById('lobby');
  if(lobbyEl){
    const mo = new MutationObserver(syncFab);
    mo.observe(lobbyEl, {attributes:true, attributeFilter:['class']});
  }
  const authEl = document.getElementById('authScreen');
  if(authEl){
    const mo2 = new MutationObserver(syncFab);
    mo2.observe(authEl, {attributes:true, attributeFilter:['style']});
  }
  setInterval(syncFab, 800);
  setTimeout(syncFab, 400);

  async function send(){
    if(!isRegistered()){
      renderGuestBlock();
      return;
    }
    const text = inputEl.value.trim();
    if(!text || sendBtn.disabled) return;
    history.push({role:'user', content:text});
    addBubble('user', text);
    saveHistory();
    inputEl.value='';
    sendBtn.disabled = true;
    inputEl.disabled = true;
    const typing = addTyping();
    try{
      const token = localStorage.getItem('rave_token') || '';
      const r = await fetch('/api/ai/chat', {
        method:'POST',
        headers:{ 'Content-Type':'application/json', ...(token?{Authorization:'Bearer '+token}:{}) },
        body: JSON.stringify({ message:text, history: history.slice(0,-1).slice(-4).map(h=>({role:h.role, content:h.content})) })
      });
      const j = await r.json().catch(()=> ({}));
      typing.remove();
      if(!r.ok){
        if(r.status===403 && j.guestBlocked){
          addBubble('assistant', j.error);
          history.push({role:'assistant', content: j.error});
          renderGuestBlock();
        } else {
          addBubble('assistant', j.error || 'РћС€РёР±РєР°. РџРѕРїСЂРѕР±СѓР№ РµС‰С‘ СЂР°Р·.');
          history.push({role:'assistant', content: j.error||'РћС€РёР±РєР°'});
        }
      } else {
        const reply = (j.reply||'').toString().trim() || 'Р“РѕС‚РѕРІРѕ.';
        addBubble('assistant', reply);
        history.push({role:'assistant', content:reply});
        if(j.action && j.action.type==='room_created'){
          addCard(j.action.code, reply.slice(0,60));
          history[history.length-1].card = {code:j.action.code, title: reply.slice(0,60)};
          // auto-redirect after 1.2s
          setTimeout(()=>{ location.href = j.action.url; }, 900);
        } else if(j.needAuth){
          const tip = document.createElement('div');
          tip.className='ai-bubble assistant';
          tip.textContent = 'Р’РѕР№РґРё/Р·Р°СЂРµРіРёСЃС‚СЂРёСЂСѓР№СЃСЏ Рё РїРѕРІС‚РѕСЂРё вЂ” СЃСЂР°Р·Сѓ СЃРѕР·РґР°Рј РєРѕРјРЅР°С‚Сѓ.';
          msgsEl.appendChild(tip);
        }
        if(j.foundUrl){
          const d=document.createElement('div');
          d.className='ai-bubble assistant';
          d.innerHTML = 'РќР°С€С‘Р»: <span style="color:#7c3aed;word-break:break-all;">'+esc(j.foundUrl)+'</span>';
          msgsEl.appendChild(d);
        }
      }
    }catch(e){
      typing.remove();
      addBubble('assistant','РЎРµС‚СЊ РЅРµРґРѕСЃС‚СѓРїРЅР°. РџРѕРїСЂРѕР±СѓР№ РµС‰С‘ СЂР°Р·.');
      history.push({role:'assistant', content:'РЎРµС‚СЊ РЅРµРґРѕСЃС‚СѓРїРЅР°'});
    } finally {
      sendBtn.disabled=false;
      inputEl.disabled=false;
      inputEl.focus();
      saveHistory();
      msgsEl.scrollTop = msgsEl.scrollHeight;
    }
  }
  sendBtn.onclick = send;
  inputEl.addEventListener('keydown', e=>{ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); send(); } });
})();


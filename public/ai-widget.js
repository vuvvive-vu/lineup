(() => {
  // only on lobby page (index.html) — has #lobby
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
  fab.setAttribute('aria-label','ИИ помощник');
  fab.title = 'ИИ помощник';
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
  panel.setAttribute('aria-label','Чат с ИИ');
  panel.innerHTML = `
    <div class="ai-head">
      <div class="ai-head-left">
        <div class="ai-head-icon">✦</div>
        <div>
          <div class="ai-head-title">ИИ помощник</div>
          <div class="ai-head-sub">togetherly</div>
        </div>
      </div>
      <div class="ai-head-actions">
        <button id="aiClear" title="Очистить">🗑</button>
        <button id="aiClose" title="Закрыть">✕</button>
      </div>
    </div>
    <div class="ai-messages" id="aiMessages"></div>
    <div class="ai-hint">Расскажу про сервис, помогу с настройкой!</div>
    <div class="ai-input">
      <input id="aiInput" placeholder="Спроси про togetherly или включи видео..." maxlength="500" autocomplete="off" />
      <button id="aiSend" class="ai-send" aria-label="Отправить">➤</button>
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
    d.innerHTML = '<span>ИИ печатает</span><i></i><i></i><i></i>';
    msgsEl.appendChild(d);
    msgsEl.scrollTop = msgsEl.scrollHeight;
    return d;
  }
  function addCard(code, title){
    const card = document.createElement('div');
    card.className = 'ai-card';
    card.innerHTML = `
      <div class="ai-card-title">✅ Комната создана — ${esc(title||'Без названия')}</div>
      <div class="ai-card-sub">Код: <b>${esc(code)}</b></div>
      <button class="btn-primary">Перейти в комнату</button>
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
    inputEl.placeholder = 'Спроси про togetherly или включи видео...';
    sendBtn.disabled = false;
    if(!history.length){
      addBubble('assistant','Привет! Я помощник сервиса Togetherly.\n\nЗадавай свой вопрос ниже, отвечу на все касаемо Togetherly.\nПример: Привет, можно ли тут добавлять друзей?, Привет, включи рандомный фильм.\n\nГостевые аккаунты не поддерживают использование ИИ-помощника.\nДля доступа к полному функционалу зарегистрируйтесь с использованием электронной почты.');
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
  // hide FAB on auth screen + только для зарегистрированных (гостям — скрыт)
  function syncFab(){
    const lobby = document.getElementById('lobby');
    const lobbyVisible = lobby && lobby.classList.contains('show');
    if (lobbyVisible && isRegistered()) fab.style.display='grid';
    else fab.style.display='none';
    // также блокируем панель для гостей
    if(!isRegistered() && panel.classList.contains('open')){
      panel.classList.remove('open');
      overlay.classList.remove('open');
      document.body.style.overflow='';
    }
  }
  // если гость — показываем подсказку вместо чата
  function renderGuestBlock(){
    msgsEl.innerHTML='';
    addBubble('assistant','ИИ-помощник доступен только для зарегистрированных пользователей.\n\nВойдите через почту — гостевые аккаунты не поддерживаются.\nЗарегистрируйтесь, чтобы спрашивать про сервис и включать видео по названию.');
    inputEl.disabled = true;
    inputEl.placeholder = 'Доступно только после входа через почту';
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
        body: JSON.stringify({ message:text, history: history.slice(-8).map(h=>({role:h.role, content:h.content})) })
      });
      const j = await r.json().catch(()=> ({}));
      typing.remove();
      if(!r.ok){
        if(r.status===403 && j.guestBlocked){
          addBubble('assistant', j.error);
          history.push({role:'assistant', content: j.error});
          renderGuestBlock();
        } else {
          addBubble('assistant', j.error || 'Ошибка. Попробуй ещё раз.');
          history.push({role:'assistant', content: j.error||'Ошибка'});
        }
      } else {
        const reply = (j.reply||'').toString().trim() || 'Готово.';
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
          tip.textContent = 'Войди/зарегистрируйся и повтори — сразу создам комнату.';
          msgsEl.appendChild(tip);
        }
        if(j.foundUrl){
          const d=document.createElement('div');
          d.className='ai-bubble assistant';
          d.innerHTML = 'Нашёл: <span style="color:#7c3aed;word-break:break-all;">'+esc(j.foundUrl)+'</span>';
          msgsEl.appendChild(d);
        }
      }
    }catch(e){
      typing.remove();
      addBubble('assistant','Сеть недоступна. Попробуй ещё раз.');
      history.push({role:'assistant', content:'Сеть недоступна'});
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

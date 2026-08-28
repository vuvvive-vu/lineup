/**
 * Togetherly Agent — только RuTube, любой фильм, точное понимание
 * Фичи: любой запрос на RuTube, опечатки, транслит, уточнение части
 */
const https = require('https');
const http = require('http');

// --- каталог оставлен только для демо, приоритет у живого поиска RuTube ---
const CATALOG = [
  { keys: ['сумерки 1', 'сумерки первая часть', 'сумерки часть 1', 'twilight 1'], title: 'Сумерки (2008)', platform: 'rutube', videoUrl: 'https://rutube.ru/video/8c4fb4b7b0c1d2e3f4a5b6c7d8e9f111/' },
  { keys: ['сумерки 2', 'сумерки новолуние', 'сумерки вторая часть'], title: 'Сумерки. Сага: Новолуние', platform: 'rutube', videoUrl: 'https://rutube.ru/video/8c4fb4b7b0c1d2e3f4a5b6c7d8e9f222/' },
  { keys: ['сумерки 3', 'сумерки затмение'], title: 'Сумерки. Сага: Затмение', platform: 'rutube', videoUrl: 'https://rutube.ru/video/8c4fb4b7b0c1d2e3f4a5b6c7d8e9f333/' },
  { keys: ['чебурашка'], title: 'Чебурашка (2023)', platform: 'rutube', videoUrl: 'https://rutube.ru/video/8c4fb4b7b0c1d2e3f4a5b6c7d8e9f0a1b/' },
  { keys: ['наруто','naruto','наруто 1 сезон'], title: 'Наруто 1 сезон 1 серия', platform: 'rutube', videoUrl: 'https://rutube.ru/video/ac51c2f08aea7236e6b0942e017f8f81/' },
  { keys: ['маша и медведь','masha i medved','маша'], title: 'Маша и Медведь', platform: 'rutube', videoUrl: 'https://rutube.ru/video/298bc79746a96ed34265b47e46554501/' },
];

function normalize(str){
  return (str||'')
    .toLowerCase()
    .replace(/ё/g,'е')
    .replace(/[^a-zа-я0-9 ]/g,' ')
    .replace(/\s+/g,' ')
    .trim();
}

// латиница -> кириллица для сравнения (best-effort)
const LATIN_MAP = {
  'shch':'щ','sch':'щ','sh':'ш','ch':'ч','kh':'х','zh':'ж','ts':'ц','yo':'ё','yu':'ю','ya':'я','yi':'ый','ye':'е',
  'a':'а','b':'б','c':'ц','d':'д','e':'е','f':'ф','g':'г','h':'х','i':'и','j':'й','k':'к','l':'л','m':'м','n':'н','o':'о','p':'п','q':'к','r':'р','s':'с','t':'т','u':'у','v':'в','w':'в','x':'кс','y':'ы','z':'з','\'':'','`':''
};
function latinToCyr(s){
  s = (s||'').toLowerCase();
  // сначала длинные сочетания
  for(const k of Object.keys(LATIN_MAP).sort((a,b)=>b.length-a.length)){
    s = s.split(k).join(LATIN_MAP[k]);
  }
  return s;
}
function normalizeWithTranslit(str){
  const n = normalize(str);
  if(/[a-z]/.test((str||'').toLowerCase())){
    const t = normalize(latinToCyr(str));
    return [n, t];
  }
  return [n];
}

const AGENT_TRIGGERS = [
  /^(агент|бот|togetherly)?\s*(включи|покажи|запусти|найди|хочу посмотреть)\s+/i,
  /^\/включи\s+/i,
  /^\/play\s+/i,
  /^включи\s+/i,
];

function isAgentQuery(text){
  const t = (text||'').trim();
  if(!t) return false;
  return AGENT_TRIGGERS.some(rx=>rx.test(t));
}

function extractFilmQuery(text){
  let t = (text||'').trim();
  for(const rx of AGENT_TRIGGERS){
    if(rx.test(t)){ t = t.replace(rx,'').trim(); break; }
  }
  // убираем кавычки
  t = t.replace(/[«»"'`]/g,' ').trim();
  t = t.replace(/\b(фильм|фильма|фильму|кино|сериал|сериала|мульт|мультик|мультфильм|пожалуйста|плиз|мне|нам|давай|хочу|посмотреть|включи)\b/gi,' ').trim();
  t = t.replace(/\s+/g,' ').trim();
  const numMap = { 'первая':'1', 'первую':'1', 'первый':'1', 'вторая':'2', 'вторую':'2', 'второй':'2', 'третья':'3', 'третью':'3', 'третий':'3', 'четвертая':'4', 'четвертую':'4', 'четвертый':'4', 'пятая':'5', 'пятую':'5', 'пятый':'5', 'шестая':'6', 'седьмая':'7', 'восьмая':'8' };
  t = t.replace(new RegExp(Object.keys(numMap).join('|'),'gi'), m=>numMap[m.toLowerCase()]||m);
  // "1-я" -> "1"
  t = t.replace(/(\d+)\s*[-—]\s*я/gi,'$1');
  t = t.replace(/\s+/g,' ').trim();
  return t;
}

function levenshtein(a,b){
  if(a===b) return 0;
  if(a.length===0) return b.length;
  if(b.length===0) return a.length;
  const m=a.length, n=b.length;
  const dp=Array(n+1).fill(0).map((_,i)=>i);
  for(let i=1;i<=m;i++){
    let prev=dp[0]; dp[0]=i;
    for(let j=1;j<=n;j++){
      const tmp=dp[j];
      const cost=a[i-1]===b[j-1]?0:1;
      dp[j]=Math.min(dp[j]+1, dp[j-1]+1, prev+cost);
      prev=tmp;
    }
  }
  return dp[n];
}

function extractNumbers(s){
  const m=(s||'').match(/\d+/g);
  return m ? m.map(Number) : [];
}

function tokenScore(qTokens, tTokens){
  let matched=0;
  let fuzzy=0;
  for(const qt of qTokens){
    let best=0;
    for(const tt of tTokens){
      if(qt===tt){ best=2; break; }
      const d=levenshtein(qt,tt);
      if(d===1 && qt.length>=4) best=Math.max(best,1.5);
      else if(d===2 && qt.length>=6) best=Math.max(best,1);
    }
    if(best>=1.5) { matched+=1; if(best<2) fuzzy+=1; }
    else if(best===1) { matched+=0.7; fuzzy+=1; }
  }
  return { matched, fuzzy, total:qTokens.length };
}

function scoreText(query, title){
  // учитывает транслит + опечатки
  const qVariants = normalizeWithTranslit(query);
  const tNorm = normalize(title);
  if(!tNorm) return 0;
  const tTokens = tNorm.split(' ').filter(Boolean);
  const tNums = extractNumbers(tNorm);
  let best=0;
  for(const qNorm of qVariants){
    if(!qNorm) continue;
    const qTokens = qNorm.split(' ').filter(Boolean);
    if(qTokens.length===0) continue;
    const qNums = extractNumbers(qNorm);
    // точное совпадение
    if(qNorm===tNorm) { best=Math.max(best,100); continue; }
    // подстрока
    let subScore=0;
    if(tNorm.includes(qNorm) || qNorm.includes(tNorm)){
      const ratio=Math.min(qNorm.length, tNorm.length)/Math.max(qNorm.length, tNorm.length);
      subScore= 80 + ratio*10; // 80-90
    }
    // токен/levenshtein
    const ts=tokenScore(qTokens, tTokens);
    const jaccard = ts.matched / Math.max(ts.total, tTokens.length);
    let s = (ts.matched/ts.total)*70 + jaccard*20;
    if(ts.fuzzy>0) s -= ts.fuzzy*2;
    // длина штраф если запрос сильно короче заголовка (напр. "маша" vs "маша и медведь серия 177")
    // но если все токены запроса найдены - не штрафуем сильно
    if(ts.matched===ts.total && ts.total>=1) s = Math.max(s, 75);
    // числа: если в запросе есть число, а в заголовке другое число -> сильно штраф
    if(qNums.length>0 && tNums.length>0){
      const intersect=qNums.filter(n=>tNums.includes(n)).length;
      if(intersect===0) s -= 35;
      else if(intersect===qNums.length) s += 10;
    }
    // если в запросе нет числа, а заголовок с числом - не штраф, но пометим для ambiguous
    best=Math.max(best, Math.max(subScore, s));
  }
  return Math.max(0, Math.min(100, Math.round(best)));
}

function searchCatalog(query){
  const variants=normalizeWithTranslit(query);
  let best=null, bestScore=0;
  for(const e of CATALOG){
    let es=0;
    for(const k of e.keys){
      for(const qv of variants){
        const s=scoreText(qv, k);
        if(s>es) es=s;
      }
      const ts=scoreText(query, e.title);
      if(ts>es) es=ts;
    }
    if(es>bestScore){ bestScore=es; best=e; }
  }
  if(best && bestScore>=55) return { ...best, score: bestScore };
  return null;
}

function fetchText(url, timeoutMs=7000){
  return new Promise((resolve,reject)=>{
    const u=new URL(url);
    const lib=u.protocol==='https:'?https:http;
    const req=lib.get(url,{headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36','Accept':'application/json, text/plain, */*','Accept-Language':'ru','Referer':'https://rutube.ru/'}},res=>{
      let d=''; res.on('data',c=>d+=c); res.on('end',()=>resolve({status:res.statusCode,data:d}));
    });
    req.on('error',reject);
    req.setTimeout(timeoutMs,()=>{req.destroy();reject(new Error('timeout'))});
  });
}

async function searchRuTubeCandidates(query, limit=7){
  // 1) пробуем API
  try{
    const url=`https://rutube.ru/api/search/video/?query=${encodeURIComponent(query)}`;
    const r=await fetchText(url,8000);
    if(r.status===200){
      const j=JSON.parse(r.data);
      const arr=j.results||j.data||j.items||[];
      const out=[];
      for(const it of arr.slice(0,15)){
        if(it.is_livestream || it.is_on_air) continue;
        if(it.duration && it.duration>0 && it.duration<300) continue;
        const id=it.id;
        const title=it.title||'';
        if(!id || !title) continue;
        const videoUrl=`https://rutube.ru/video/${id}/`;
        out.push({ id, title, videoUrl, platform:'rutube', author:it.author?.name||'', duration:it.duration });
        if(out.length>=limit) break;
      }
      if(out.length>0) return out;
      for(const it of arr.slice(0,limit)){
        if(it.is_livestream) continue;
        const id=it.id; const title=it.title||query;
        if(!id) continue;
        out.push({ id, title, videoUrl:`https://rutube.ru/video/${id}/`, platform:'rutube' });
        if(out.length>=limit) break;
      }
      if(out.length>0) return out;
    }
  }catch(e){ console.log('[AGENT] rutube api fail', e.message); }
  // 2) fallback - парсим HTML поиска (если API заблокирован на сервере)
  try{
    const url2=`https://rutube.ru/search/?query=${encodeURIComponent(query)}`;
    const r2=await fetchText(url2,8000);
    const ids=[...r2.data.matchAll(/rutube\.ru\/video\/([a-f0-9]{32})/gi)].map(m=>m[1]);
    const uniq=[...new Set(ids)].slice(0,limit);
    if(uniq.length>0){
      return uniq.map(id=>({ id, title: query, videoUrl:`https://rutube.ru/video/${id}/`, platform:'rutube', score: 60 }));
    }
  }catch(e){ console.log('[AGENT] rutube html fail', e.message); }
  return [];
}

async function resolveFilm(query){
  const raw=(query||'').trim();
  if(!raw || raw.length<2) return { ok:false, code:'EMPTY', error:'Напиши название фильма. Например: Маша и Медведь' };
  const q=raw;
  const qNorm=normalize(q);
  if(!qNorm || qNorm.length<2) return { ok:false, code:'EMPTY', error:'Напиши название фильма. Например: Маша и Медведь' };
  if(['фильм','фильма','кино','сериал','сериала','мультфильм','мультик','видео','включи','включить'].includes(qNorm)) return { ok:false, code:'EMPTY', error:'Напиши название фильма. Например: Маша и Медведь' };

  // 1. живой поиск RuTube (приоритет) + каталог как подсказка
  const candidates=await searchRuTubeCandidates(q, 8);
  // скорим каждого кандидата
  const scored=candidates.map(c=>({ ...c, score: scoreText(q, c.title) }))
    .sort((a,b)=>b.score-a.score);

  // также скор каталога для сравнения (если каталог даёт выше - используем его)
  const cat=searchCatalog(q);
  if(cat){
    const catScored={ title:cat.title, videoUrl:cat.videoUrl, platform:cat.platform, score:cat.score, source:'catalog' };
    scored.push(catScored);
    scored.sort((a,b)=>b.score-a.score);
  }

  if(scored.length===0){
    return { ok:false, error:`Не нашёл «${q}» на RuTube. Проверь название или вставь ссылку вручную.`, suggestions:[] };
  }
  const best=scored[0];
  const second=scored[1];

  // пустой результат по скорингу
  if(best.score < 55){
    return { ok:false, error:`Не нашёл «${q}» на RuTube. Проверь название или вставь ссылку вручную.`, suggestions:[] };
  }

  // multipart ambiguous: запрос без числа, а топ-кандидаты содержат разные числа с одинаковой базой
  const qHasNum = extractNumbers(qNorm).length>0;
  if(!qHasNum){
    // смотрим есть ли среди топ кандидатов несколько с числами и общей базой (первое слово совпадает)
    const topWithNum=scored.filter(c=> extractNumbers(normalize(c.title)).length>0).slice(0,5);
    if(topWithNum.length>=2){
      const firstWord = normalize(best.title).split(' ')[0];
      const sameBase=topWithNum.filter(c=> normalize(c.title).split(' ')[0]===firstWord);
      if(sameBase.length>=2){
        // считаем base без чисел: "сумерки 1" -> "сумерки"
        const base = normalize(q);
        // если заголовки различаются только числом/частью
        const scoresClose = sameBase[0].score - sameBase[1].score < 15;
        if(scoresClose){
          // спросить часть
          const opts=sameBase.slice(0,4).map(c=>({ title:c.title, videoUrl:c.videoUrl, platform:c.platform, score:c.score }));
          return { ok:false, ambiguous:true, reason:'multipart', query:q, candidates:opts, error:`Нашёл несколько частей «${q}». Уточни какую включить.` };
        }
      }
    }
  }

  // общий ambiguous если второй близок по скору (разница <10) и оба >=65
  if(second && best.score>=65 && second.score>=60 && (best.score - second.score) <10){
    // если titles разные, спросим
    if(normalize(best.title)!==normalize(second.title)){
      return { ok:false, ambiguous:true, reason:'similar', query:q, candidates: scored.slice(0,3).map(c=>({title:c.title, videoUrl:c.videoUrl, platform:c.platform, score:c.score})), error:`Нашёл несколько вариантов по «${q}». Выбери нужный.` };
    }
  }

  // иначе — точный хит, можно включать
  if(best.score >= 60){
    return { ok:true, match: { title:best.title, videoUrl:best.videoUrl, platform:best.platform, score:best.score }, source: best.source||'rutube', query:q, candidates: scored.slice(0,3) };
  }

  return { ok:false, error:`Не нашёл «${q}» на RuTube. Проверь название или вставь ссылку вручную.`, suggestions:[] };
}

function suggestFromCatalog(query){ return []; }

function parseAgentCommand(text){
  if(!isAgentQuery(text)) return null;
  const q=extractFilmQuery(text);
  return q || null;
}

module.exports = {
  CATALOG,
  isAgentQuery,
  extractFilmQuery,
  parseAgentCommand,
  searchCatalog,
  resolveFilm,
  searchRuTubeCandidates,
  scoreText,
  normalize,
  latinToCyr
};

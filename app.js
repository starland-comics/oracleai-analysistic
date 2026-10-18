(() => {
  'use strict';

  const CONFIG = {
    api: 'https://v3.football.api-sports.io',
    apiKey: '48a576d984d21c242b2dbea309b724e5', // <--- ВАШ КЛЮЧ
    liveRefresh: 60000,
  };

  const LIVE = new Set(['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE', 'IN_PLAY', 'PLAYING']);
  const DONE = new Set(['FT', 'AET', 'PEN', 'FINISHED', 'ENDED', 'AWD', 'WO']);
  
  // Приоритет лиг (чем меньше число, тем выше)
  const LEAGUE_PRIORITY = {
    'Premier League': 1,
    'La Liga': 2,
    'Serie A': 3,
    'Bundesliga': 4,
    'Ligue 1': 5,
    'Russian Premier League': 6,
    'Championship': 7,
    'UEFA Champions League': 8,
    'UEFA Europa League': 9,
  };

  const TRANSLATIONS = {
    'Premier League': 'АПЛ', 'La Liga': 'Ла Лига', 'Serie A': 'Серия А',
    'Bundesliga': 'Бундеслига', 'Ligue 1': 'Лига 1', 'Championship': 'Чемпионшип',
    'Russian Premier League': 'РПЛ', 'UEFA Champions League': 'Лига Чемпионов',
    'Manchester United': 'Манчестер Юнайтед', 'Manchester City': 'Манчестер Сити',
    'Arsenal': 'Арсенал', 'Chelsea': 'Челси', 'Liverpool': 'Ливерпуль',
    'Real Madrid': 'Реал Мадрид', 'Barcelona': 'Барселона', 'Bayern München': 'Бавария',
    'Borussia Dortmund': 'Боруссия Дортмунд', 'PSG': 'ПСЖ', 'Juventus': 'Ювентус',
    'Inter': 'Интер', 'Milan': 'Милан', 'Spartak Moscow': 'Спартак', 'Zenit': 'Зенит',
    'CSKA Moscow': 'ЦСКА', 'Dynamo Moscow': 'Динамо', 'Lokomotiv Moscow': 'Локомотив'
  };

  const tg = window.Telegram?.WebApp;
  tg?.ready(); tg?.expand();

  const $ = (sel) => document.querySelector(sel);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pick = (obj, ...paths) => { for (const p of paths) { const val = p.split('.').reduce((a, k) => a?.[k], obj); if (val != null) return val; } return undefined; };
  const dayStr = (offset = 0) => { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };

  function translateName(name) {
    if (!name) return '';
    for (const [en, ru] of Object.entries(TRANSLATIONS)) {
      if (name.toLowerCase().includes(en.toLowerCase())) return ru;
    }
    return name;
  }

  function transliterate(str) {
    const ru = { 'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'e','ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'h','ц':'ts','ч':'ch','ш':'sh','щ':'sch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya' };
    return str.toLowerCase().split('').map(c => ru[c] || c).join('');
  }

  async function api(path) {
    const res = await fetch(CONFIG.api + path, { headers: { 'x-apisports-key': CONFIG.apiKey }, cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  function normalize(e) {
    const home = pick(e, 'teams.home.name') ?? 'Дом';
    const away = pick(e, 'teams.away.name') ?? 'Гости';
    return {
      id: pick(e, 'fixture.id'),
      home, away,
      homeTrans: transliterate(home), awayTrans: transliterate(away),
      homeRu: translateName(home), awayRu: translateName(away),
      hs: pick(e, 'goals.home'), as: pick(e, 'goals.away'),
      status: pick(e, 'fixture.status.short') ?? 'NS',
      minute: pick(e, 'fixture.status.elapsed'),
      league: translateName(pick(e, 'league.name') ?? ''),
      leagueRaw: pick(e, 'league.name') ?? '',
      start: pick(e, 'fixture.date'),
      homeLogo: pick(e, 'teams.home.logo'), awayLogo: pick(e, 'teams.away.logo'),
    };
  }

  let allMatches = [];
  let currentTab = 'live';
  let searchQuery = '';
  let sortBy = 'priority';

  const list = $('#list');

  function createCardHTML(m, i) {
    const isLive = LIVE.has(m.status);
    const isDone = DONE.has(m.status);
    const hasScore = (isLive || isDone) && m.hs != null && m.as != null;
    const time = m.start ? new Date(m.start).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '—';
    
    const homeLogo = m.homeLogo ? `<img src="${m.homeLogo}" class="team-logo" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'"><span class="badge" style="display:none">${esc(m.home.slice(0,2))}</span>` : `<span class="badge">${esc(m.home.slice(0,2))}</span>`;
    const awayLogo = m.awayLogo ? `<img src="${m.awayLogo}" class="team-logo" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'"><span class="badge" style="display:none">${esc(m.away.slice(0,2))}</span>` : `<span class="badge">${esc(m.away.slice(0,2))}</span>`;
    
    return `
      <article class="card" style="--i:${i}" onclick="location.href='match.html?id=${m.id}'">
        <div class="card-top">
          <span class="league">${esc(m.league || 'Футбол')}</span>
          ${isLive ? `<span class="pill live"><i class="dot"></i>${m.minute ? m.minute + "'" : 'LIVE'}</span>` : isDone ? `<span class="pill done">FT</span>` : `<span class="pill">${time}</span>`}
        </div>
        <div class="teams">
          <div class="team">${homeLogo}<span class="name">${esc(m.homeRu)}</span></div>
          <div class="score${isDone ? ' muted' : ''}">${hasScore ? `<span>${m.hs}</span> : <span>${m.as}</span>` : '<span class="vs">VS</span>'}</div>
          <div class="team away"><span class="name">${esc(m.awayRu)}</span>${awayLogo}</div>
        </div>
      </article>`;
  }

  function render() {
    let filtered = allMatches.filter(m => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const qT = transliterate(q);
        const match = (m.home.toLowerCase().includes(q) || m.homeRu.toLowerCase().includes(q) || m.homeTrans.includes(qT)) ||
                      (m.away.toLowerCase().includes(q) || m.awayRu.toLowerCase().includes(q) || m.awayTrans.includes(qT));
        if (!match) return false;
      }
      return true;
    });

    filtered.sort((a, b) => {
      if (sortBy === 'priority') {
        if (LIVE.has(a.status) && !LIVE.has(b.status)) return -1;
        if (!LIVE.has(a.status) && LIVE.has(b.status)) return 1;
        const pA = LEAGUE_PRIORITY[a.leagueRaw] || 99;
        const pB = LEAGUE_PRIORITY[b.leagueRaw] || 99;
        if (pA !== pB) return pA - pB;
      }
      return new Date(a.start || 0) - new Date(b.start || 0);
    });

    if (!filtered.length) {
      list.innerHTML = `<div class="state"><h3>Ничего не найдено</h3><p>Попробуйте изменить запрос.</p></div>`;
      return;
    }

    const fragment = document.createDocumentFragment();
    filtered.forEach((m, i) => {
      const div = document.createElement('div');
      div.innerHTML = createCardHTML(m, i).trim();
      fragment.appendChild(div.firstChild);
    });
    list.innerHTML = '';
    list.appendChild(fragment);
  }

  async function loadData(tab) {
    list.innerHTML = `<div class="state"><p>Загрузка...</p></div>`;
    try {
      let path = tab === 'live' ? '/fixtures?live=all' : `/fixtures?date=${dayStr(tab === 'today' ? 0 : 1)}`;
      const raw = await api(path);
      allMatches = (raw.response || []).map(normalize);
      render();
    } catch (err) {
      list.innerHTML = `<div class="state"><h3>Ошибка API</h3><p>${esc(err.message)}</p></div>`;
    }
  }

  document.querySelectorAll('.tab').forEach((btn, index) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.tab === currentTab) return;
      currentTab = btn.dataset.tab;
      document.querySelector('.tabs').style.setProperty('--i', index);
      document.querySelectorAll('.tab').forEach(b => b.setAttribute('aria-selected', String(b === btn)));
      loadData(currentTab);
    });
  });

  let tOut;
  $('#search-input').addEventListener('input', (e) => {
    clearTimeout(tOut);
    tOut = setTimeout(() => { searchQuery = e.target.value.trim(); render(); }, 250);
  });

  $('#sort-select').addEventListener('change', (e) => { sortBy = e.target.value; render(); });
  
  $('#refresh').addEventListener('click', () => {
    $('#refresh').classList.add('is-loading');
    loadData(currentTab).then(() => $('#refresh').classList.remove('is-loading'));
  });

  document.querySelector('.tabs').style.setProperty('--i', 0);
  loadData('live');
})();

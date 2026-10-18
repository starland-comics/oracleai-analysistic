/* ═══════════════════════════════════════════════
   ORACLE AI — Main Mini App (Optimized)
   ═══════════════════════════════════════════════ */

(() => {
  'use strict';

  const CONFIG = {
    api: 'https://v3.football.api-sports.io',
    apiKey: '48a576d984d21c242b2dbea309b724e5', // <--- КЛЮЧ
    ttl: 60_000,
    liveRefresh: 60_000,
    timeout: 15_000,
  };

  const LIVE = new Set(['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE', 'IN_PLAY', 'PLAYING']);
  const DONE = new Set(['FT', 'AET', 'PEN', 'FINISHED', 'ENDED', 'AWD', 'WO']);
  
  // Топовые лиги для быстрого фильтра
  const TOP_LEAGUES = ['Premier League', 'La Liga', 'Serie A', 'Bundesliga', 'Ligue 1', 'РПЛ / Premier League', 'Championship'];

  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.ready(); tg.expand();
    try { tg.setHeaderColor?.('#07070f'); tg.setBackgroundColor?.('#07070f'); } catch {}
  }
  const haptic = (s = 'light') => { try { tg?.HapticFeedback?.impactOccurred(s); } catch {} };

  /* ───────── Helpers & Translation ───────── */
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pick = (obj, ...paths) => { for (const path of paths) { const val = path.split('.').reduce((acc, key) => acc?.[key], obj); if (val !== undefined && val !== null && val !== '') return val; } return undefined; };
  const dayStr = (offset = 0) => { const d = new Date(); d.setDate(d.getDate() + offset); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };

  // Простой словарь для перевода популярных лиг и команд (расширяемый)
  const TRANSLATIONS = {
    'Premier League': 'АПЛ',
    'La Liga': 'Ла Лига',
    'Serie A': 'Серия А',
    'Bundesliga': 'Бундеслига',
    'Ligue 1': 'Лига 1',
    'Championship': 'Чемпионшип',
    'UEFA Champions League': 'Лига Чемпионов',
    'Manchester United': 'Манчестер Юнайтед',
    'Manchester City': 'Манчестер Сити',
    'Arsenal': 'Арсенал',
    'Chelsea': 'Челси',
    'Liverpool': 'Ливерпуль',
    'Real Madrid': 'Реал Мадрид',
    'Barcelona': 'Барселона',
    'Bayern München': 'Бавария',
    'Borussia Dortmund': 'Боруссия Дортмунд',
    'PSG': 'ПСЖ',
    'Juventus': 'Ювентус',
    'Inter': 'Интер',
    'Milan': 'Милан'
  };

  function translateName(name) {
    if (!name) return '';
    const lower = name.toLowerCase();
    for (const [en, ru] of Object.entries(TRANSLATIONS)) {
      if (lower.includes(en.toLowerCase()) || en.toLowerCase().includes(lower)) return ru;
    }
    return name;
  }

  // Простая транслитерация для поиска
  function transliterate(str) {
    const ru = { 'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'e','ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'h','ц':'ts','ч':'ch','ш':'sh','щ':'sch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya' };
    return str.toLowerCase().split('').map(c => ru[c] || c).join('');
  }

  /* ───────── API & Normalization ───────── */
  async function api(path) {
    const res = await fetch(CONFIG.api + path, { headers: { 'x-apisports-key': CONFIG.apiKey, 'Accept': 'application/json' }, cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  function normalize(e) {
    const home = pick(e, 'teams.home.name') ?? 'Дом';
    const away = pick(e, 'teams.away.name') ?? 'Гости';
    return {
      id: pick(e, 'fixture.id'),
      home,
      away,
      homeTrans: transliterate(home),
      awayTrans: transliterate(away),
      homeRu: translateName(home),
      awayRu: translateName(away),
      hs: pick(e, 'goals.home'),
      as: pick(e, 'goals.away'),
      status: pick(e, 'fixture.status.short') ?? 'NS',
      minute: pick(e, 'fixture.status.elapsed'),
      league: translateName(pick(e, 'league.name') ?? ''),
      leagueRaw: pick(e, 'league.name') ?? '',
      start: pick(e, 'fixture.date'),
      homeLogo: pick(e, 'teams.home.logo'),
      awayLogo: pick(e, 'teams.away.logo'),
    };
  }

  /* ───────── State & Data ───────── */
  let allMatches = [];
  let currentTab = 'live';
  let searchQuery = '';
  let onlyTopLeagues = false;
  let sortBy = 'time'; // time, league

  /* ───────── Rendering ───────── */
  const list = $('#list');

  function createCardHTML(m, i) {
    const isLive = LIVE.has(m.status);
    const isDone = DONE.has(m.status);
    const hasScore = (isLive || isDone) && m.hs != null && m.as != null;
    const time = m.start ? new Date(m.start).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '—';
    
    // Логотипы или фолбэк на инициалы
    const homeLogoHTML = m.homeLogo 
      ? `<img src="${m.homeLogo}" alt="${esc(m.home)}" class="team-logo" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'">`
      : '';
    const homeFallback = `<span class="badge" style="display:${m.homeLogo ? 'none' : 'grid'}">${esc(m.home.slice(0,2).toUpperCase())}</span>`;

    const awayLogoHTML = m.awayLogo 
      ? `<img src="${m.awayLogo}" alt="${esc(m.away)}" class="team-logo" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'">`
      : '';
    const awayFallback = `<span class="badge" style="display:${m.awayLogo ? 'none' : 'grid'}">${esc(m.away.slice(0,2).toUpperCase())}</span>`;

    const center = hasScore 
      ? `<div class="score${isDone ? ' muted' : ''}"><span>${esc(m.hs)}</span><em>:</em><span>${esc(m.as)}</span></div>`
      : `<div class="vs">VS</div>`;

    return `
      <article class="card" style="--i:${i}" onclick="location.href='match.html?id=${m.id}'" role="button" tabindex="0">
        <div class="card-top">
          <span class="league">${esc(m.league || 'Футбол')}</span>
          ${isLive ? `<span class="pill live"><i class="dot"></i>${m.minute ? m.minute + "'" : 'LIVE'}</span>` : isDone ? `<span class="pill done">FT</span>` : `<span class="pill">${time}</span>`}
        </div>
        <div class="teams">
          <div class="team">
            ${homeLogoHTML} ${homeFallback}
            <span class="name">${esc(m.homeRu)}</span>
          </div>
          ${center}
          <div class="team away">
            <span class="name">${esc(m.awayRu)}</span>
            ${awayLogoHTML} ${awayFallback}
          </div>
        </div>
      </article>`;
  }

  function render() {
    let filtered = allMatches.filter(m => {
      // Фильтр по поиску (учитываем RU, EN и транслит)
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const qTrans = transliterate(q);
        const match = (m.home.toLowerCase().includes(q) || m.homeRu.toLowerCase().includes(q) || m.homeTrans.includes(qTrans)) ||
                      (m.away.toLowerCase().includes(q) || m.awayRu.toLowerCase().includes(q) || m.awayTrans.includes(qTrans));
        if (!match) return false;
      }
      
      // Фильтр по топ-лигам
      if (onlyTopLeagues) {
        const isTop = TOP_LEAGUES.some(tl => m.leagueRaw.includes(tl) || m.league.includes(tl));
        if (!isTop) return false;
      }
      return true;
    });

    // Сортировка
    if (sortBy === 'league') {
      filtered.sort((a, b) => a.league.localeCompare(b.league));
    } else {
      // По времени старта (или по статусу Live в начале)
      filtered.sort((a, b) => {
        if (LIVE.has(a.status) && !LIVE.has(b.status)) return -1;
        if (!LIVE.has(a.status) && LIVE.has(b.status)) return 1;
        return new Date(a.start || 0) - new Date(b.start || 0);
      });
    }

    if (!filtered.length) {
      list.innerHTML = `<div class="state"><h3>Ничего не найдено</h3><p>Попробуйте изменить запрос или фильтры.</p></div>`;
      return;
    }

    // Оптимизация: собираем в фрагмент
    const fragment = document.createDocumentFragment();
    filtered.forEach((m, i) => {
      const div = document.createElement('div');
      div.innerHTML = createCardHTML(m, i).trim();
      fragment.appendChild(div.firstChild);
    });
    
    list.innerHTML = '';
    list.appendChild(fragment);
  }

  async function loadData(tab, silent = false) {
    if (!silent) list.innerHTML = `<p class="loading">Загрузка...</p>`;
    try {
      let path = '/fixtures?live=all';
      if (tab === 'today') path = `/fixtures?date=${dayStr(0)}`;
      if (tab === 'upcoming') path = `/fixtures?date=${dayStr(1)}`;
      
      const raw = await api(path);
      allMatches = (raw.response || []).map(normalize);
      render();
    } catch (err) {
      if (!silent) list.innerHTML = `<div class="state"><h3>Ошибка API</h3><p>${esc(err.message)}</p></div>`;
    }
  }

  /* ───────── Event Listeners ───────── */
  // Табы
  $$('.tab').forEach((btn, index) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.tab === currentTab) return;
      haptic('light');
      currentTab = btn.dataset.tab;
      $('.tabs').style.setProperty('--i', index);
      $$('.tab').forEach(b => b.setAttribute('aria-selected', String(b === btn)));
      loadData(currentTab);
    });
  });

  // Поиск
  const searchInput = $('#search-input');
  if (searchInput) {
    let timeout;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        searchQuery = e.target.value.trim();
        render();
      }, 300); // Дебаунс 300мс
    });
  }

  // Топ-лиги
  const topToggle = $('#top-toggle');
  if (topToggle) {
    topToggle.addEventListener('change', (e) => {
      onlyTopLeagues = e.target.checked;
      render();
    });
  }

  // Сортировка
  const sortSelect = $('#sort-select');
  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      sortBy = e.target.value;
      render();
    });
  }

  // Кнопка обновления
  $('#refresh')?.addEventListener('click', () => {
    haptic('medium');
    loadData(currentTab, true);
  });

  // Инициализация
  $('.tabs').style.setProperty('--i', 0);
  loadData('live');
})();

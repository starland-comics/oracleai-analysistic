/* ═══════════════════════════════════════════════
   ORACLE AI — Main Mini App
   Vanilla JS · API-Football Integration
   ═══════════════════════════════════════════════ */

(() => {
  'use strict';

  /* ───────── Config ───────── */
  const CONFIG = {
    api: 'https://v3.football.api-sports.io',
    apiKey: 'ВАШ_API_КЛЮЧ_ЗДЕСЬ', // <--- ВСТАВЬТЕ СЮДА ВАШ КЛЮЧ
    ttl: 45_000,
    liveRefresh: 60_000,
    timeout: 15_000,
    demo: new URLSearchParams(location.search).has('demo'),
  };

  const LIVE = new Set(['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE', 'IN_PLAY', 'PLAYING']);
  const DONE = new Set(['FT', 'AET', 'PEN', 'FINISHED', 'ENDED', 'AWD', 'WO']);

  /* ───────── Telegram ───────── */
  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
    try {
      tg.setHeaderColor?.('#07070f');
      tg.setBackgroundColor?.('#07070f');
      tg.disableVerticalSwipes?.();
    } catch {}
  }

  if (tg?.colorScheme === 'light') {
    document.documentElement.dataset.theme = 'light';
  }

  const haptic = (s = 'light') => { try { tg?.HapticFeedback?.impactOccurred(s); } catch {} };
  const hapticSel = () => { try { tg?.HapticFeedback?.selectionChanged(); } catch {} };

  /* ───────── Helpers ───────── */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

  const pick = (obj, ...paths) => {
    for (const path of paths) {
      const val = path.split('.').reduce((acc, key) => acc?.[key], obj);
      if (val !== undefined && val !== null && val !== '') return val;
    }
    return undefined;
  };

  const hue = (str) => {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360;
    return h;
  };

  const dayStr = (offset = 0) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };

  const fmtTime = (val) => {
    if (!val) return '';
    const d = new Date(typeof val === 'number' && val < 1e12 ? val * 1000 : val);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  };

  /* ───────── Normalization (API-Football specific) ───────── */
  function normalize(e) {
    return {
      id:     pick(e, 'fixture.id') ?? Math.random().toString(36).slice(2),
      home:   pick(e, 'teams.home.name') ?? 'Дом',
      away:   pick(e, 'teams.away.name') ?? 'Гости',
      hs:     pick(e, 'goals.home'),
      as:     pick(e, 'goals.away'),
      status: pick(e, 'fixture.status.short') ?? 'NS',
      minute: pick(e, 'fixture.status.elapsed'),
      league: pick(e, 'league.name') ?? '',
      start:  pick(e, 'fixture.date'),
    };
  }

  /* ───────── Cache ───────── */
  const mem = new Map();
  function cacheGet(key) {
    const hit = mem.get(key);
    if (hit && Date.now() - hit.t < CONFIG.ttl) return hit.v;
    try {
      const raw = localStorage.getItem('oracle:' + key);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (obj && Date.now() - obj.t < CONFIG.ttl) { mem.set(key, obj); return obj.v; }
    } catch {}
    return null;
  }
  function cacheSet(key, value) {
    const obj = { t: Date.now(), v: value };
    mem.set(key, obj);
    try { localStorage.setItem('oracle:' + key, JSON.stringify(obj)); } catch {}
  }

  /* ───────── API ───────── */
  const endpoint = (tab) => {
    if (tab === 'live') return `/fixtures?live=all`;
    if (tab === 'today') return `/fixtures?date=${dayStr(0)}`;
    return `/fixtures?date=${dayStr(1)}`;
  };

  async function api(path) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), CONFIG.timeout);
    try {
      const res = await fetch(CONFIG.api + path, {
        signal: ctrl.signal,
        headers: { 
          'x-apisports-key': CONFIG.apiKey,
          'Accept': 'application/json' 
        },
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  /* ───────── Render ───────── */
  const list = $('#list');

  function badge(name) {
    const h = hue(name);
    const initials = String(name).split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';
    return `<span class="badge" style="--c1:hsl(${h} 72% 60%);--c2:hsl(${(h + 38) % 360} 72% 46%)">${esc(initials)}</span>`;
  }

  function cardHTML(m, i) {
    const isLive = LIVE.has(m.status);
    const isDone = DONE.has(m.status);
    const started = isLive || isDone;
    const hasScore = started && m.hs != null && m.as != null;

    const minute = Number(m.minute) || (m.status === 'HT' ? 45 : 0);
    const pct = isLive ? Math.min(100, Math.max(6, (minute / 90) * 100)) : 0;
    const time = fmtTime(m.start);

    const pill = isLive
      ? `<span class="pill live"><i class="dot"></i>${minute ? minute + "'" : 'LIVE'}</span>`
      : isDone
        ? `<span class="pill done">FT</span>`
        : `<span class="pill">${time || '—'}</span>`;

    const center = hasScore
      ? `<div class="score${isDone ? ' muted' : ''}"><span>${esc(m.hs)}</span><em>:</em><span>${esc(m.as)}</span></div>`
      : `<div class="vs">VS</div>`;

    return `
      <article class="card" style="--i:${i}" onclick="location.href='match.html?id=${m.id}'" role="button" tabindex="0">
        <div class="card-top">
          <span class="league">${esc(m.league || 'Футбол')}</span>
          ${pill}
        </div>
        <div class="teams">
          <div class="team">${badge(m.home)}<span class="name">${esc(m.home)}</span></div>
          ${center}
          <div class="team away"><span class="name">${esc(m.away)}</span>${badge(m.away)}</div>
        </div>
        ${isLive ? `<div class="bar" aria-hidden="true"><i style="width:${pct.toFixed(1)}%"></i></div>` : ''}
      </article>`;
  }

  function render(items) {
    list.setAttribute('aria-busy', 'false');
    if (!items?.length) return renderEmpty();
    list.innerHTML = items.map(cardHTML).join('');
  }

  function renderEmpty() {
    list.setAttribute('aria-busy', 'false');
    list.innerHTML = `
      <div class="state card" style="--i:0">
        <div class="state-ic"><svg class="ic"><use href="#i-ball"/></svg></div>
        <h3>Пока пусто</h3>
        <p>Матчей по этому фильтру нет. Загляните чуть позже.</p>
      </div>`;
  }

  function renderError(err) {
    list.setAttribute('aria-busy', 'false');
    list.innerHTML = `
      <div class="state card" style="--i:0">
        <div class="state-ic err"><svg class="ic"><use href="#i-alert"/></svg></div>
        <h3>Ошибка API</h3>
        <p>${esc(err?.message || 'Проверьте ключ или соединение')}</p>
        <button class="btn" id="retry">Повторить</button>
      </div>`;
    $('#retry')?.addEventListener('click', () => { haptic('medium'); load(state.tab, { force: true }); });
  }

  function renderSkeleton() {
    list.setAttribute('aria-busy', 'true');
    list.innerHTML = Array.from({ length: 4 }, (_, i) => `
      <div class="card skel" style="--i:${i}" aria-hidden="true">
        <div class="card-top"><span class="sk" style="width:64px;height:9px"></span><span class="sk" style="width:46px;height:20px;border-radius:999px"></span></div>
        <div class="teams">
          <div class="team"><span class="sk circle"></span><span class="sk" style="height:12px"></span></div>
          <span class="sk" style="width:44px;height:24px"></span>
          <div class="team away"><span class="sk" style="height:12px"></span><span class="sk circle"></span></div>
        </div>
      </div>`).join('');
  }

  /* ───────── State + Loader ───────── */
  const state = { tab: 'live', req: 0 };
  const inflight = new Set();

  function setLoading(on) {
    const btn = $('#refresh');
    if (!btn) return;
    btn.classList.toggle('is-loading', on);
    btn.disabled = on;
  }

  async function load(tab, { force = false, silent = false } = {}) {
    if (inflight.has(tab)) return;
    inflight.add(tab);
    const req = ++state.req;
    setLoading(true);

    const cached = !force && cacheGet(tab);
    if (cached) render(cached);
    else if (!silent) renderSkeleton();

    try {
      let items = [];
      if (CONFIG.demo) {
        await sleep(320);
        items = DEMO[tab] ?? [];
      } else {
        const raw = await api(endpoint(tab));
        items = (raw.response || []).map(normalize);
        // Для сегодня/скоро оставляем только футбол (sport id)
        if(tab !== 'live') items = items.filter(m => m.status !== 'CANC' && m.status !== 'PST');
        cacheSet(tab, items);
      }
      if (req === state.req) render(items);
    } catch (err) {
      if (req === state.req && !cached) renderError(err);
      console.warn('[Oracle AI]', err);
    } finally {
      inflight.delete(tab);
      if (req === state.req) setLoading(false);
    }
  }

  /* ───────── Tabs ───────── */
  const tabsEl = $('.tabs');
  $$('.tab').forEach((btn, index) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.tab === state.tab) return;
      hapticSel();
      state.tab = btn.dataset.tab;
      tabsEl.style.setProperty('--i', index);
      $$('.tab').forEach(b => b.setAttribute('aria-selected', String(b === btn)));
      load(state.tab);
    });
  });

  /* ───────── Refresh & Auto-refresh ───────── */
  $('#refresh')?.addEventListener('click', () => { haptic('medium'); load(state.tab, { force: true }); });

  setInterval(() => {
    if (document.visibilityState === 'visible' && state.tab === 'live') load('live', { force: true, silent: true });
  }, CONFIG.liveRefresh);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.tab === 'live') load('live', { silent: true });
  });

  /* ───────── Demo Data ───────── */
  const DEMO = {
    live: [
      { id: '1035000', home: 'Manchester City', away: 'Arsenal', hs: 2, as: 1, status: '2H', minute: 67, league: 'Premier League' },
      { id: '1035001', home: 'Real Madrid', away: 'Barcelona', hs: 1, as: 1, status: '2H', minute: 54, league: 'La Liga' }
    ],
    today: [
      { id: '1035002', home: 'Liverpool', away: 'Chelsea', hs: 2, as: 0, status: 'FT', league: 'Premier League' },
      { id: '1035003', home: 'Inter', away: 'Juventus', hs: null, as: null, status: 'NS', league: 'Serie A', start: new Date(Date.now() + 3 * 3600e3) }
    ],
    upcoming: [
      { id: '1035004', home: 'Tottenham', away: 'Newcastle', hs: null, as: null, status: 'NS', league: 'Premier League', start: new Date(Date.now() + 26 * 3600e3) }
    ],
  };

  /* ───────── Boot ───────── */
  tabsEl.style.setProperty('--i', 0);
  load('live');
})();

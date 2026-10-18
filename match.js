(() => {
  'use strict';
  const API_KEY = 'c381d2ea1e1569e460c19f762aa5cd8438da4c86'; // <--- ВАШ КЛЮЧ BSD
  const BASE = 'https://sports.bzzoiro.com/api/v2';
  const FIXTURE_ID = new URLSearchParams(location.search).get('id');

  const tg = window.Telegram?.WebApp;
  tg?.ready(); tg?.expand();
  const haptic = (s) => { try { tg?.HapticFeedback?.impactOccurred(s); } catch {} };
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pick = (obj, ...paths) => { for (const p of paths) { const val = p.split('.').reduce((a, k) => a?.[k], obj); if (val != null) return val; } return undefined; };

  const list = document.getElementById('match-content');
  const titleEl = document.getElementById('match-title');

  async function api(path) {
    const res = await fetch(BASE + path, { headers: { 'Authorization': `Token ${API_KEY}` } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async function loadMatch() {
    if (!FIXTURE_ID) { list.innerHTML = '<p>ID матча не указан</p>'; return; }
    try {
      // Параллельные запросы к BSD
      const [fxRes, statsRes, lineupsRes, oddsRes, predRes] = await Promise.all([
        api(`/events/${FIXTURE_ID}/`),
        api(`/events/${FIXTURE_ID}/stats/`).catch(() => null),
        api(`/events/${FIXTURE_ID}/lineups/`).catch(() => null),
        api(`/events/${FIXTURE_ID}/odds/`).catch(() => null),
        api(`/events/${FIXTURE_ID}/prediction/`).catch(() => null)
      ]);
      
      const fx = fxRes.data || fxRes; // Адаптация под возможный wrapper
      if (!fx || !fx.id) throw new Error('Матч не найден');
      
      renderMatch(fx, statsRes?.data || statsRes, lineupsRes?.data || lineupsRes, oddsRes?.data || oddsRes, predRes?.data || predRes);
    } catch (err) {
      list.innerHTML = `<div class="state"><h3>Ошибка</h3><p>${esc(err.message)}</p></div>`;
    }
  }

  function renderMatch(fx, stats, lineups, odds, predictions) {
    const homeName = pick(fx, 'home_team.name', 'home_team');
    const awayName = pick(fx, 'away_team.name', 'away_team');
    titleEl.textContent = `${homeName} — ${awayName}`;

    let html = `
      <div class="score-card">
        <div class="score-main">
          <img src="${pick(fx, 'home_team.logo', 'home_team_logo') || ''}" style="width:40px;height:40px;object-fit:contain;" onerror="this.style.display='none'">
          <span class="score-big">${pick(fx, 'score.home', 'home_score') ?? '-'} : ${pick(fx, 'score.away', 'away_score') ?? '-'}</span>
          <img src="${pick(fx, 'away_team.logo', 'away_team_logo') || ''}" style="width:40px;height:40px;object-fit:contain;" onerror="this.style.display='none'">
        </div>
        <div class="match-meta">${pick(fx, 'status', 'status_type') || 'NS'} · ${pick(fx, 'league.name', 'league_name') || 'Лига'}</div>
      </div>`;

    // Если есть статистика BSD
    if (stats && Array.isArray(stats) && stats.length >= 2) {
      const rows = (stats[0].statistics || []).map((s, i) => `<div class="stat-row"><span>${esc(s.type)}</span><b>${esc(s.value ?? '-')}</b><b>${esc(stats[1].statistics[i]?.value ?? '-')}</b></div>`).join('');
      html += `<div class="match-section"><h3 class="section-title">Статистика</h3><div class="stats-table">${rows}</div></div>`;
    }

    html += `
      <div class="oracle-cta">
        <h3>🧠 Oracle AI Deep Analysis</h3>
        <p>Анализ нейросети BSD, поиск валуя и разбор тоталов.</p>
        <button id="run-oracle" class="btn primary" style="margin-top:12px;">Разобрать матч</button>
      </div>`;

    list.innerHTML = html;
    
    document.getElementById('run-oracle')?.addEventListener('click', () => {
      haptic('medium');
      runOracle(fx, stats, predictions, odds);
    });
  }

  async function runOracle(fx, stats, predictions, odds) {
    const cta = document.querySelector('.oracle-cta');
    cta.innerHTML = `<h3>Анализ...</h3><div class="progress-wrap"><div class="progress-bar" id="progress"></div></div><p id="think-status">Загрузка нейромодели BSD...</p>`;

    const steps = ['Извлечение прогнозов Dixon-Coles...', 'Анализ линии букмекеров...', 'Поиск валуйных ставок...', 'Формирование вердикта...'];
    for (let i = 0; i < steps.length; i++) {
      await new Promise(r => setTimeout(r, 700 + Math.random() * 500));
      document.getElementById('think-status').textContent = steps[i];
      document.getElementById('progress').style.width = `${((i+1)/steps.length)*100}%`;
    }

    let verdicts = [];

    // 1. Извлекаем вероятности из прогнозов BSD
    let pHome = 0.33, pDraw = 0.33, pAway = 0.33;
    let hasPred = false;
    
    if (predictions) {
      // Ищем вероятности в разных возможных местах JSON
      pHome = pick(predictions, 'percent.home', 'probabilities.home', 'home_win') / 100 || 0;
      pDraw = pick(predictions, 'percent.draw', 'probabilities.draw', 'draw') / 100 || 0;
      pAway = pick(predictions, 'percent.away', 'probabilities.away', 'away_win') / 100 || 0;
      if (pHome > 0) hasPred = true;
    }

    // 2. Корректировка на Live-счет
    const status = pick(fx, 'status', 'status_type') || 'NS';
    const isLive = ['1H', '2H', 'HT', 'ET', 'P', 'LIVE', 'IN_PLAY'].includes(String(status).toUpperCase());
    const isDone = ['FT', 'AET', 'PEN', 'FINISHED'].includes(String(status).toUpperCase());
    
    const gh = pick(fx, 'score.home', 'home_score') ?? 0;
    const ga = pick(fx, 'score.away', 'away_score') ?? 0;

    if (isLive || isDone) {
      const diff = gh - ga;
      const minute = pick(fx, 'minute', 'time_played') || 90;
      const timeLeft = Math.max(0, 90 - minute);

      if (isDone) {
        if (diff > 0) { pHome = 1; pDraw = 0; pAway = 0; }
        else if (diff < 0) { pHome = 0; pDraw = 0; pAway = 1; }
        else { pHome = 0; pDraw = 1; pAway = 0; }
      } else {
        if (diff === 0) {
          const drawBase = Math.min(0.9, Math.max(0.3, 1 - (timeLeft / 120))); 
          pDraw = drawBase; pHome = (1 - drawBase) * 0.55; pAway = (1 - drawBase) * 0.45;
        } else if (diff > 0) {
          const winBase = Math.min(0.99, Math.max(0.5, 0.5 + (diff * 0.15) + ((90 - timeLeft) / 90 * 0.4)));
          pHome = winBase; pDraw = (1 - winBase) * 0.6; pAway = (1 - winBase) * 0.4;
        } else {
          const winBase = Math.min(0.99, Math.max(0.5, 0.5 + (Math.abs(diff) * 0.15) + ((90 - timeLeft) / 90 * 0.4)));
          pAway = winBase; pHome = (1 - winBase) * 0.6; pDraw = (1 - winBase) * 0.4;
        }
      }
    }

    // 3. Анализ коэффициентов (поиск Value)
    let bHome = 0, bDraw = 0, bAway = 0;
    
    // Пытаемся найти 1X2 в ответе odds BSD
    if (odds) {
      // Предполагаем, что odds это массив или объект с рынками
      const markets = Array.isArray(odds) ? odds : (odds.markets || odds.results || []);
      const matchWinner = markets.find(m => m.name?.includes('1X2') || m.name?.includes('Winner') || m.market_id === 1);
      
      if (matchWinner && matchWinner.selections) {
        matchWinner.selections.forEach(s => {
          if (s.name === 'Home' || s.name === '1') bHome = +s.price || +s.odd;
          if (s.name === 'Draw' || s.name === 'X') bDraw = +s.price || +s.odd;
          if (s.name === 'Away' || s.name === '2') bAway = +s.price || +s.odd;
        });
      }
    }

    // 4. Формирование вердикта
    if (bHome > 1 && !isLive && !isDone) {
      // Поиск валуя до матча
      const evH = (pHome * bHome) - 1;
      const evD = (pDraw * bDraw) - 1;
      const evA = (pAway * bAway) - 1;
      
      const maxEv = Math.max(evH, evD, evA);
      if (maxEv > 0.02) {
        if (maxEv === evH) verdicts.push({ title: `П1 (${pick(fx, 'home_team.name', 'home_team')})`, odds: bHome, value: evH, reason: 'Модель BSD видит завышенный коэффициент' });
        else if (maxEv === evD) verdicts.push({ title: `Ничья (X)`, odds: bDraw, value: evD, reason: 'Модель BSD видит завышенный коэффициент' });
        else verdicts.push({ title: `П2 (${pick(fx, 'away_team.name', 'away_team')})`, odds: bAway, value: evA, reason: 'Модель BSD видит завышенный коэффициент' });
      }
    } 
    
    // Если валуя нет или это Live — берем просто максимальную вероятность
    if (verdicts.length === 0) {
      if (pHome >= pDraw && pHome >= pAway) verdicts.push({ title: `П1 (${pick(fx, 'home_team.name', 'home_team')})`, reason: `Вероятность ${(pHome*100).toFixed(0)}%` });
      else if (pAway >= pHome && pAway >= pDraw) verdicts.push({ title: `П2 (${pick(fx, 'away_team.name', 'away_team')})`, reason: `Вероятность ${(pAway*100).toFixed(0)}%` });
      else verdicts.push({ title: `Ничья (X)`, reason: `Вероятность ${(pDraw*100).toFixed(0)}%` });
    }

    // 5. Рендер
    let html = `<h3>✅ Вердикт Oracle</h3>`;
    verdicts.forEach(v => {
        html += `
        <div style="background:rgba(255,255,255,0.05); border-radius:10px; padding:12px; margin-bottom:8px; border-left: 4px solid var(--accent-2);">
            <div style="font-size:16px; font-weight:700; color:var(--accent-2); margin-bottom:4px;">${v.title} ${v.odds ? `<span style="font-size:12px; color:var(--text); font-weight:400;">@ ${v.odds}</span>` : ''}</div>
            <div style="font-size:12px; color:var(--muted);">${v.reason}${v.value > 0 ? ` (Value: +${(v.value*100).toFixed(1)}%)` : ''}</div>
        </div>`;
    });

    // Добавляем общий анализ
    html += `
      <div style="font-size:12px; color:var(--muted); text-align:left; line-height:1.6; background:rgba(0,0,0,0.2); padding:12px; border-radius:10px; margin-top:12px;">
        <b>Детали:</b> ${hasPred ? 'Использованы математические прогнозы BSD.' : 'Базовый анализ на основе счета и формы.'} 
        Текущая оценка: П1 - ${(pHome*100).toFixed(0)}%, X - ${(pDraw*100).toFixed(0)}%, П2 - ${(pAway*100).toFixed(0)}%.
      </div>`;

    cta.innerHTML = html;
  }

  loadMatch();
})();

(() => {
  'use strict';
  
  const API_URL = 'https://oracleai-scrapper.onrender.com/api';
  const FIXTURE_ID = new URLSearchParams(location.search).get('id');

  const tg = window.Telegram?.WebApp;
  tg?.ready(); tg?.expand();
  const haptic = (s) => { try { tg?.HapticFeedback?.impactOccurred(s); } catch {} };
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  
  const list = document.getElementById('match-content');
  const titleEl = document.getElementById('match-title');

  async function api(path) {
    const res = await fetch(API_URL + path);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async function loadMatch() {
    if (!FIXTURE_ID) { list.innerHTML = '<p>ID матча не указан</p>'; return; }
    try {
      // Запрашиваем детали матча (скрапер вернет статистику и xG)
      const matchData = await api(`/match/${FIXTURE_ID}`);
      renderMatch(matchData);
    } catch (err) {
      list.innerHTML = `<div class="state"><h3>Ошибка</h3><p>${esc(err.message)}</p></div>`;
    }
  }

  function renderMatch(data) {
    const fx = data.event;
    if (!fx) { list.innerHTML = '<p>Данные не найдены</p>'; return; }

    titleEl.textContent = `${fx.home} — ${fx.away}`;

    let html = `
      <div class="score-card">
        <div class="score-main">
          <img src="${fx.homeLogo || ''}" style="width:40px;height:40px;object-fit:contain;" onerror="this.style.display='none'">
          <span class="score-big">${fx.homeScore ?? '-'} : ${fx.awayScore ?? '-'}</span>
          <img src="${fx.awayLogo || ''}" style="width:40px;height:40px;object-fit:contain;" onerror="this.style.display='none'">
        </div>
        <div class="match-meta">${fx.minute || fx.status} · ${fx.league || 'Лига'}</div>
      </div>`;

    // Парсинг статистики FotMob
    let statsToRender = [];
    if (data.statistics && data.statistics.length > 0) {
      data.statistics.forEach(group => {
        if (group.stats) {
          group.stats.forEach(stat => {
            statsToRender.push({
              name: stat.title,
              home: stat.stats ? stat.stats[0] : '-',
              away: stat.stats ? stat.stats[1] : '-'
            });
          });
        }
      });
    }

    if (statsToRender.length > 0) {
      const rows = statsToRender.map(s => `<div class="stat-row"><span>${esc(s.name)}</span><b>${esc(s.home)}</b><b>${esc(s.away)}</b></div>`).join('');
      html += `<div class="match-section"><h3 class="section-title">Статистика матча</h3><div class="stats-table">${rows}</div></div>`;
    } else {
      html += `<div class="match-section"><p style="color:var(--muted);font-size:12px;">Статистика появится после начала матча.</p></div>`;
    }

    html += `
      <div class="oracle-cta">
        <h3>🧠 Oracle AI Deep Analysis</h3>
        <p>Математический разбор на основе базы FotMob.</p>
        <button id="run-oracle" class="btn primary" style="margin-top:12px;">Разобрать матч</button>
      </div>`;

    list.innerHTML = html;
    
    document.getElementById('run-oracle')?.addEventListener('click', () => {
      haptic('medium');
      runOracle(fx, statsToRender);
    });
  }

  // --- Математика (Распределение Пуассона) ---
  function factorial(n) { if (n <= 1) return 1; let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; }
  function poisson(k, lambda) { return (Math.exp(-lambda) * Math.pow(lambda, k)) / factorial(k); }

  async function runOracle(fx, stats) {
    const cta = document.querySelector('.oracle-cta');
    cta.innerHTML = `<h3>Анализ...</h3><div class="progress-wrap"><div class="progress-bar" id="progress"></div></div><p id="think-status">Чтение базы FotMob...</p>`;

    const steps = ['Извлечение xG и ударов...', 'Оценка темпа игры...', 'Моделирование Пуассона...', 'Поиск оптимального исхода...'];
    for (let i = 0; i < steps.length; i++) {
      await new Promise(r => setTimeout(r, 600 + Math.random() * 400));
      document.getElementById('think-status').textContent = steps[i];
      document.getElementById('progress').style.width = `${((i+1)/steps.length)*100}%`;
    }

    const isLive = fx.status === 'LIVE';
    const isDone = fx.status === 'FT';
    const gh = fx.homeScore ?? 0;
    const ga = fx.awayScore ?? 0;
    
    // 1. Извлекаем РЕАЛЬНЫЕ данные из статистики FotMob
    let xgHome = 1.35; // Средние по лиге, если нет xG
    let xgAway = 1.15;
    let shotsHome = 0, shotsAway = 0;
    let possessionHome = 50, possessionAway = 50;

    stats.forEach(s => {
      if (s.name.includes('Expected goals') || s.name === 'xG') {
        xgHome = parseFloat(s.home) || xgHome;
        xgAway = parseFloat(s.away) || xgAway;
      }
      if (s.name.includes('Shots on target') || s.name === 'Удары в створ') {
        shotsHome = parseInt(s.home) || 0;
        shotsAway = parseInt(s.away) || 0;
      }
      if (s.name.includes('Ball possession') || s.name === 'Владение') {
        possessionHome = parseInt(s.home) || 50;
        possessionAway = parseInt(s.away) || 50;
      }
    });

    // 2. Корректируем ожидаемые голы (лямбды) для оставшегося времени
    let lambdaHome = xgHome;
    let lambdaAway = xgAway;

    if (isLive) {
      // В Live мы берем оставшееся время (грубо: 90 - текущая минута)
      let minute = parseInt(fx.minute) || 45;
      let timeLeftRatio = Math.max(0.1, (90 - minute) / 90);

      // Ожидаемые голы на остаток матча
      lambdaHome = (xgHome * timeLeftRatio) + (shotsHome * 0.05 * timeLeftRatio);
      lambdaAway = (xgAway * timeLeftRatio) + (shotsAway * 0.05 * timeLeftRatio);

      // Команда, которая проигрывает, будет атаковать сильнее
      if (gh > ga) lambdaAway *= 1.3;
      if (ga > gh) lambdaHome *= 1.3;
    } else if (isDone) {
      lambdaHome = 0; lambdaAway = 0;
    }

    lambdaHome = Math.max(0.01, lambdaHome);
    lambdaAway = Math.max(0.01, lambdaAway);

    // 3. Моделирование Пуассона (до 6 голов)
    let pHomeWin = 0, pDraw = 0, pAwayWin = 0, pOver25 = 0, pUnder25 = 0;
    for (let h = 0; h <= 6; h++) {
      for (let a = 0; a <= 6; a++) {
        const prob = poisson(h, lambdaHome) * poisson(a, lambdaAway);
        const finalH = gh + h;
        const finalA = ga + a;
        
        if (finalH > finalA) pHomeWin += prob;
        else if (finalH < finalA) pAwayWin += prob;
        else pDraw += prob;
        
        if (finalH + finalA > 2.5) pOver25 += prob;
        else pUnder25 += prob;
      }
    }

    // Нормализация
    const sum = pHomeWin + pDraw + pAwayWin;
    pHomeWin /= sum; pDraw /= sum; pAwayWin /= sum;

    // 4. Выбор лучшего исхода
    let bestPick = '';
    let bestTotal = pOver25 > 0.55 ? 'ТБ 2.5' : (pUnder25 > 0.55 ? 'ТМ 2.5' : 'Тотал без перевеса');

    if (isDone) {
      if (gh > ga) bestPick = `П1 (${fx.home})`;
      else if (ga > gh) bestPick = `П2 (${fx.away})`;
      else bestPick = `Ничья (X)`;
    } else {
      if (pHomeWin > pDraw && pHomeWin > pAwayWin) bestPick = `П1 (${fx.home})`;
      else if (pAwayWin > pHomeWin && pAwayWin > pDraw) bestPick = `П2 (${fx.away})`;
      else bestPick = `Ничья (X)`;
    }

    // 5. Рендер результата
    cta.innerHTML = `
      <h3>✅ Вердикт Oracle</h3>
      <div class="verdict-pick" style="font-size:22px; color:var(--accent-2); margin:16px 0;">${esc(bestPick)}</div>
      <div style="font-size:12px; color:var(--muted); text-align:left; line-height:1.6; background:rgba(0,0,0,0.2); padding:12px; border-radius:10px;">
        <b>Вероятности (1X2):</b><br>
        П1: ${(pHomeWin*100).toFixed(1)}% | X: ${(pDraw*100).toFixed(1)}% | П2: ${(pAwayWin*100).toFixed(1)}%<br><br>
        <b>Модель Тоталов:</b><br>
        ТБ 2.5: ${(pOver25*100).toFixed(1)}% | ТМ 2.5: ${(pUnder25*100).toFixed(1)}%<br>
        <i>Рекомендация: ${bestTotal}</i><br><br>
        <b>Данные для расчета:</b><br>
        xG: ${xgHome.toFixed(1)} - ${xgAway.toFixed(1)} | Владение: ${possessionHome}% - ${possessionAway}%
      </div>
    `;
  }

  loadMatch();
})();
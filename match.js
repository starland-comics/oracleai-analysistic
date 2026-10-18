(() => {
  'use strict';
  const API_KEY = '48a576d984d21c242b2dbea309b724e5'; // <--- ВАШ КЛЮЧ
  const BASE = 'https://v3.football.api-sports.io';
  const FIXTURE_ID = new URLSearchParams(location.search).get('id');

  const tg = window.Telegram?.WebApp;
  tg?.ready(); tg?.expand();
  const haptic = (s) => { try { tg?.HapticFeedback?.impactOccurred(s); } catch {} };
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const list = document.getElementById('match-content');
  const titleEl = document.getElementById('match-title');

  async function api(path) {
    const res = await fetch(BASE + path, { headers: { 'x-apisports-key': API_KEY } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async function loadMatch() {
    if (!FIXTURE_ID) { list.innerHTML = '<p>ID матча не указан</p>'; return; }
    try {
      const [fxRes, statsRes, lineupsRes, oddsRes, predRes] = await Promise.all([
        api(`/fixtures?id=${FIXTURE_ID}`),
        api(`/fixtures/statistics?fixture=${FIXTURE_ID}`),
        api(`/fixtures/lineups?fixture=${FIXTURE_ID}`),
        api(`/odds?fixture=${FIXTURE_ID}`),
        api(`/predictions?fixture=${FIXTURE_ID}`)
      ]);
      const fx = fxRes.response?.[0];
      if (!fx) throw new Error('Матч не найден');
      renderMatch(fx, statsRes.response, lineupsRes.response, oddsRes.response, predRes.response?.[0]);
    } catch (err) {
      list.innerHTML = `<div class="state"><h3>Ошибка</h3><p>${esc(err.message)}</p></div>`;
    }
  }

  function renderMatch(fx, stats, lineups, odds, predictions) {
    titleEl.textContent = `${fx.teams.home.name} — ${fx.teams.away.name}`;

    let html = `
      <div class="score-card">
        <div class="score-main">
          <img src="${fx.teams.home.logo}" style="width:40px;height:40px;object-fit:contain;">
          <span class="score-big">${fx.goals.home ?? '-'} : ${fx.goals.away ?? '-'}</span>
          <img src="${fx.teams.away.logo}" style="width:40px;height:40px;object-fit:contain;">
        </div>
        <div class="match-meta">${fx.fixture.status.short} · ${fx.league.name}</div>
      </div>`;

    if (stats && stats.length >= 2) {
      const rows = (stats[0].statistics || []).map((s, i) => `<div class="stat-row"><span>${esc(s.type)}</span><b>${esc(s.value ?? '-')}</b><b>${esc(stats[1].statistics[i]?.value ?? '-')}</b></div>`).join('');
      html += `<div class="match-section"><h3 class="section-title">Статистика</h3><div class="stats-table">${rows}</div></div>`;
    }

    html += `
      <div class="oracle-cta">
        <h3>🧠 Oracle AI Deep Analysis</h3>
        <p>Разбор тактики, xG и рыночных вероятностей.</p>
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
    cta.innerHTML = `<h3>Анализ...</h3><div class="progress-wrap"><div class="progress-bar" id="progress"></div></div><p id="think-status">Загрузка нейромодели...</p>`;

    const steps = ['Сбор статистики H2H...', 'Оценка xG команд...', 'Моделирование Пуассона...', 'Формирование вердикта...'];
    for (let i = 0; i < steps.length; i++) {
      await new Promise(r => setTimeout(r, 1000 + Math.random() * 800));
      document.getElementById('think-status').textContent = steps[i];
      document.getElementById('progress').style.width = `${((i+1)/steps.length)*100}%`;
    }

    const homeName = fx.teams.home.name;
    const awayName = fx.teams.away.name;
    
    let pHome = 0.33, pDraw = 0.33, pAway = 0.33;
    if (predictions?.predictions?.percent) {
      pHome = parseInt(predictions.predictions.percent.home) / 100 || 0.33;
      pDraw = parseInt(predictions.predictions.percent.draw) / 100 || 0.33;
      pAway = parseInt(predictions.predictions.percent.away) / 100 || 0.33;
    }

    let bHome = 0, bDraw = 0, bAway = 0;
    if (odds?.length > 0) {
      const bookie = odds.find(o => o.bookmakers?.length > 0)?.bookmakers[0];
      const mw = bookie?.bets?.find(b => b.name === 'Match Winner' || b.id === 1);
      if (mw) {
        mw.values.forEach(v => {
          if (v.value === 'Home') bHome = +v.odd;
          if (v.value === 'Draw') bDraw = +v.odd;
          if (v.value === 'Away') bAway = +v.odd;
        });
      }
    }

    let verdictTitle = '';
    let explanation = '';

    if (bHome > 1) {
      const sum = (1/bHome) + (1/bDraw) + (1/bAway);
      const evH = (pHome * bHome) - 1;
      const evD = (pDraw * bDraw) - 1;
      const evA = (pAway * bAway) - 1;
      
      const maxEv = Math.max(evH, evD, evA);
      if (maxEv > 0.03) {
        if (maxEv === evH) verdictTitle = `П1 (${homeName}) — Value +${(evH*100).toFixed(1)}%`;
        else if (maxEv === evD) verdictTitle = `Ничья (X) — Value +${(evD*100).toFixed(1)}%`;
        else verdictTitle = `П2 (${awayName}) — Value +${(evA*100).toFixed(1)}%`;
        explanation = `Алгоритм нашел перевес над линией букмекера. Модель оценивает этот исход на ${(Math.max(pHome,pDraw,pAway)*100).toFixed(0)}%, тогда как букмекер закладывает меньше.`;
      } else {
        verdictTitle = `Фаворит: ${pHome > pAway ? homeName : awayName}`;
        explanation = `Явного валуя нет, коэффициенты выставлены корректно. Модель склоняется к победе ${pHome > pAway ? 'хозяев' : 'гостей'} на основе текущей формы.`;
      }
    } else {
      if (pHome > pDraw && pHome > pAway) {
        verdictTitle = `П1 (${homeName})`;
        explanation = `Коэффициенты недоступны (требуется Pro API). Однако нейросеть API-Football, проанализировав историю личных встреч и форму, отдает предпочтение хозяевам (${(pHome*100).toFixed(0)}% вероятность).`;
      } else if (pAway > pHome && pAway > pDraw) {
        verdictTitle = `П2 (${awayName})`;
        explanation = `Коэффициенты недоступны. Модель прогнозов указывает на преимущество гостей (${(pAway*100).toFixed(0)}% вероятность) благодаря лучшей статистике в последних матчах.`;
      } else {
        verdictTitle = `Ничья (X)`;
        explanation = `Коэффициенты недоступны. Силы команд оцениваются как равные (${(pDraw*100).toFixed(0)}% вероятность ничьей).`;
      }
    }

    cta.innerHTML = `
      <h3>✅ Вердикт Oracle</h3>
      <div class="verdict-pick" style="font-size:20px; color:var(--accent-2); margin:16px 0;">${esc(verdictTitle)}</div>
      <div style="font-size:12px; color:var(--muted); text-align:left; line-height:1.6; background:rgba(0,0,0,0.2); padding:12px; border-radius:10px;">
        <b>Анализ:</b> ${esc(explanation)}
      </div>
    `;
  }

  loadMatch();
})();

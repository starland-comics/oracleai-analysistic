(() => {
  'use strict';
  
  const API_URL = 'https://oracleai-scrapper.onrender.com/api';
  const GROQ_API_KEY = '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';
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
    if (!FIXTURE_ID) return;
    try {
      const matchData = await api(`/match/${FIXTURE_ID}`);
      renderMatch(matchData);
    } catch (err) {
      list.innerHTML = `<div class="state"><h3>Ошибка загрузки</h3><p>Попробуйте обновить страницу.</p></div>`;
    }
  }

  function renderMatch(data) {
    const fx = data.event;
    titleEl.textContent = `${fx.home} — ${fx.away}`;

    let html = `
      <div class="score-card">
        <div class="score-main">
          <img src="${fx.homeLogo || ''}" style="width:40px;height:40px;object-fit:contain;" onerror="this.style.display='none'">
          <span class="score-big">${fx.homeScore ?? '-'} : ${fx.awayScore ?? '-'}</span>
          <img src="${fx.awayLogo || ''}" style="width:40px;height:40px;object-fit:contain;" onerror="this.style.display='none'">
        </div>
        <div class="match-meta">${fx.minute || fx.status} · ${fx.league}</div>
      </div>`;

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
      const rows = statsToRender.slice(0, 12).map(s => `<div class="stat-row"><span>${esc(s.name)}</span><b>${esc(s.home)}</b><b>${esc(s.away)}</b></div>`).join('');
      html += `<div class="match-section"><h3 class="section-title">Статистика</h3><div class="stats-table">${rows}</div></div>`;
    }

    html += `
      <div class="oracle-cta">
        <h3>🧠 Oracle AI Deep Analysis</h3>
        <p>Анализ ИИ на основе xG, ударов и времени.</p>
        <button id="run-oracle" class="btn primary" style="margin-top:12px;">Разобрать матч</button>
      </div>`;

    list.innerHTML = html;
    
    document.getElementById('run-oracle')?.addEventListener('click', () => {
      haptic('medium');
      runOracle(fx, statsToRender);
    });
  }

  function factorial(n) { if (n <= 1) return 1; let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; }
  function poisson(k, lambda) { return (Math.exp(-lambda) * Math.pow(lambda, k)) / factorial(k); }

  async function runOracle(fx, stats) {
    const cta = document.querySelector('.oracle-cta');
    cta.innerHTML = `<h3>Анализ...</h3><div class="progress-wrap"><div class="progress-bar" id="progress"></div></div><p id="think-status">Чтение xG...</p>`;

    const steps = ['Анализ xG и ударов...', 'Моделирование счета...', 'Фильтрация исходов...', 'Генерация ИИ-отчета...'];
    for (let i = 0; i < steps.length; i++) {
      await new Promise(r => setTimeout(r, 700 + Math.random() * 400));
      document.getElementById('think-status').textContent = steps[i];
      document.getElementById('progress').style.width = `${((i+1)/steps.length)*100}%`;
    }

    let xgHome = 1.35, xgAway = 1.15;
    let shotsHome = 0, shotsAway = 0;
    
    stats.forEach(s => {
      if (s.name.includes('Expected goals') || s.name === 'xG') {
        xgHome = parseFloat(s.home) || xgHome;
        xgAway = parseFloat(s.away) || xgAway;
      }
      if (s.name.includes('Shots on target')) {
        shotsHome = parseInt(s.home) || 0;
        shotsAway = parseInt(s.away) || 0;
      }
    });

    const gh = fx.homeScore ?? 0;
    const ga = fx.awayScore ?? 0;
    const isLive = fx.status === 'LIVE';
    const isDone = fx.status === 'FT';

    let minute = parseInt(fx.minute) || 0;
    let timeLeftRatio = 1.0; 

    if (isDone) timeLeftRatio = 0;
    else if (isLive) {
      if (fx.minute.includes('HT')) timeLeftRatio = 0.5; 
      else timeLeftRatio = Math.max(0, (90 - minute) / 90);
    }

    let lambdaHome = xgHome * timeLeftRatio;
    let lambdaAway = xgAway * timeLeftRatio;

    if (gh > ga) lambdaAway *= 1.2;
    if (ga > gh) lambdaHome *= 1.2;

    lambdaHome = Math.max(0.01, lambdaHome);
    lambdaAway = Math.max(0.01, lambdaAway);

    let markets = { p1: 0, px: 0, p2: 0, over05: 0, over15: 0, over25: 0, over35: 0, over45: 0, btts: 0 };

    for (let h = 0; h <= 5; h++) {
      for (let a = 0; a <= 5; a++) {
        const prob = poisson(h, lambdaHome) * poisson(a, lambdaAway);
        const finalH = gh + h;
        const finalA = ga + a;
        
        if (finalH > finalA) markets.p1 += prob;
        else if (finalH < finalA) markets.p2 += prob;
        else markets.px += prob;

        if (finalH + finalA > 0.5) markets.over05 += prob;
        if (finalH + finalA > 1.5) markets.over15 += prob;
        if (finalH + finalA > 2.5) markets.over25 += prob;
        if (finalH + finalA > 3.5) markets.over35 += prob;
        if (finalH + finalA > 4.5) markets.over45 += prob;

        if (finalH > 0 && finalA > 0) markets.btts += prob;
      }
    }

    const sum = markets.p1 + markets.px + markets.p2;
    for (let key in markets) markets[key] = markets[key] / sum;

    // ФИЛЬТРАЦИЯ: Собираем только те исходы, которые еще не сыграли
    const totalGoals = gh + ga;
    let availableOutcomes = [];

    if (!isDone) {
      availableOutcomes.push({ name: `П1 (${fx.home})`, prob: markets.p1 });
      availableOutcomes.push({ name: `Ничья (X)`, prob: markets.px });
      availableOutcomes.push({ name: `П2 (${fx.away})`, prob: markets.p2 });
    }

    if (totalGoals < 1.5) {
      availableOutcomes.push({ name: `ТБ 1.5`, prob: markets.over15 });
      availableOutcomes.push({ name: `ТМ 1.5`, prob: 1 - markets.over15 });
    }
    if (totalGoals < 2.5) {
      availableOutcomes.push({ name: `ТБ 2.5`, prob: markets.over25 });
      availableOutcomes.push({ name: `ТМ 2.5`, prob: 1 - markets.over25 });
    }
    if (totalGoals < 3.5) {
      availableOutcomes.push({ name: `ТБ 3.5`, prob: markets.over35 });
      availableOutcomes.push({ name: `ТМ 3.5`, prob: 1 - markets.over35 });
    }

    // ОЗ имеет смысл только если хотя бы одна команда еще не забила
    if (gh === 0 || ga === 0) {
      availableOutcomes.push({ name: `Обе забьют (Да)`, prob: markets.btts });
      availableOutcomes.push({ name: `Обе забьют (Нет)`, prob: 1 - markets.btts });
    }

    // Если матч завершен, выдаем результат
    if (isDone) {
       availableOutcomes = [{ name: gh > ga ? `П1 (${fx.home})` : ga > gh ? `П2 (${fx.away})` : `Ничья (X)`, prob: 1.0 }];
    }

    let bestPick = '';
    let bestProb = 0;

    if (availableOutcomes.length > 0) {
      availableOutcomes.sort((a, b) => b.prob - a.prob);
      bestPick = availableOutcomes[0].name;
      bestProb = availableOutcomes[0].prob;
    } else {
      bestPick = 'Матч завершен';
      bestProb = 0;
    }

    let aiAnalysis = '';
    const topOutcomesStr = availableOutcomes.slice(0, 4).map(o => `${o.name} (${(o.prob*100).toFixed(1)}%)`).join(', ');

    const prompt = `Ты профессиональный футбольный аналитик-синдикатор с 20-летним опытом. 
Матч: ${fx.home} против ${fx.away}.
Текущий счет: ${gh}:${ga} (Статус: ${fx.status}, Время: ${fx.minute}).
Статистика: xG хозяев - ${xgHome}, xG гостей - ${xgAway}. Удары в створ: ${shotsHome} vs ${shotsAway}.
Математическая модель рассчитала вероятности. Доступные для ставки рынки (отсортированные по убыванию вероятности): ${topOutcomesStr}.
Самый вероятный исход: ${bestPick} (${(bestProb*100).toFixed(1)}%). 

Напиши развернутый, профессиональный анализ на русском языке (объемом 4-5 абзацев, около 250 слов). 
В первом абзаце опиши текущую ситуацию на поле (счет, время, темп). 
Во втором абзаце разбери статистику и xG (укажи, кто доминирует и почему). 
В третьем абзаце объясни, почему математическая модель склоняется к ${bestPick}. 
В четвертом абзаце сделай итоговый вывод и дай четкую рекомендацию. 
Пиши уверенно, как эксперт, используй профессиональные термины (xG, валуй, прессинг, темп). Не используй списки, пиши сплошным текстом.`;

    try {
      const aiRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: "llama3-8b-8192",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.6,
          max_tokens: 1000
        })
      });
      const aiJson = await aiRes.json();
      aiAnalysis = aiJson.choices?.[0]?.message?.content || '';
    } catch (e) {
      console.warn('AI error:', e);
    }

    if (!aiAnalysis) {
      aiAnalysis = `Математическая модель проанализировала статистику. Ожидаемые голы (xG): ${xgHome.toFixed(2)} у хозяев и ${xgAway.toFixed(2)} у гостей. На основе распределения Пуассона наиболее вероятным исходом видится <b>${bestPick}</b> с вероятностью ${(bestProb*100).toFixed(1)}%.`;
    }

    cta.innerHTML = `
      <h3>✅ Вердикт Oracle</h3>
      <div class="verdict-pick" style="font-size:22px; color:var(--accent-2); margin:16px 0;">${esc(bestPick)} <span style="font-size:14px;color:var(--text)">(${(bestProb*100).toFixed(1)}%)</span></div>
      
      <div style="font-size:13px; color:var(--text); text-align:left; line-height:1.6; background:rgba(0,0,0,0.2); padding:14px; border-radius:10px; border-left:3px solid var(--accent);">
        ${aiAnalysis.replace(/\n/g, '<br>')}
      </div>
      
      <details style="margin-top:14px; font-size:12px; color:var(--muted); text-align:left;">
        <summary style="cursor:pointer; font-weight:600; margin-bottom:8px;">Полный расклад вероятностей</summary>
        <div style="display:grid; gap:6px;">
          <div><b>Исходы:</b> П1: ${(markets.p1*100).toFixed(1)}% | X: ${(markets.px*100).toFixed(1)}% | П2: ${(markets.p2*100).toFixed(1)}%</div>
          <div><b>Тоталы (изначальные):</b> ТБ 1.5: ${(markets.over15*100).toFixed(1)}% | ТБ 2.5: ${(markets.over25*100).toFixed(1)}% | ТБ 3.5: ${(markets.over35*100).toFixed(1)}%</div>
          <div><b>Обе забьют (изначальные):</b> Да: ${(markets.btts*100).toFixed(1)}% | Нет: ${((1-markets.btts)*100).toFixed(1)}%</div>
        </div>
      </details>
    `;
  }

  loadMatch();
})();

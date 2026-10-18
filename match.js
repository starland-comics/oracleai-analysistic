(() => {
  'use strict';
  const API_KEY = 'fb_live_Tpes2U4wXpp9ks62cJibhei2s0Yo5CAD'; // ВАШ КЛЮЧ
  const BASE = 'https://api.5dollarfootballapi.com/v1';
  const FIXTURE_ID = new URLSearchParams(location.search).get('id');

  const tg = window.Telegram?.WebApp;
  tg?.ready(); tg?.expand();
  const haptic = (s) => { try { tg?.HapticFeedback?.impactOccurred(s); } catch {} };
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pick = (obj, ...paths) => { for (const p of paths) { const val = p.split('.').reduce((a, k) => a?.[k], obj); if (val != null) return val; } return undefined; };

  const list = document.getElementById('match-content');
  const titleEl = document.getElementById('match-title');

  async function api(path) {
    const res = await fetch(BASE + path, {
      headers: { 'Authorization': `Bearer ${API_KEY}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.data || data;
  }

  async function loadMatch() {
    if (!FIXTURE_ID) { list.innerHTML = '<p>ID матча не указан</p>'; return; }
    try {
      // Запрашиваем матч со всеми включениями (события, статистика, коэффициенты)
      const fxRes = await api(`/fixtures/${FIXTURE_ID}?include=events,stats,odds`);
      
      const fx = Array.isArray(fxRes) ? fxRes[0] : fxRes;
      if (!fx) throw new Error('Матч не найден');
      
      renderMatch(fx);
    } catch (err) {
      list.innerHTML = `<div class="state"><h3>Ошибка</h3><p>${esc(err.message)}</p></div>`;
    }
  }

  function renderMatch(fx) {
    const homeName = pick(fx, 'teams.home.name') || 'Хозяева';
    const awayName = pick(fx, 'teams.away.name') || 'Гости';
    titleEl.textContent = `${homeName} — ${awayName}`;

    let html = `
      <div class="score-card">
        <div class="score-main">
          <img src="${pick(fx, 'teams.home.logo') || ''}" style="width:40px;height:40px;object-fit:contain;" onerror="this.style.display='none'">
          <span class="score-big">${pick(fx, 'goals.home') ?? '-'} : ${pick(fx, 'goals.away') ?? '-'}</span>
          <img src="${pick(fx, 'teams.away.logo') || ''}" style="width:40px;height:40px;object-fit:contain;" onerror="this.style.display='none'">
        </div>
        <div class="match-meta">${pick(fx, 'status.short') || 'NS'} · ${pick(fx, 'league.name') || 'Лига'}</div>
      </div>`;

    // Статистика (если есть)
    const stats = fx.statistics;
    if (stats && Array.isArray(stats) && stats.length >= 2) {
      const rows = (stats[0].statistics || []).map((s, i) => `<div class="stat-row"><span>${esc(s.type)}</span><b>${esc(s.value ?? '-')}</b><b>${esc(stats[1].statistics[i]?.value ?? '-')}</b></div>`).join('');
      html += `<div class="match-section"><h3 class="section-title">Статистика</h3><div class="stats-table">${rows}</div></div>`;
    }

    // Составы (если есть)
    const lineups = fx.lineups;
    if (lineups && Array.isArray(lineups) && lineups.length >= 2) {
      const lu = lineups.map(l => `<div class="lineup-team"><h4>${esc(l.team.name)}</h4><p>${(l.startXI||[]).map(p=>esc(p.player.name)).join(', ')||'Нет данных'}</p></div>`).join('');
      html += `<div class="match-section"><h3 class="section-title">Составы</h3>${lu}</div>`;
    }

    // Коэффициенты (если есть)
    const odds = fx.odds;
    if (odds && odds.length) {
      html += `<div class="match-section"><h3 class="section-title">Коэффициенты</h3>`;
      odds.forEach(bookie => {
        html += `<div class="odds-row"><span>${esc(bookie.bookmaker)}</span> <span>${bookie.market}: ${bookie.selections?.map(s => `${s.label} ${s.price}`).join(' · ') || '—'}</span></div>`;
      });
      html += `</div>`;
    }

    html += `
      <div class="oracle-cta">
        <h3>🧠 Oracle AI Deep Analysis</h3>
        <p>Математический разбор матча и поиск лучшего исхода.</p>
        <button id="run-oracle" class="btn primary" style="margin-top:12px;">Разобрать матч</button>
      </div>`;

    list.innerHTML = html;
    
    document.getElementById('run-oracle')?.addEventListener('click', () => {
      haptic('medium');
      runOracle(fx);
    });
  }

  async function runOracle(fx) {
    const cta = document.querySelector('.oracle-cta');
    cta.innerHTML = `<h3>Анализ...</h3><div class="progress-wrap"><div class="progress-bar" id="progress"></div></div><p id="think-status">Сбор данных...</p>`;

    const steps = ['Анализ вероятностей...', 'Сверка с коэффициентами...', 'Моделирование счета...', 'Формирование вердикта...'];
    for (let i = 0; i < steps.length; i++) {
      await new Promise(r => setTimeout(r, 700 + Math.random() * 500));
      document.getElementById('think-status').textContent = steps[i];
      document.getElementById('progress').style.width = `${((i+1)/steps.length)*100}%`;
    }

    // ── 1. Извлекаем коэффициенты ──
    let bHome = 0, bDraw = 0, bAway = 0;
    const odds = fx.odds;
    if (odds && odds.length) {
      // Ищем рынок 1X2 (может называться '1x2', 'match_winner', 'h2h')
      const market1x2 = odds.find(o => o.market === '1x2' || o.market === 'match_winner' || o.market === 'h2h');
      if (market1x2 && market1x2.selections) {
        market1x2.selections.forEach(s => {
          if (s.label === 'Home' || s.label === '1') bHome = +s.price;
          if (s.label === 'Draw' || s.label === 'X') bDraw = +s.price;
          if (s.label === 'Away' || s.label === '2') bAway = +s.price;
        });
      }
    }

    // ── 2. Базовые вероятности ──
    let pHome = 0.4, pDraw = 0.3, pAway = 0.3; // Домашнее преимущество по умолчанию

    // Если есть коэффициенты, вычисляем вероятности из них
    if (bHome > 1) {
      const sum = (1/bHome) + (1/bDraw) + (1/bAway);
      pHome = (1/bHome) / sum;
      pDraw = (1/bDraw) / sum;
      pAway = (1/bAway) / sum;
    }

    // ── 3. Корректировка на счет и статус ──
    const status = String(pick(fx, 'status.short') || 'NS').toUpperCase();
    const isLive = ['1H', '2H', 'HT', 'ET', 'P', 'LIVE'].includes(status);
    const isDone = ['FT', 'AET', 'PEN', 'FINISHED'].includes(status);
    
    const gh = pick(fx, 'goals.home') ?? 0;
    const ga = pick(fx, 'goals.away') ?? 0;

    if (isLive || isDone) {
      const diff = gh - ga;
      const minute = pick(fx, 'status.elapsed') || 90;
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

    // ── 4. Формирование вердикта ──
    let bestPick = '';
    let reason = '';
    let ev = 0;

    if (bHome > 1 && !isLive && !isDone) {
      const evH = (pHome * bHome) - 1;
      const evD = (pDraw * bDraw) - 1;
      const evA = (pAway * bAway) - 1;
      
      const maxEv = Math.max(evH, evD, evA);
      if (maxEv > 0.02) {
        if (maxEv === evH) { bestPick = `П1 (${pick(fx, 'teams.home.name')})`; ev = evH; }
        else if (maxEv === evD) { bestPick = `Ничья (X)`; ev = evD; }
        else { bestPick = `П2 (${pick(fx, 'teams.away.name')})`; ev = evA; }
        reason = `Найден перевес над линией букмекера (Value).`;
      }
    }

    if (!bestPick) {
      if (pHome >= pDraw && pHome >= pAway) {
        bestPick = `П1 (${pick(fx, 'teams.home.name')})`;
        reason = `Модель оценивает вероятность победы хозяев в ${(pHome*100).toFixed(0)}%.`;
      } else if (pAway >= pHome && pAway >= pDraw) {
        bestPick = `П2 (${pick(fx, 'teams.away.name')})`;
        reason = `Модель оценивает вероятность победы гостей в ${(pAway*100).toFixed(0)}%.`;
      } else {
        bestPick = `Ничья (X)`;
        reason = `Модель оценивает вероятность ничьей в ${(pDraw*100).toFixed(0)}%.`;
      }
    }

    // ── 5. Рендер ──
    cta.innerHTML = `
      <h3>✅ Вердикт Oracle</h3>
      <div class="verdict-pick" style="font-size:22px; color:var(--accent-2); margin:16px 0;">${esc(bestPick)}</div>
      <div style="font-size:12px; color:var(--muted); text-align:left; line-height:1.6; background:rgba(0,0,0,0.2); padding:12px; border-radius:10px;">
        <b>Анализ:</b> ${esc(reason)}<br><br>
        <b>Вероятности:</b> П1: ${(pHome*100).toFixed(0)}%, X: ${(pDraw*100).toFixed(0)}%, П2: ${(pAway*100).toFixed(0)}%.
        ${ev > 0 ? `<br><b>Value:</b> +${(ev*100).toFixed(1)}%` : ''}
      </div>
    `;
  }

  loadMatch();
})();

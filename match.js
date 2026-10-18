(() => {
  'use strict';
  const API_KEY = 'c381d2ea1e1569e460c19f762aa5cd8438da4c86'; // ВАШ КЛЮЧ
  const BASE = 'https://sports.bzzoiro.com/api/v2';
  const FIXTURE_ID = new URLSearchParams(location.search).get('id');

  const tg = window.Telegram?.WebApp;
  tg?.ready(); tg?.expand();
  const haptic = (s) => { try { tg?.HapticFeedback?.impactOccurred(s); } catch {} };
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pick = (obj, ...paths) => { 
    for (const p of paths) { 
      const val = p.split('.').reduce((a, k) => a?.[k], obj); 
      if (val != null) return val; 
    } 
    return undefined; 
  };

  const list = document.getElementById('match-content');
  const titleEl = document.getElementById('match-title');

  async function api(path) {
    const res = await fetch(BASE + path, { headers: { 'Authorization': `Token ${API_KEY}` } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return json.results || json.data || json;
  }

  async function loadMatch() {
    if (!FIXTURE_ID) { list.innerHTML = '<p>ID матча не указан</p>'; return; }
    try {
      // Берем сам матч и прогнозы параллельно
      const [fxRes, predRes, oddsRes] = await Promise.all([
        api(`/events/${FIXTURE_ID}/`),
        api(`/events/${FIXTURE_ID}/prediction/`).catch(() => null),
        api(`/events/${FIXTURE_ID}/odds/`).catch(() => null)
      ]);
      
      const fx = Array.isArray(fxRes) ? fxRes[0] : fxRes;
      if (!fx) throw new Error('Матч не найден');
      
      renderMatch(fx, predRes, oddsRes);
    } catch (err) {
      list.innerHTML = `<div class="state"><h3>Ошибка</h3><p>${esc(err.message)}</p></div>`;
    }
  }

  function renderMatch(fx, predictions, odds) {
    const homeName = pick(fx, 'home_team.name', 'home_team') || 'Хозяева';
    const awayName = pick(fx, 'away_team.name', 'away_team') || 'Гости';
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

    html += `
      <div class="oracle-cta">
        <h3>🧠 Oracle AI Deep Analysis</h3>
        <p>Математический разбор матча и поиск лучшего исхода.</p>
        <button id="run-oracle" class="btn primary" style="margin-top:12px;">Разобрать матч</button>
      </div>`;

    list.innerHTML = html;
    
    document.getElementById('run-oracle')?.addEventListener('click', () => {
      haptic('medium');
      runOracle(fx, predictions, odds);
    });
  }

  async function runOracle(fx, predictions, odds) {
    const cta = document.querySelector('.oracle-cta');
    cta.innerHTML = `<h3>Анализ...</h3><div class="progress-wrap"><div class="progress-bar" id="progress"></div></div><p id="think-status">Сбор данных...</p>`;

    const steps = ['Анализ вероятностей...', 'Сверка с коэффициентами...', 'Моделирование счета...', 'Формирование вердикта...'];
    for (let i = 0; i < steps.length; i++) {
      await new Promise(r => setTimeout(r, 700 + Math.random() * 500));
      document.getElementById('think-status').textContent = steps[i];
      document.getElementById('progress').style.width = `${((i+1)/steps.length)*100}%`;
    }

    // ── 1. ПОЛУЧАЕМ БАЗОВЫЕ ВЕРОЯТНОСТИ ──
    let pHome = 0, pDraw = 0, pAway = 0;
    let hasProb = false;

    // Пытаемся найти прогнозы в ответе BSD (проверяем все возможные ключи)
    if (predictions) {
      const rawH = pick(predictions, 'percent.home', 'home_win', 'probabilities.home', 'predictions.home');
      const rawD = pick(predictions, 'percent.draw', 'draw', 'probabilities.draw', 'predictions.draw');
      const rawA = pick(predictions, 'percent.away', 'away_win', 'probabilities.away', 'predictions.away');
      
      if (rawH != null) {
        // Очищаем от знака % и переводим в доли
        pHome = parseFloat(String(rawH).replace('%', '')) / (String(rawH).includes('%') ? 100 : (rawH > 1 ? 100 : 1));
        pDraw = parseFloat(String(rawD).replace('%', '')) / (String(rawD).includes('%') ? 100 : (rawD > 1 ? 100 : 1));
        pAway = parseFloat(String(rawA).replace('%', '')) / (String(rawA).includes('%') ? 100 : (rawA > 1 ? 100 : 1));
        hasProb = true;
      }
    }

    // ── 2. ИЗВЛЕКАЕМ КОЭФФИЦИЕНТЫ (если прогнозов нет, считаем из них) ──
    let bHome = 0, bDraw = 0, bAway = 0;
    if (odds) {
      const markets = Array.isArray(odds) ? odds : (odds.markets || odds.results || []);
      const matchWinner = markets.find(m => m.name?.includes('1X2') || m.name?.includes('Winner'));
      
      if (matchWinner && matchWinner.selections) {
        matchWinner.selections.forEach(s => {
          if (s.name === 'Home' || s.name === '1') bHome = +s.price || +s.odd;
          if (s.name === 'Draw' || s.name === 'X') bDraw = +s.price || +s.odd;
          if (s.name === 'Away' || s.name === '2') bAway = +s.price || +s.odd;
        });
      }
    }

    // Если прогнозов нет, но есть коэффициенты — вычисляем вероятность из них
    if (!hasProb && bHome > 1) {
      const sum = (1/bHome) + (1/bDraw) + (1/bAway);
      pHome = (1/bHome) / sum;
      pDraw = (1/bDraw) / sum;
      pAway = (1/bAway) / sum;
      hasProb = true;
    }

    // ── 3. КОРРЕКТИРОВКА НА СЧЕТ И СТАТУС ──
    const status = String(pick(fx, 'status', 'status_type') || 'NS').toUpperCase();
    const isLive = ['1H', '2H', 'HT', 'ET', 'P', 'LIVE'].includes(status);
    const isDone = ['FT', 'AET', 'PEN', 'FINISHED'].includes(status);
    
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
    } else if (!hasProb) {
      // Если вообще нет данных, даем базовые 33/33/33 (но с преимуществом дома)
      pHome = 0.4; pDraw = 0.3; pAway = 0.3;
    }

    // ── 4. ФОРМИРОВАНИЕ ВЕРДИКТА ──
    let bestPick = '';
    let reason = '';
    let ev = 0;

    if (bHome > 1 && !isLive && !isDone) {
      // Поиск Value до матча
      const evH = (pHome * bHome) - 1;
      const evD = (pDraw * bDraw) - 1;
      const evA = (pAway * bAway) - 1;
      
      const maxEv = Math.max(evH, evD, evA);
      if (maxEv > 0.02) {
        if (maxEv === evH) { bestPick = `П1 (${pick(fx, 'home_team.name', 'home_team')})`; ev = evH; }
        else if (maxEv === evD) { bestPick = `Ничья (X)`; ev = evD; }
        else { bestPick = `П2 (${pick(fx, 'away_team.name', 'away_team')})`; ev = evA; }
        reason = `Найден перевес над линией букмекера (Value).`;
      }
    }

    // Если валуя нет или это Live — выбираем максимальную вероятность
    if (!bestPick) {
      if (pHome >= pDraw && pHome >= pAway) {
        bestPick = `П1 (${pick(fx, 'home_team.name', 'home_team')})`;
        reason = `Модель оценивает вероятность победы хозяев в ${(pHome*100).toFixed(0)}%.`;
      } else if (pAway >= pHome && pAway >= pDraw) {
        bestPick = `П2 (${pick(fx, 'away_team.name', 'away_team')})`;
        reason = `Модель оценивает вероятность победы гостей в ${(pAway*100).toFixed(0)}%.`;
      } else {
        bestPick = `Ничья (X)`;
        reason = `Модель оценивает вероятность ничьей в ${(pDraw*100).toFixed(0)}%.`;
      }
    }

    // ── 5. РЕНДЕР ──
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

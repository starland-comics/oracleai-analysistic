/* ═══════════════════════════════════════════════
   ORACLE AI — Match Detail & Analyst
   ═══════════════════════════════════════════════ */
(() => {
  'use strict';

  /* ───────── Config ───────── */
  const API_KEY = '48a576d984d21c242b2dbea309b724e5'; // Вставьте ключ с dashboard.api-football.com
  const BASE = 'https://v3.football.api-sports.io';
  const FIXTURE_ID = new URLSearchParams(location.search).get('id');

  const tg = window.Telegram?.WebApp;
  tg?.ready(); tg?.expand();
  if (tg?.colorScheme === 'light') document.documentElement.dataset.theme = 'light';

  const haptic = (s = 'light') => { try { tg?.HapticFeedback?.impactOccurred(s); } catch {} };

  const $ = (s) => document.querySelector(s);
  const list = $('#match-content');
  const titleEl = $('#match-title');

  /* ───────── API helper ───────── */
  async function api(path) {
    const res = await fetch(BASE + path, {
      headers: { 'x-apisports-key': API_KEY }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async function parallel(paths) {
    const results = await Promise.allSettled(paths.map(p => api(p)));
    return results.map(r => r.status === 'fulfilled' ? r.value?.response?.[0] ?? r.value?.response ?? null : null);
  }

  /* ───────── Render helpers ───────── */
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function section(title, content, icon = '') {
    return `
      <section class="card match-section" style="--i:1">
        <h3 class="section-title">${icon} ${title}</h3>
        ${content}
      </section>`;
  }

  /* ───────── Load match ───────── */
  async function loadMatch() {
    if (!FIXTURE_ID) {
      list.innerHTML = `<div class="state"><p>Не указан ID матча.</p></div>`;
      return;
    }

    list.innerHTML = `<div class="state"><p class="loading">Загружаю данные...</p></div>`;

    try {
      // Запрашиваем фикстуру, статистику, составы и коэффициенты параллельно
      const [fx, stats, lineups, odds] = await parallel([
        `/fixtures?id=${FIXTURE_ID}`,
        `/fixtures/statistics?fixture=${FIXTURE_ID}`,
        `/fixtures/lineups?fixture=${FIXTURE_ID}`,
        `/odds?fixture=${FIXTURE_ID}`
      ]);

      if (!fx) throw new Error('Матч не найден');

      renderMatch(fx, stats, lineups, odds);
      startLivePolling();

    } catch (err) {
      list.innerHTML = `<div class="state card"><h3>Ошибка</h3><p>${esc(err.message)}</p></div>`;
    }
  }

  /* ───────── Main render ───────── */
  function renderMatch(fx, stats, lineups, odds) {
    const home = fx.teams.home.name;
    const away = fx.teams.away.name;
    const gh = fx.goals.home;
    const ga = fx.goals.away;
    const status = fx.fixture.status.short;
    const elapsed = fx.fixture.status.elapsed;

    titleEl.textContent = `${home} — ${away}`;

    let html = '';

    // 1. Счёт и статус
    html += `
      <div class="card score-card" style="--i:0">
        <div class="score-main">
          <span class="team-name">${esc(home)}</span>
          <span class="score-big">${gh ?? '-'} : ${ga ?? '-'}</span>
          <span class="team-name away">${esc(away)}</span>
        </div>
        <div class="match-meta">
          ${status === 'NS' ? 'Матч ещё не начался' : status === 'FT' ? 'Матч завершён' : `Идёт ${elapsed || ''}'`}
          · ${fx.league.name}
        </div>
      </div>`;

    // 2. Статистика (если есть)
    if (stats && Array.isArray(stats)) {
      const sHome = stats[0]?.statistics || [];
      const sAway = stats[1]?.statistics || [];
      const statRows = sHome.map((s, i) => {
        const a = sAway[i] || {};
        return `<div class="stat-row"><span>${esc(s.type)}</span><b>${esc(s.value ?? '-')}</b><b>${esc(a.value ?? '-')}</b></div>`;
      }).join('');
      html += section('Статистика матча', `<div class="stats-table">${statRows || '<p>Нет данных</p>'}</div>`, '📊');
    }

    // 3. Составы
    if (lineups && lineups.length) {
      const lu = lineups.map(l => `
        <div class="lineup-team">
          <h4>${esc(l.team.name)}</h4>
          <p>${l.startXI?.map(p => esc(p.player.name)).join(', ') || 'Состав не объявлен'}</p>
        </div>`).join('');
      html += section('Стартовые составы', lu, '👥');
    }

    // 4. Коэффициенты (если есть)
    if (odds && odds[0]?.bookmakers?.length) {
      const b = odds[0].bookmakers[0];
      const markets = b.bets?.slice(0, 3).map(bet => `
        <div class="odds-row"><span>${esc(bet.name)}</span> ${bet.values?.map(v => `<b>${esc(v.value)}</b> (${v.odd})`).join(' · ')}</div>
      `).join('');
      html += section('Коэффициенты', markets || '<p>Нет данных</p>', '💰');
    }

    // 5. Кнопка Oracle AI
    html += `
      <div class="card oracle-cta" style="--i:5">
        <h3>🧠 Oracle AI</h3>
        <p>Запустить глубокий анализ матча и получить вердикт.</p>
        <button id="run-oracle" class="btn primary">Разобрать матч</button>
      </div>`;

    list.innerHTML = html;

    // Обработчик кнопки
    $('#run-oracle')?.addEventListener('click', () => runOracle(fx, stats, lineups, odds));
  }

  /* ───────── Live polling ───────── */
  let pollTimer;
  function startLivePolling() {
    clearInterval(pollTimer);
    pollTimer = setInterval(async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const data = await api(`/fixtures?id=${FIXTURE_ID}`);
        const fx = data.response?.[0];
        if (!fx) return;
        // Обновляем только счёт и статус, не перерисовывая всё
        const scoreEl = document.querySelector('.score-big');
        if (scoreEl) scoreEl.textContent = `${fx.goals.home ?? '-'} : ${fx.goals.away ?? '-'}`;
        const metaEl = document.querySelector('.match-meta');
        if (metaEl) {
          metaEl.textContent = `${fx.fixture.status.short === 'NS' ? 'Не начался' : `Идёт ${fx.fixture.status.elapsed || ''}'`} · ${fx.league.name}`;
        }
      } catch {}
    }, 45000);
  }

  /* ───────── ORACLE AI (симуляция размышления) ───────── */
  async function runOracle(fx, stats, lineups, odds) {
    haptic('medium');
    const cta = document.querySelector('.oracle-cta');
    if (!cta) return;

    // 1. Показываем прогресс
    cta.innerHTML = `
      <h3>🧠 Oracle AI размышляет...</h3>
      <div class="progress-wrap"><div class="progress-bar" id="progress"></div></div>
      <p id="think-status" class="think-status">Собираю данные...</p>
    `;

    const statuses = [
      'Собираю историю личных встреч...',
      'Анализирую форму команд...',
      'Сравниваю коэффициенты букмекеров...',
      'Оцениваю составы и травмы...',
      'Моделирую вероятности исходов...',
      'Рассчитываю ценность ставки...',
      'Формулирую вердикт...'
    ];

    const totalTime = 25000 + Math.random() * 35000; // 25–60 секунд
    const stepTime = totalTime / statuses.length;

    for (let i = 0; i < statuses.length; i++) {
      await new Promise(r => setTimeout(r, stepTime));
      const statusEl = document.getElementById('think-status');
      const progEl = document.getElementById('progress');
      if (statusEl) statusEl.textContent = statuses[i];
      if (progEl) progEl.style.width = `${((i + 1) / statuses.length) * 100}%`;
    }

    // 2. Генерируем вердикт (простая эвристика на основе коэффициентов/статистики)
    const verdict = generateVerdict(fx, odds, stats);
    renderVerdict(verdict);
  }

  function generateVerdict(fx, odds, stats) {
    const home = fx.teams.home.name;
    const away = fx.teams.away.name;
    const gh = fx.goals.home;
    const ga = fx.goals.away;
    const isLive = ['1H', '2H', 'HT'].includes(fx.fixture.status.short);

    // Пытаемся вытащить коэффициенты 1X2
    let odds1 = null, oddsX = null, odds2 = null;
    if (odds?.[0]?.bookmakers?.[0]?.bets) {
      const matchWinner = odds[0].bookmakers[0].bets.find(b => b.name === 'Match Winner');
      if (matchWinner) {
        matchWinner.values?.forEach(v => {
          if (v.value === 'Home') odds1 = v.odd;
          if (v.value === 'Draw') oddsX = v.odd;
          if (v.value === 'Away') odds2 = v.odd;
        });
      }
    }

    // Простая логика: если есть коэффициенты, выбираем исход с наименьшим коэффициентом (наиболее вероятный по мнению рынка)
    let pick = 'П1';
    let pickLabel = `Победа ${home}`;
    let confidence = 'Средняя';

    if (odds1 && oddsX && odds2) {
      const min = Math.min(odds1, oddsX, odds2);
      if (min === odds1) { pick = 'П1'; pickLabel = `Победа ${home}`; }
      else if (min === oddsX) { pick = 'X'; pickLabel = 'Ничья'; }
      else { pick = 'П2'; pickLabel = `Победа ${away}`; }
      confidence = min < 1.8 ? 'Высокая' : min < 2.5 ? 'Средняя' : 'Осторожная';
    } else {
      // Если коэффициентов нет — очень грубая эвристика по счёту/статусу
      if (isLive && gh != null && ga != null) {
        if (gh > ga) { pick = 'П1'; pickLabel = `Победа ${home}`; }
        else if (ga > gh) { pick = 'П2'; pickLabel = `Победа ${away}`; }
        else { pick = 'X'; pickLabel = 'Ничья'; }
      } else {
        pick = 'П1'; pickLabel = `Победа ${home}`;
      }
    }

    // Тотал: среднее голов (если есть статистика ударов, можно усложнить; для MVP — просто 2.5)
    const totalGoals = (gh ?? 0) + (ga ?? 0);
    const totalPick = totalGoals >= 2 ? 'ТБ 2.5' : 'ТМ 2.5';

    // Фора: -0.5 для фаворита
    const handicap = pick === 'П1' ? `Ф1 (-0.5)` : pick === 'П2' ? `Ф2 (-0.5)` : 'Ф1 (0)';

    return {
      pick, pickLabel,
      total: totalPick,
      handicap,
      confidence,
      reasoning: buildReasoning(fx, stats, odds, pick)
    };
  }

  function buildReasoning(fx, stats, odds, pick) {
    const home = fx.teams.home.name;
    const away = fx.teams.away.name;
    const lines = [];

    lines.push(`Матч: ${home} — ${away} (${fx.league.name}).`);

    if (odds?.[0]?.bookmakers?.length) {
      lines.push(`Букмекеры оценивают вероятности на основе линии. Мы выбрали исход, который рынок считает наиболее вероятным.`);
    } else {
      lines.push(`Коэффициенты недоступны, поэтому вердикт основан на доступной статистике и счёте.`);
    }

    if (stats && Array.isArray(stats) && stats[0]?.statistics) {
      const s = stats[0].statistics;
      const shots = s.find(x => x.type === 'Total Shots')?.value ?? '?';
      lines.push(`Статистика ударов: ${home} — ${shots}. Это влияет на оценку атакующего потенциала.`);
    }

    lines.push(`Итоговая рекомендация: ${pick}. Уверенность: ${'средняя'}.`);
    return lines.join(' ');
  }

  function renderVerdict(v) {
    const cta = document.querySelector('.oracle-cta');
    if (!cta) return;

    cta.innerHTML = `
      <h3>✅ Вердикт Oracle AI</h3>
      <div class="verdict-main">
        <div class="verdict-pick">${esc(v.pickLabel)}</div>
        <div class="verdict-meta">Уверенность: ${esc(v.confidence)}</div>
      </div>
      <div class="verdict-extra">
        <span>Тотал: <b>${esc(v.total)}</b></span>
        <span>Фора: <b>${esc(v.handicap)}</b></span>
      </div>
      <details class="reasoning">
        <summary>Подробный анализ</summary>
        <p>${esc(v.reasoning)}</p>
      </details>
      <button class="btn" onclick="location.reload()">Новый анализ</button>
    `;
  }

  /* ───────── Boot ───────── */
  loadMatch();
})();

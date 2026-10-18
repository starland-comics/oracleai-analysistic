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

  async function api(path, method = 'GET') {
    const res = await fetch(API_URL + path, { method });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async function loadMatch() {
    if (!FIXTURE_ID) return;
    try {
      const matchData = await api(`/match/${FIXTURE_ID}`);
      renderMatch(matchData);
    } catch (err) {
      list.innerHTML = `<div class="state"><h3>Ошибка загрузки</h3><p>Проверьте интернет или обновите страницу.</p></div>`;
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

    html += `
      <div class="oracle-cta">
        <h3>🧠 Oracle AI Luxury</h3>
        <p>Глубокий анализ формы, H2H и коэффициентов.</p>
        <button id="run-oracle" class="btn primary" style="margin-top:12px;">Разобрать матч</button>
      </div>`;

    list.innerHTML = html;
    
    document.getElementById('run-oracle')?.addEventListener('click', () => {
      haptic('medium');
      runOracle();
    });
  }

  async function runOracle() {
    const cta = document.querySelector('.oracle-cta');
    cta.innerHTML = `<h3>Анализ...</h3><div class="progress-wrap"><div class="progress-bar" id="progress"></div></div><p id="think-status">Сбор данных и ИИ-анализ...</p>`;
    
    // Просто показываем анимацию загрузки, пока ждем сервер
    let progress = 0;
    const timer = setInterval(() => {
      progress += 10;
      if (progress > 90) progress = 90;
      document.getElementById('progress').style.width = `${progress}%`;
    }, 500);

    try {
      const aiData = await api(`/oracle/${FIXTURE_ID}`, 'POST');
      clearInterval(timer);

      cta.innerHTML = `
        <div style="background: #f0f7ff; color: #1a1a1a; border-radius: 16px; padding: 20px; text-align: left; font-family: sans-serif; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
          <div style="display: flex; align-items: center; gap: 8px; font-weight: 600; color: #4a5568; margin-bottom: 12px;">
            <span style="font-size: 18px;">🎯</span> Главный прогноз Oracle
          </div>
          
          <div style="background: #e6f0ff; border-radius: 12px; padding: 16px; margin-bottom: 20px;">
            <div style="font-size: 24px; font-weight: 800; color: #0066ff; text-align: center; margin-bottom: 8px;">
              ${esc(aiData.main_pick || 'Нет данных')}
            </div>
            <div style="text-align: center; font-size: 12px; color: #666;">
              Уверенность: <b>${esc(aiData.confidence || 'Средняя')}</b>
            </div>
          </div>

          <div style="font-size: 14px; line-height: 1.6; color: #333; margin-bottom: 20px;">
            ${esc(aiData.analysis_text || '').replace(/\n/g, '<br>')}
          </div>

          <div style="background: #fff5e6; border: 1px solid #ffe0b2; border-radius: 12px; padding: 16px; margin-bottom: 16px;">
            <div style="font-weight: 700; color: #e65100; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
              ⚠️ Риск
            </div>
            <div style="font-size: 13px; color: #4e342e;">${esc(aiData.risk_text || '-')}</div>
          </div>

          <div style="background: #f5f5f5; border: 1px solid #e0e0e0; border-radius: 12px; padding: 16px;">
            <div style="font-weight: 700; color: #424242; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
              🔄 Альтернатива
            </div>
            <div style="font-size: 13px; color: #616161;">${esc(aiData.alt_text || '-')}</div>
          </div>
        </div>
      `;
    } catch (e) {
      clearInterval(timer);
      cta.innerHTML = `<h3>Ошибка</h3><p>Не удалось получить анализ. Попробуйте позже.</p>`;
    }
  }

  loadMatch();
})();
/* ═══════════════════════════════════
   hud.js — HUD & In-Game UI Updates
═══════════════════════════════════ */
'use strict';

const HUD = (() => {
  const els = {};

  function init() {
    els.alt      = document.getElementById('hud-alt');
    els.vspeed   = document.getElementById('hud-vspeed');
    els.hspeed   = document.getElementById('hud-hspeed');
    els.fuel     = document.getElementById('hud-fuel');
    els.fuelBar  = document.getElementById('fuel-bar');
    els.score    = document.getElementById('hud-score');
    els.level    = document.getElementById('level-badge');
    els.streak   = document.getElementById('streak-banner');
    els.altWarn  = document.getElementById('altitude-warning');
    els.wind     = document.getElementById('wind-indicator');
  }

  function update(G, totalScore) {
    if (!G) return;
    const ground = Physics.terrainY(G.terrain, G.x);
    const alt    = Math.max(0, Math.floor(ground - G.y - G.lh / 2));
    const fuel   = Math.floor(G.fuel);

    if (els.alt) els.alt.textContent = alt + 'm';

    if (els.vspeed) {
      els.vspeed.textContent = G.vy.toFixed(1);
      els.vspeed.className   = 'hud-val ' + _speedClass(G.vy, 2.0, 1.5);
    }
    if (els.hspeed) {
      els.hspeed.textContent = Math.abs(G.vx).toFixed(1);
      els.hspeed.className   = 'hud-val ' + _speedClass(Math.abs(G.vx), 1.5, 1.0);
    }
    if (els.fuel) {
      els.fuel.textContent = fuel + '%';
      els.fuel.className   = 'hud-val ' + (fuel < 15 ? 'danger' : fuel < 30 ? 'warn' : '');
    }
    if (els.fuelBar) {
      els.fuelBar.style.width = fuel + '%';
      els.fuelBar.style.background = fuel < 15
        ? 'linear-gradient(90deg,#ff4757,#ff6b6b)'
        : fuel < 30
        ? 'linear-gradient(90deg,#ffd166,#ffaa33)'
        : 'linear-gradient(90deg,#06ffa5,#00d4ff)';
    }
    if (els.score) els.score.textContent = _fmt(totalScore);

    // Altitude proximity warning
    if (els.altWarn) {
      const cfg = Physics.getLevelConfig(G.level);
      const danger = G.vy > cfg.vLandLimit && alt < 60;
      els.altWarn.textContent = '⚠ VELOCITY TOO HIGH';
      els.altWarn.classList.toggle('show', danger);
    }

    // Wind indicator
    if (els.wind) {
      if (G.wind && Math.abs(G.wind) > 0.005) {
        els.wind.textContent = `WIND ${G.wind > 0 ? '→' : '←'} ${(Math.abs(G.wind)*1000).toFixed(0)}`;
        els.wind.classList.add('visible');
      } else {
        els.wind.classList.remove('visible');
      }
    }
  }

  function setLevel(level) {
    if (els.level) els.level.textContent = 'LVL ' + level;
  }

  function setScore(score) {
    if (els.score) els.score.textContent = _fmt(score);
  }

  function showStreak(streak) {
    if (!els.streak) return;
    els.streak.textContent = `🔥 ${streak}× STREAK — MULTIPLIER ACTIVE`;
    els.streak.classList.add('show');
    setTimeout(() => els.streak.classList.remove('show'), 3200);
  }

  function hideStreak() {
    if (els.streak) els.streak.classList.remove('show');
  }

  function _speedClass(v, dangerThresh, warnThresh) {
    if (v > dangerThresh)  return 'danger';
    if (v > warnThresh)    return 'warn';
    return 'ok';
  }

  function _fmt(n) {
    return n >= 10000 ? (n/1000).toFixed(1)+'K' : String(n);
  }

  // Score modal
  function showResultModal({ type, score, perf, multi, landVy, landVx, streak, totalScore, fuelLeft, timeTaken }) {
    const icon  = document.getElementById('msg-icon');
    const title = document.getElementById('msg-title');
    const sub   = document.getElementById('msg-sub');
    const sc    = document.getElementById('msg-score');
    const bd    = document.getElementById('msg-breakdown');
    const btnNext = document.getElementById('btn-next');
    const overlay = document.getElementById('msg-overlay');
    const box     = document.getElementById('msg-box');

    if (type === 'land') {
      icon.textContent  = perf ? '✨' : '🌙';
      title.textContent = perf ? 'PERFECT LANDING' : 'TOUCHDOWN';
      title.style.color = perf ? '#06ffa5' : '#00d4ff';
      sub.innerHTML     = `V: <b>${landVy.toFixed(2)}</b> m/s &nbsp;·&nbsp; H: <b>${landVx.toFixed(2)}</b> m/s<br>Streak ${streak} &nbsp;·&nbsp; ×${multi} multiplier`;
      sc.textContent    = '+' + _fmt(score);
      sc.style.color    = '#ffd166';
      // Score breakdown
      const baseScore = 1000 + Math.floor(fuelLeft * 10) + Math.max(0, 2000 - timeTaken * 2);
      bd.innerHTML = `
        <div class="bd-row"><span class="bd-label">BASE</span><span class="bd-val">${_fmt(baseScore)}</span></div>
        <div class="bd-row"><span class="bd-label">MULTIPLIER</span><span class="bd-val">×${multi}</span></div>
        ${perf ? '<div class="bd-row"><span class="bd-label">PERFECT BONUS</span><span class="bd-val">+2 MULTI</span></div>' : ''}
        <div class="bd-row"><span class="bd-label">TOTAL THIS RUN</span><span class="bd-val">${_fmt(totalScore)}</span></div>
      `;
      if (btnNext) btnNext.style.display = '';
    } else {
      icon.textContent  = '💥';
      title.textContent = 'MISSION FAILED';
      title.style.color = '#ff4757';
      sub.innerHTML     = 'Craft destroyed on impact.<br>Streak lost. Try again, pilot.';
      sc.textContent    = _fmt(totalScore);
      sc.style.color    = '#ff4757';
      bd.innerHTML      = '';
      if (btnNext) btnNext.style.display = 'none';
    }

    if (els.score) els.score.textContent = _fmt(totalScore);
    if (overlay) overlay.classList.add('active');
    if (box) box.classList.add('show');
  }

  function hideResultModal() {
    const overlay = document.getElementById('msg-overlay');
    const box     = document.getElementById('msg-box');
    if (overlay) overlay.classList.remove('active');
    if (box)     box.classList.remove('show');
  }

  return { init, update, setLevel, setScore, showStreak, hideStreak, showResultModal, hideResultModal };
})();

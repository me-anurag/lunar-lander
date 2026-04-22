/* ═══════════════════════════════════
   game.js — Game State Machine & Loop

   States: idle → playing → landed / crashed
   Session tracks: totalScore, streak, maxStreak,
                   level, totalLandings, perfectLandings
═══════════════════════════════════ */
'use strict';

const Game = (() => {
  let canvas, ctx;
  let G          = null;
  let gameState  = 'idle';
  let totalScore = 0;
  let streak     = 0;
  let maxStreak  = 0;
  let level      = 1;
  let maxLevel   = 1;
  let collided   = false;
  let isTouch    = false;
  let keys       = {};
  let inputFlags = { up: false, left: false, right: false, boost: false };

  // Session tracking for leaderboard ELO
  let sessionLandings  = 0;
  let sessionPerfect   = 0;
  let sessionStarted   = false;

  // SFX throttle timestamps
  let lastThrTime = 0;
  let lastFuelWrn = 0;

  let _raf = null;

  // ── Init ──
  function init() {
    canvas = document.getElementById('game-canvas');
    ctx    = canvas.getContext('2d');
    Renderer.init(canvas);
    HUD.init();
    _bindKeyboard();
    _bindTouchPad();
    _detectTouch();
  }

  // ── Start a fresh session (level 1, score 0) ──
  function startSession() {
    AudioEngine.resume();
    AudioEngine.SFX.startup();
    AudioEngine.SFX.click();
    level = 1; totalScore = 0; streak = 0; maxStreak = 0;
    sessionLandings = 0; sessionPerfect = 0; sessionStarted = true;
    maxLevel = 1;
    HUD.setLevel(1);
    HUD.setScore(0);
    _initLevel();
    if (_raf) cancelAnimationFrame(_raf);
    _loop();
  }

  // ── Initialize one level ──
  function _initLevel() {
    _resizeCanvas();
    // Use CSS/logical dimensions for game coords — renderer scales internally for DPR
    const hudEl = document.getElementById('hud');
    const tcEl  = document.getElementById('touch-controls');
    const hudH  = hudEl ? hudEl.getBoundingClientRect().height || 52 : 52;
    const tcH   = isTouch ? (tcEl ? tcEl.getBoundingClientRect().height || 76 : 76) : 0;
    const W = window.innerWidth;
    const H = Math.max(180, window.innerHeight - hudH - tcH);
    const cfg = Physics.getLevelConfig(level);

    G = {
      W, H,
      x: W * 0.2 + Math.random() * W * 0.6,
      y: H * 0.08,
      vx: (Math.random() - 0.5) * (1 + level * 0.28),
      vy: 0.2,
      angle: 0,
      fuel: 100,
      level,
      wind: cfg.wind ? (Math.random() > 0.5 ? 1 : -1) * cfg.wind : 0,
      turb: cfg.turb,
      terrain: Physics.makeTerrain(W, H, level),
      lw: 28, lh: 22,
      time: 0,
      landVy: 0, landVx: 0
    };

    Renderer.clearParticles();
    collided = false;
    keys = {};
    inputFlags = { up: false, left: false, right: false, boost: false };
    gameState = 'playing';
    HUD.hideResultModal();
    HUD.hideStreak();
    HUD.update(G, totalScore);
  }

  // ── Next level ──
  function nextLevel() {
    AudioEngine.SFX.levelUp();
    HUD.hideResultModal();
    level = Math.min(level + 1, 8);
    maxLevel = Math.max(maxLevel, level);
    HUD.setLevel(level);
    setTimeout(_initLevel, 60);
  }

  // ── Restart session ──
  function restartSession() {
    AudioEngine.SFX.click();
    HUD.hideResultModal();
    level = 1; totalScore = 0; streak = 0; maxStreak = 0;
    sessionLandings = 0; sessionPerfect = 0;
    maxLevel = 1;
    HUD.setLevel(1);
    HUD.setScore(0);
    setTimeout(_initLevel, 60);
  }

  // ── End session (go home) ──
  function endSession() {
    gameState = 'idle';
    if (_raf) { cancelAnimationFrame(_raf); _raf = null; }
    HUD.hideResultModal();
    _submitAndShowGameOver();
  }

  function _submitAndShowGameOver() {
    const pilot = Storage.loadPilot();
    if (!pilot || totalScore === 0) {
      ScreenManager.show('screen-home');
      return;
    }

    // Compute ELO score for leaderboard
    const eloScore = Leaderboard.computeSessionELO({
      rawScore:       totalScore,
      maxLevel,
      totalLandings:  sessionLandings,
      perfectLandings:sessionPerfect,
      maxStreak
    });

    const rank = Storage.submitScore(
      pilot.name, pilot.avatar, eloScore, maxLevel, maxStreak
    );

    // Save session
    Storage.saveScore({
      score:    eloScore,
      raw:      totalScore,
      level:    maxLevel,
      landings: sessionLandings,
      perfect:  sessionPerfect,
      maxStreak,
      date:     Date.now()
    });

    // Build game-over screen
    const percentile  = Storage.getPercentile(eloScore);
    const rankInfo    = Leaderboard.getRankTitle(eloScore);
    const goStats     = document.getElementById('go-stats');
    const goRank      = document.getElementById('go-rank');
    const goRankTitle = document.getElementById('go-rank-title');
    const goPilot     = document.getElementById('go-pilot-name');

    if (goPilot)     goPilot.textContent     = pilot.name;
    if (goRank)      goRank.textContent       = '#' + rank;
    if (goRankTitle) goRankTitle.textContent  = rankInfo.title;
    if (goStats) {
      goStats.innerHTML = `
        <div class="go-stat-row">
          <span class="go-stat-label">FINAL SCORE (ELO)</span>
          <span class="go-stat-val" style="color:#ffd166">${_fmt(eloScore)}</span>
        </div>
        <div class="go-stat-row">
          <span class="go-stat-label">RAW SCORE</span>
          <span class="go-stat-val">${_fmt(totalScore)}</span>
        </div>
        <div class="go-stat-row">
          <span class="go-stat-label">HIGHEST LEVEL</span>
          <span class="go-stat-val">LVL ${maxLevel}</span>
        </div>
        <div class="go-stat-row">
          <span class="go-stat-label">LANDINGS</span>
          <span class="go-stat-val">${sessionLandings} (${sessionPerfect} perfect)</span>
        </div>
        <div class="go-stat-row">
          <span class="go-stat-label">MAX STREAK</span>
          <span class="go-stat-val">🔥 ${maxStreak}×</span>
        </div>
        <div class="go-stat-row">
          <span class="go-stat-label">TOP PERCENTILE</span>
          <span class="go-stat-val" style="color:#06ffa5">Top ${Math.max(1, 100-percentile)}%</span>
        </div>
      `;
    }

    // Check for new personal record
    const allScores = Storage.loadScores();
    const prevBest  = allScores.length > 1 ? Math.max(...allScores.slice(0,-1).map(s=>s.score||0)) : 0;
    if (eloScore > prevBest && prevBest > 0) {
      AudioEngine.SFX.newRecord();
    }

    ScreenManager.show('screen-gameover');
  }

  // ── Physics Tick ──
  function _update() {
    if (gameState !== 'playing' || !G) return;

    G = Physics.tick(G, keys, inputFlags);

    // SFX throttle
    const now = Date.now();
    const up    = keys['ArrowUp']  || keys['w'] || keys['W'] || inputFlags.up;
    const boost = keys[' '] || inputFlags.boost;
    if ((up || boost) && G.fuel > 0 && now - lastThrTime > 80) {
      AudioEngine.SFX.thrust(); lastThrTime = now;
    }
    const left  = keys['ArrowLeft']  || keys['a'] || keys['A'] || inputFlags.left;
    const right = keys['ArrowRight'] || keys['d'] || keys['D'] || inputFlags.right;
    if ((left || right) && G.fuel > 0 && now - lastThrTime > 100) {
      AudioEngine.SFX.side(); lastThrTime = now;
    }
    if (G.fuel < 20 && now - lastFuelWrn > 3000) {
      AudioEngine.SFX.fuelLow(); lastFuelWrn = now;
    }

    _checkCollision();
    HUD.update(G, totalScore);
  }

  // ── Collision ──
  function _checkCollision() {
    if (collided || !G) return;
    const ground = Physics.terrainY(G.terrain, G.x);
    if (G.y + G.lh / 2 >= ground) {
      collided = true;
      const pad = Physics.getPadAt(G.terrain, G.x);
      const cfg = Physics.getLevelConfig(level);
      const safe = G.vy < cfg.vLandLimit &&
                   Math.abs(G.vx) < cfg.hLandLimit &&
                   Math.abs(G.angle) < 25;
      if (pad && safe) {
        _doLand(G.vy, Math.abs(G.vx));
      } else {
        _doCrash(ground);
      }
    }
  }

  function _doLand(vspeed, hspeed) {
    gameState = 'landed';
    G.landVy = vspeed;
    G.landVx = hspeed;
    G.vy = 0; G.vx = 0;

    const perf = (vspeed < 0.8 && hspeed < 0.4 && G.fuel > 15);
    const base = 1000 + Math.floor(G.fuel * 10) + Math.max(0, 2000 - G.time * 2);
    streak++;
    maxStreak  = Math.max(maxStreak, streak);
    sessionLandings++;
    if (perf) sessionPerfect++;

    let multi = streak >= 3 ? 3 : streak >= 2 ? 2 : 1;
    if (perf) multi += 2;

    if (perf) { AudioEngine.SFX.perfect(); } else { AudioEngine.SFX.land(); }
    if (streak >= 3) { AudioEngine.SFX.streak(); HUD.showStreak(streak); }

    const earned = Math.floor(base * multi);
    totalScore  += earned;

    Renderer.spawnLandParticles(G);
    Renderer.spawnComboText(G, '+' + _fmt(earned), perf ? '#06ffa5' : '#ffd166');

    HUD.showResultModal({
      type: 'land', score: earned, perf, multi,
      landVy: vspeed, landVx: hspeed,
      streak, totalScore,
      fuelLeft: G.fuel, timeTaken: G.time
    });
  }

  function _doCrash(ground) {
    gameState = 'crashed';
    streak = 0;
    AudioEngine.SFX.crash();
    Renderer.spawnCrashParticles(G.x, ground);
    setTimeout(() => {
      HUD.showResultModal({
        type: 'crash', score: 0, perf: false, multi: 1,
        landVy: G.vy, landVx: Math.abs(G.vx),
        streak: 0, totalScore,
        fuelLeft: G.fuel, timeTaken: G.time
      });
    }, 700);
  }

  // ── Main Loop ──
  function _loop() {
    StarField.draw();
    if (gameState !== 'idle') {
      _update();
      Renderer.render(G, gameState, keys, inputFlags);
    }
    _raf = requestAnimationFrame(_loop);
  }

  // ── Canvas Resize ──
  function _resizeCanvas() {
    const hudEl = document.getElementById('hud');
    const tcEl  = document.getElementById('touch-controls');
    const hudH  = hudEl ? hudEl.getBoundingClientRect().height || 52 : 52;
    const tcH   = isTouch ? (tcEl ? tcEl.getBoundingClientRect().height || 76 : 76) : 0;
    Renderer.resize(hudH, tcH);
    // Use logical (CSS) dimensions for game coordinates — renderer handles DPR internally
    const cssW = window.innerWidth;
    const cssH = Math.max(180, window.innerHeight - hudH - tcH);
    if (G) { G.W = cssW; G.H = cssH; }
  }

  // ── Touch Detection ──
  function _detectTouch() {
    isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    if (isTouch) {
      const tc = document.getElementById('touch-controls');
      if (tc) tc.style.display = 'flex';
    }
  }

  // ── Touch Pad Binding ──
  function _bindPad(id, flag) {
    const el = document.getElementById(id);
    if (!el) return;
    const press   = e => { if (e?.cancelable) e.preventDefault(); inputFlags[flag] = true;  el.classList.add('pressed'); };
    const release = e => { if (e?.cancelable) e.preventDefault(); inputFlags[flag] = false; el.classList.remove('pressed'); };
    el.addEventListener('touchstart',  press,   { passive: false });
    el.addEventListener('touchend',    release, { passive: false });
    el.addEventListener('touchcancel', release, { passive: false });
    el.addEventListener('mousedown',   press);
    el.addEventListener('mouseup',     release);
    el.addEventListener('mouseleave',  release);
  }
  function _bindTouchPad() {
    _bindPad('tc-up',    'up');
    _bindPad('tc-left',  'left');
    _bindPad('tc-right', 'right');
    _bindPad('tc-boost', 'boost');
  }

  // ── Keyboard ──
  function _bindKeyboard() {
    document.addEventListener('keydown', e => {
      keys[e.key] = true;
      if ((e.key === 'r' || e.key === 'R') && gameState !== 'idle') restartSession();
      if ([' ','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) e.preventDefault();
    });
    document.addEventListener('keyup', e => { keys[e.key] = false; });
  }

  // ── Window Resize ──
  window.addEventListener('resize', () => {
    StarField.init();
    if (gameState !== 'idle') _resizeCanvas();
  });

  function _fmt(n) {
    return n >= 10000 ? (n/1000).toFixed(1)+'K' : String(n);
  }

  // Public getters for session end
  function getSessionData() {
    return { totalScore, maxLevel, sessionLandings, sessionPerfect, maxStreak };
  }

  return {
    init, startSession, nextLevel, restartSession, endSession,
    getSessionData
  };
})();

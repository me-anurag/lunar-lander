/* ═══════════════════════════════════
   game.js — v3.0
   NEW:
   - Rescaled scoring (10-75 pts per land, not 1000s)
   - Auto-advance countdown (3..2..1..GO) after landing
   - Asteroid obstacles from level 3+
   - Level-based background color theme
   - Supabase leaderboard shows all players
═══════════════════════════════════ */
'use strict';

const Game = (() => {
  let canvas;
  let G         = null;
  let gameState = 'idle';
  let totalScore = 0, streak = 0, maxStreak = 0;
  let level = 1, maxLevel = 1;
  let collided = false, isTouch = false;
  let keys = {}, inputFlags = { up:false, left:false, right:false, boost:false };
  let sessionLandings = 0, sessionPerfect = 0;
  let lastThrTime = 0, lastFuelWrn = 0;
  let _raf = null;

  // Auto-advance countdown state
  let _countdownActive = false;
  let _countdownVal    = 3;
  let _countdownTimer  = null;
  let _countdownEl     = null;

  // Asteroids
  let asteroids = [];

  // Level background themes
  const LEVEL_BG = [
    { sky: 'rgba(2,4,8,1)',     horizon: 'rgba(10,22,40,.5)',   accent: '0,212,255'  }, // lv1 — deep space blue
    { sky: 'rgba(4,2,12,1)',    horizon: 'rgba(20,10,40,.5)',   accent: '168,85,247' }, // lv2 — purple nebula
    { sky: 'rgba(8,2,4,1)',     horizon: 'rgba(40,10,10,.5)',   accent: '255,71,87'  }, // lv3 — red dwarf
    { sky: 'rgba(2,8,4,1)',     horizon: 'rgba(10,35,15,.5)',   accent: '6,255,165'  }, // lv4 — green nebula
    { sky: 'rgba(8,6,2,1)',     horizon: 'rgba(40,30,8,.5)',    accent: '255,209,102'}, // lv5 — amber storm
    { sky: 'rgba(2,4,14,1)',    horizon: 'rgba(8,12,60,.5)',    accent: '100,120,255'}, // lv6 — blue giant
    { sky: 'rgba(10,2,2,1)',    horizon: 'rgba(55,5,5,.5)',     accent: '255,100,50' }, // lv7 — volcanic
    { sky: 'rgba(0,0,0,1)',     horizon: 'rgba(20,0,30,.5)',    accent: '200,0,255'  }, // lv8 — void
  ];

  function getLevelBg(lv) { return LEVEL_BG[Math.min(lv - 1, LEVEL_BG.length - 1)]; }

  // ── Init ──
  function init() {
    canvas = document.getElementById('game-canvas');
    Renderer.init(canvas);
    HUD.init();
    _bindKeyboard();
    _bindTouchPad();
    _detectTouch();
    _buildCountdownEl();
  }

  function _buildCountdownEl() {
    _countdownEl = document.createElement('div');
    _countdownEl.id = 'auto-countdown';
    _countdownEl.style.cssText = `
      position:absolute; top:50%; left:50%;
      transform:translate(-50%,-50%);
      font-family:'Rajdhani',sans-serif;
      font-size:clamp(72px,22vw,120px);
      font-weight:700; line-height:1;
      color:#fff; pointer-events:none;
      z-index:40; opacity:0;
      text-shadow:0 0 40px rgba(0,212,255,.8), 0 0 80px rgba(0,212,255,.4);
      transition:opacity .2s ease;
    `;
    const gs = document.getElementById('screen-game');
    if (gs) gs.appendChild(_countdownEl);
  }

  // ── Session start ──
  function startSession() {
    AudioEngine.resume(); AudioEngine.SFX.startup(); AudioEngine.SFX.click();
    level = 1; totalScore = 0; streak = 0; maxStreak = 0;
    sessionLandings = 0; sessionPerfect = 0; maxLevel = 1;
    asteroids = [];
    HUD.setLevel(1); HUD.setScore(0);
    _initLevel();
    if (_raf) cancelAnimationFrame(_raf);
    _loop();
  }

  function _initLevel() {
    _resizeCanvas();
    const hudEl = document.getElementById('hud');
    const tcEl  = document.getElementById('touch-controls');
    const hudH  = hudEl ? hudEl.getBoundingClientRect().height || 52 : 52;
    const tcH   = isTouch ? (tcEl ? tcEl.getBoundingClientRect().height || 76 : 76) : 0;
    const W = window.innerWidth;
    const H = Math.max(180, window.innerHeight - hudH - tcH);
    const cfg = Physics.getLevelConfig(level);

    G = {
      W, H, level,
      x: W * 0.2 + Math.random() * W * 0.6,
      y: H * 0.08,
      vx: (Math.random() - 0.5) * (1 + level * 0.28),
      vy: 0.2,
      angle: 0, fuel: 100,
      wind: cfg.wind ? (Math.random() > 0.5 ? 1 : -1) * cfg.wind : 0,
      turb: cfg.turb,
      terrain: Physics.makeTerrain(W, H, level),
      lw: 28, lh: 22,
      time: 0, landVy: 0, landVx: 0,
      bgTheme: getLevelBg(level)
    };

    // Spawn asteroids from level 3 onwards
    asteroids = [];
    if (level >= 3) _spawnAsteroids(W, H);

    Renderer.clearParticles();
    collided = false;
    keys = {}; inputFlags = { up:false, left:false, right:false, boost:false };
    gameState = 'playing';
    HUD.hideResultModal(); HUD.hideStreak();
    HUD.update(G, totalScore);
    _cancelCountdown();
  }

  function _spawnAsteroids(W, H) {
    const count = Math.min(2 + Math.floor((level - 3) * 1.5), 8);
    for (let i = 0; i < count; i++) {
      asteroids.push({
        x:   Math.random() * W,
        y:   H * 0.1 + Math.random() * H * 0.55,
        vx:  (Math.random() - 0.5) * (1.5 + level * 0.3),
        vy:  (Math.random() - 0.5) * 0.8,
        r:   10 + Math.random() * (8 + level * 2),
        rot: Math.random() * Math.PI * 2,
        rotSpd: (Math.random() - 0.5) * 0.04
      });
    }
  }

  function _tickAsteroids(W, H) {
    for (const a of asteroids) {
      a.x   += a.vx; a.y += a.vy; a.rot += a.rotSpd;
      if (a.x < -a.r)   a.x = W + a.r;
      if (a.x > W + a.r) a.x = -a.r;
      if (a.y < 0)      { a.y = 0;   a.vy *= -1; }
      if (a.y > H * 0.75){ a.y = H*0.75; a.vy *= -1; }
    }
  }

  function _checkAsteroidCollision() {
    if (!G || gameState !== 'playing') return;
    for (const a of asteroids) {
      const dx = G.x - a.x, dy = G.y - a.y;
      if (Math.sqrt(dx*dx + dy*dy) < a.r + G.lw * 0.6) {
        collided = true;
        _doCrash(Physics.terrainY(G.terrain, G.x));
        return;
      }
    }
  }

  // ── Auto-advance countdown after landing ──
  function _startCountdown(onDone) {
    _cancelCountdown();
    _countdownActive = true;
    _countdownVal = 3;
    _showCountdown(_countdownVal);

    _countdownTimer = setInterval(() => {
      _countdownVal--;
      if (_countdownVal > 0) {
        _showCountdown(_countdownVal);
        AudioEngine.SFX.countTick(_countdownVal);
      } else {
        _showCountdown(0); // "GO"
        AudioEngine.SFX.countTick(0);
        _cancelCountdown();
        setTimeout(onDone, 300);
      }
    }, 1000);
  }

  function _showCountdown(n) {
    if (!_countdownEl) return;
    _countdownEl.textContent = n > 0 ? String(n) : 'GO!';
    _countdownEl.style.opacity = '1';
    _countdownEl.style.transform = 'translate(-50%,-50%) scale(1.2)';
    setTimeout(() => {
      if (_countdownEl) {
        _countdownEl.style.transform = 'translate(-50%,-50%) scale(1)';
        if (n === 0) setTimeout(() => { if (_countdownEl) _countdownEl.style.opacity = '0'; }, 250);
      }
    }, 100);
  }

  function _cancelCountdown() {
    _countdownActive = false;
    if (_countdownTimer) { clearInterval(_countdownTimer); _countdownTimer = null; }
    if (_countdownEl)    { _countdownEl.style.opacity = '0'; _countdownEl.textContent = ''; }
  }

  // ── Level up ──
  function nextLevel() {
    AudioEngine.SFX.levelUp();
    HUD.hideResultModal();
    level = Math.min(level + 1, 8); maxLevel = Math.max(maxLevel, level);
    HUD.setLevel(level);
    setTimeout(_initLevel, 60);
  }

  // ── Restart ──
  function restartSession() {
    AudioEngine.SFX.click(); HUD.hideResultModal(); _cancelCountdown();
    level = 1; totalScore = 0; streak = 0; maxStreak = 0;
    sessionLandings = 0; sessionPerfect = 0; maxLevel = 1;
    HUD.setLevel(1); HUD.setScore(0);
    setTimeout(_initLevel, 60);
  }

  // ── End session ──
  function endSession() {
    gameState = 'idle'; _cancelCountdown();
    if (_raf) { cancelAnimationFrame(_raf); _raf = null; }
    HUD.hideResultModal();
    _submitAndShowGameOver();
  }

  async function _submitAndShowGameOver() {
    const pilot = Storage.loadPilot();
    if (!pilot || totalScore === 0) { ScreenManager.show('screen-home'); return; }

    const eloScore = Leaderboard.computeSessionELO({
      rawScore: totalScore, maxLevel,
      totalLandings: sessionLandings, perfectLandings: sessionPerfect, maxStreak
    });

    // Submit to Supabase — await so rank is accurate
    const rank = await Storage.submitScore(pilot.name, pilot.avatar, eloScore, maxLevel, maxStreak);

    Storage.saveScore({ score:eloScore, raw:totalScore, level:maxLevel,
      landings:sessionLandings, perfect:sessionPerfect, maxStreak, date:Date.now() });

    const percentile = Storage.getPercentile(eloScore);
    const rankInfo   = Leaderboard.getRankTitle(eloScore);

    // Populate game-over screen
    const go = id => document.getElementById(id);
    if (go('go-pilot-name'))  go('go-pilot-name').textContent  = pilot.name;
    if (go('go-rank'))        go('go-rank').textContent        = '#' + (rank || '?');
    if (go('go-rank-title'))  go('go-rank-title').textContent  = rankInfo.title;
    if (go('go-stats')) {
      go('go-stats').innerHTML = `
        <div class="go-stat-row"><span class="go-stat-label">FINAL SCORE</span>
          <span class="go-stat-val" style="color:#ffd166">${eloScore}</span></div>
        <div class="go-stat-row"><span class="go-stat-label">HIGHEST LEVEL</span>
          <span class="go-stat-val">LVL ${maxLevel}</span></div>
        <div class="go-stat-row"><span class="go-stat-label">LANDINGS</span>
          <span class="go-stat-val">${sessionLandings} (${sessionPerfect} perfect ✨)</span></div>
        <div class="go-stat-row"><span class="go-stat-label">MAX STREAK</span>
          <span class="go-stat-val">🔥 ${maxStreak}×</span></div>
        <div class="go-stat-row"><span class="go-stat-label">PERCENTILE</span>
          <span class="go-stat-val" style="color:#06ffa5">Top ${Math.max(1,100-percentile)}%</span></div>
      `;
    }

    const allS   = Storage.loadScores();
    const prev   = allS.length > 1 ? Math.max(...allS.slice(0,-1).map(s=>s.score||0)) : 0;
    if (eloScore > prev && prev > 0) AudioEngine.SFX.newRecord();

    ScreenManager.show('screen-gameover');
  }

  // ── Physics tick ──
  function _update() {
    if (gameState !== 'playing' || !G) return;
    G = Physics.tick(G, keys, inputFlags);

    // SFX throttle
    const now = Date.now();
    const up    = keys['ArrowUp'] || keys['w'] || keys['W'] || inputFlags.up;
    const boost = keys[' '] || inputFlags.boost;
    const left  = keys['ArrowLeft']  || keys['a'] || keys['A'] || inputFlags.left;
    const right = keys['ArrowRight'] || keys['d'] || keys['D'] || inputFlags.right;
    if ((up || boost) && G.fuel > 0 && now - lastThrTime > 80) { AudioEngine.SFX.thrust(); lastThrTime = now; }
    if ((left || right) && G.fuel > 0 && now - lastThrTime > 100) { AudioEngine.SFX.side(); lastThrTime = now; }
    if (G.fuel < 20 && now - lastFuelWrn > 3000) { AudioEngine.SFX.fuelLow(); lastFuelWrn = now; }

    _tickAsteroids(G.W, G.H);
    _checkCollision();
    _checkAsteroidCollision();
    HUD.update(G, totalScore);
  }

  function _checkCollision() {
    if (collided || !G) return;
    const ground = Physics.terrainY(G.terrain, G.x);
    if (G.y + G.lh / 2 >= ground) {
      collided = true;
      const pad = Physics.getPadAt(G.terrain, G.x);
      const cfg = Physics.getLevelConfig(level);
      const safe = G.vy < cfg.vLandLimit && Math.abs(G.vx) < cfg.hLandLimit && Math.abs(G.angle) < 25;
      if (pad && safe) { _doLand(G.vy, Math.abs(G.vx)); }
      else             { _doCrash(ground); }
    }
  }

  function _doLand(vspeed, hspeed) {
    gameState = 'landed';
    G.landVy = vspeed; G.landVx = hspeed;
    G.vy = 0; G.vx = 0;

    const isPerf = (vspeed < 0.5 && hspeed < 0.3 && G.fuel > 20);
    streak++; maxStreak = Math.max(maxStreak, streak);
    sessionLandings++; if (isPerf) sessionPerfect++;

    // ── New scoring: small numbers, meaningful ──
    const earned = Leaderboard.calcLandingScore({
      vSpeed: vspeed, hSpeed: hspeed,
      fuel: G.fuel, time: G.time,
      streak, isPerf
    });
    totalScore += earned;

    if (isPerf) { AudioEngine.SFX.perfect(); }
    else        { AudioEngine.SFX.land();    }
    if (streak >= 3) { AudioEngine.SFX.streak(); HUD.showStreak(streak); }

    Renderer.spawnLandParticles(G);
    Renderer.spawnComboText(G, '+' + earned, isPerf ? '#06ffa5' : '#ffd166');

    HUD.showResultModal({
      type:'land', score:earned, perf:isPerf,
      multi: streak >= 5 ? 4 : streak >= 3 ? 3 : streak >= 2 ? 2 : 1,
      landVy:vspeed, landVx:hspeed, streak, totalScore,
      fuelLeft:G.fuel, timeTaken:G.time
    });

    // ── TikTok-style auto-advance countdown ──
    _startCountdown(() => nextLevel());
  }

  function _doCrash(ground) {
    gameState = 'crashed'; streak = 0;
    AudioEngine.SFX.crash();
    Renderer.spawnCrashParticles(G.x, ground);
    // Show modal after crash animation, then auto-countdown restart
    setTimeout(() => {
      HUD.showResultModal({
        type:'crash', score:0, perf:false, multi:1,
        landVy:G.vy, landVx:Math.abs(G.vx),
        streak:0, totalScore, fuelLeft:G.fuel, timeTaken:G.time
      });
      // Auto-restart after crash too — 4 seconds
      _startCountdown(() => restartSession());
    }, 900);
  }

  // ── Main loop ──
  function _loop() {
    StarField.draw();
    if (gameState !== 'idle') {
      _update();
      Renderer.render(G, gameState, keys, inputFlags, asteroids);
    }
    _raf = requestAnimationFrame(_loop);
  }

  function _resizeCanvas() {
    const hudEl = document.getElementById('hud');
    const tcEl  = document.getElementById('touch-controls');
    const hudH  = hudEl ? hudEl.getBoundingClientRect().height || 52 : 52;
    const tcH   = isTouch ? (tcEl ? tcEl.getBoundingClientRect().height || 76 : 76) : 0;
    Renderer.resize(hudH, tcH);
    const cssW = window.innerWidth;
    const cssH = Math.max(180, window.innerHeight - hudH - tcH);
    if (G) { G.W = cssW; G.H = cssH; }
  }

  function _detectTouch() {
    isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    if (isTouch) { const tc = document.getElementById('touch-controls'); if (tc) tc.style.display = 'flex'; }
  }

  function _bindPad(id, flag) {
    const el = document.getElementById(id);
    if (!el) return;
    const on  = e => { if (e?.cancelable) e.preventDefault(); inputFlags[flag]=true;  el.classList.add('pressed'); };
    const off = e => { if (e?.cancelable) e.preventDefault(); inputFlags[flag]=false; el.classList.remove('pressed'); };
    el.addEventListener('touchstart', on,  {passive:false});
    el.addEventListener('touchend',   off, {passive:false});
    el.addEventListener('touchcancel',off, {passive:false});
    el.addEventListener('mousedown',  on);
    el.addEventListener('mouseup',    off);
    el.addEventListener('mouseleave', off);
  }
  function _bindTouchPad() {
    _bindPad('tc-up','up'); _bindPad('tc-left','left');
    _bindPad('tc-right','right'); _bindPad('tc-boost','boost');
  }

  function _bindKeyboard() {
    document.addEventListener('keydown', e => {
      keys[e.key] = true;
      if ((e.key==='r'||e.key==='R') && gameState!=='idle') { _cancelCountdown(); restartSession(); }
      if ([' ','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) e.preventDefault();
    });
    document.addEventListener('keyup', e => { keys[e.key] = false; });
  }

  window.addEventListener('resize', () => {
    StarField.init();
    if (gameState !== 'idle') _resizeCanvas();
  });

  function getSessionData() {
    return { totalScore, maxLevel, sessionLandings, sessionPerfect, maxStreak };
  }

  // Expose asteroids for renderer
  function getAsteroids() { return asteroids; }

  return { init, startSession, nextLevel, restartSession, endSession, getSessionData, getAsteroids };
})();

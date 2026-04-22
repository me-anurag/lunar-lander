/* ═══════════════════════════════════
   renderer.js — Canvas Renderer
═══════════════════════════════════ */
'use strict';

const Renderer = (() => {
  let canvas, ctx;
  let parts = [];   // landing/crash particles
  let exh   = [];   // exhaust particles
  let _particleMul = 1.0;

  function init(canvasEl) {
    canvas = canvasEl;
    ctx    = canvas.getContext('2d');
  }

  function setParticleMul(m) { _particleMul = m; }

  function resize(hudH, tcH) {
    canvas.width  = window.innerWidth;
    canvas.height = Math.max(180, window.innerHeight - hudH - tcH);
  }

  function clearParticles() { parts = []; exh = []; }

  // ── Exhaust Particles ──
  function spawnExhaust(G, dir, boost) {
    const count = Math.round((boost ? 12 : 4) * _particleMul);
    for (let i = 0; i < count; i++) {
      exh.push({
        x: G.x + (dir * G.lw / 2),
        y: G.y + G.lh / 2,
        vx: (Math.random() - 0.5) * (dir === 0 ? 1.6 : 1.0) + dir * 1.1,
        vy: dir === 0 ? Math.random() * 2 + 0.8 : (Math.random() - 0.5) * 1.3,
        life: 1,
        sz:  boost ? 3 + Math.random() * 3.2 : 1.5 + Math.random() * 1.7,
        col: boost ? '#ffd166' : ['#00d4ff','#a855f7','#fff'][Math.floor(Math.random() * 3)]
      });
    }
  }

  function spawnLandParticles(G) {
    const count = Math.round(55 * _particleMul);
    for (let i = 0; i < count; i++) {
      parts.push({
        x: G.x, y: G.y + G.lh / 2,
        vx: (Math.random() - 0.5) * 6,
        vy: -Math.random() * 5 - 1,
        life: 1, dec: 0.015 + Math.random() * 0.018,
        sz: 2 + Math.random() * 3.5, g: 0.12,
        col: ['#06ffa5','#00d4ff','#ffd166','#fff'][Math.floor(Math.random() * 4)]
      });
    }
  }

  function spawnCrashParticles(x, y) {
    const count = Math.round(75 * _particleMul);
    for (let i = 0; i < count; i++) {
      parts.push({
        x, y,
        vx: (Math.random() - 0.5) * 9,
        vy: -Math.random() * 7,
        life: 1, dec: 0.01 + Math.random() * 0.013,
        sz: 2 + Math.random() * 4.5, g: 0.14,
        col: ['#ff4757','#ffd166','#ff6b35','#fff'][Math.floor(Math.random() * 4)]
      });
    }
  }

  function tickParticles() {
    for (let i = exh.length - 1; i >= 0; i--) {
      const e = exh[i];
      e.x += e.vx; e.y += e.vy;
      e.vx *= 0.91; e.vy *= 0.91;
      e.life -= 0.09;
      if (e.life <= 0) exh.splice(i, 1);
    }
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.x += p.vx; p.y += p.vy;
      p.vy += p.g; p.vx *= 0.98;
      p.life -= p.dec;
      if (p.life <= 0) parts.splice(i, 1);
    }
  }

  // ── Draw Routines ──
  function render(G, gameState, keys, inputFlags) {
    if (!canvas || !ctx) return;
    const { W, H } = G;
    ctx.clearRect(0, 0, W, H);

    // Subtle background gradient
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, 'rgba(2,4,8,0)');
    bg.addColorStop(1, 'rgba(10,22,40,.45)');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    // Distant moon glow
    const mg = ctx.createRadialGradient(W*.82, H*.1, 0, W*.82, H*.1, 55);
    mg.addColorStop(0, 'rgba(210,235,255,.07)');
    mg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = mg;
    ctx.beginPath(); ctx.arc(W*.82, H*.1, 55, 0, Math.PI*2); ctx.fill();

    _renderTerrain(G);
    _renderPads(G);
    _renderExhaust();
    if (gameState !== 'crashed') _renderLander(G, keys, inputFlags);
    _renderParticles();
    _renderAltLine(G, gameState);
    _renderWindArrow(G);
    tickParticles();
  }

  function _renderTerrain(G) {
    const { pts } = G.terrain;
    ctx.beginPath(); ctx.moveTo(0, G.H);
    for (const p of pts) ctx.lineTo(p.x, p.y);
    ctx.lineTo(G.W, G.H); ctx.closePath();
    const tg = ctx.createLinearGradient(0, G.H * 0.3, 0, G.H);
    tg.addColorStop(0, 'rgba(14,32,55,.95)');
    tg.addColorStop(1, 'rgba(4,10,20,1)');
    ctx.fillStyle = tg; ctx.fill();
    // Edge glow
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    for (let j = 1; j < pts.length; j++) ctx.lineTo(pts[j].x, pts[j].y);
    ctx.strokeStyle = 'rgba(0,180,255,.13)'; ctx.lineWidth = 1.5; ctx.stroke();
  }

  function _renderPads(G) {
    const t = Date.now() / 1000;
    for (let i = 0; i < G.terrain.pads.length; i++) {
      const pad = G.terrain.pads[i];
      const pulse = 0.55 + 0.45 * Math.sin(t * 2.2 + i);
      const cx    = pad.x + pad.width / 2;

      // Glow halo
      const gg = ctx.createRadialGradient(cx, pad.y, 0, cx, pad.y, pad.width * 0.7);
      gg.addColorStop(0, `rgba(6,255,165,${0.07 * pulse})`);
      gg.addColorStop(1, 'rgba(6,255,165,0)');
      ctx.fillStyle = gg;
      ctx.fillRect(pad.x - 20, pad.y - 24, pad.width + 40, 48);

      // Pad surface
      const pg = ctx.createLinearGradient(pad.x, 0, pad.x + pad.width, 0);
      pg.addColorStop(0,   'rgba(6,255,165,0)');
      pg.addColorStop(0.2, `rgba(6,255,165,${0.95 * pulse})`);
      pg.addColorStop(0.8, `rgba(6,255,165,${0.95 * pulse})`);
      pg.addColorStop(1,   'rgba(6,255,165,0)');
      ctx.fillStyle = pg;
      ctx.fillRect(pad.x, pad.y - 2, pad.width, 3);

      // Tick marks
      const mc = Math.floor(pad.width / 16);
      for (let m = 0; m <= mc; m++) {
        const mx = pad.x + m * (pad.width / mc);
        ctx.strokeStyle = `rgba(6,255,165,${0.42 * pulse})`;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(mx, pad.y - 7); ctx.lineTo(mx, pad.y - 2); ctx.stroke();
      }

      // Label
      const fs = Math.max(8, Math.min(10, canvas.width * 0.022));
      ctx.font = `${fs}px Share Tech Mono`;
      ctx.fillStyle = `rgba(6,255,165,${0.6 * pulse})`;
      ctx.textAlign = 'center';
      ctx.fillText('LANDING ZONE', cx, pad.y - 12);
    }
  }

  function _renderLander(G, keys, inputFlags) {
    ctx.save();
    ctx.translate(G.x, G.y);
    ctx.rotate(G.angle * Math.PI / 180);
    const { lw, lh } = G;

    // Glow halo
    const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, lw * 2);
    gr.addColorStop(0, 'rgba(0,212,255,.12)');
    gr.addColorStop(1, 'rgba(0,212,255,0)');
    ctx.fillStyle = gr; ctx.fillRect(-lw*2, -lh*2, lw*4, lh*4);

    // Legs
    ctx.strokeStyle = 'rgba(0,200,255,.7)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-lw/2, lh/3); ctx.lineTo(-lw*.9, lh/2+4); ctx.lineTo(-lw*1.1, lh/2+4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo( lw/2, lh/3); ctx.lineTo( lw*.9, lh/2+4); ctx.lineTo( lw*1.1, lh/2+4); ctx.stroke();

    // Body
    ctx.beginPath(); ctx.roundRect(-lw/2, -lh/2, lw, lh, 5);
    const bodyG = ctx.createLinearGradient(0, -lh/2, 0, lh/2);
    bodyG.addColorStop(0,   'rgba(0,212,255,.9)');
    bodyG.addColorStop(0.5, 'rgba(0,138,208,.8)');
    bodyG.addColorStop(1,   'rgba(0,68,148,.9)');
    ctx.fillStyle = bodyG; ctx.fill();
    ctx.strokeStyle = 'rgba(0,255,255,.75)'; ctx.lineWidth = 1.5; ctx.stroke();

    // Porthole
    ctx.beginPath(); ctx.arc(0, -2, 5.5, 0, Math.PI*2);
    const wG = ctx.createRadialGradient(0, -2, 0, 0, -2, 5.5);
    wG.addColorStop(0, 'rgba(180,240,255,.9)');
    wG.addColorStop(1, 'rgba(0,100,200,.6)');
    ctx.fillStyle = wG; ctx.fill();
    ctx.strokeStyle = 'rgba(0,255,255,.4)'; ctx.lineWidth = 1; ctx.stroke();

    // Antenna
    ctx.strokeStyle = 'rgba(0,200,255,.8)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, -lh/2); ctx.lineTo(0, -lh/2-8); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, -lh/2-9, 2, 0, Math.PI*2);
    ctx.fillStyle = '#00d4ff'; ctx.fill();

    // Thruster flame
    const firing = (
      keys['ArrowUp'] || keys['w'] || keys['W'] || keys[' '] ||
      inputFlags.up   || inputFlags.boost
    ) && G.fuel > 0;

    if (firing) {
      const flameH = 10 + Math.random() * 8;
      const tg = ctx.createRadialGradient(0, lh/2+5, 0, 0, lh/2+5, flameH + 5);
      tg.addColorStop(0,   'rgba(255,200,50,.9)');
      tg.addColorStop(0.4, 'rgba(255,88,0,.6)');
      tg.addColorStop(1,   'rgba(255,38,0,0)');
      ctx.fillStyle = tg;
      ctx.beginPath(); ctx.arc(0, lh/2+5, flameH + 5, 0, Math.PI*2); ctx.fill();
    }

    ctx.restore();

    // Spawn exhaust in renderer
    if (firing) spawnExhaust(G, 0, keys[' '] || inputFlags.boost);
    if ((keys['ArrowLeft'] || keys['a'] || keys['A'] || inputFlags.left) && G.fuel > 0)
      spawnExhaust(G, -1);
    if ((keys['ArrowRight'] || keys['d'] || keys['D'] || inputFlags.right) && G.fuel > 0)
      spawnExhaust(G, 1);
  }

  function _renderExhaust() {
    for (const e of exh) {
      ctx.globalAlpha = e.life * 0.75;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.sz, 0, Math.PI*2);
      ctx.fillStyle = e.col; ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function _renderParticles() {
    for (const p of parts) {
      ctx.globalAlpha = p.life;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.sz, 0, Math.PI*2);
      ctx.fillStyle = p.col; ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function _renderAltLine(G, gameState) {
    if (gameState !== 'playing') return;
    const ground = Physics.terrainY(G.terrain, G.x);
    const alt    = ground - G.y - G.lh / 2;
    if (alt > 0 && alt < 130) {
      const a = Math.max(0, (130 - alt) / 130) * 0.34;
      ctx.strokeStyle = `rgba(0,212,255,${a})`;
      ctx.lineWidth = 1; ctx.setLineDash([3, 5]);
      ctx.beginPath();
      ctx.moveTo(G.x, G.y + G.lh/2);
      ctx.lineTo(G.x, ground);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function _renderWindArrow(G) {
    if (!G.wind || Math.abs(G.wind) < 0.001) return;
    const dir = G.wind > 0 ? 1 : -1;
    const str = Math.abs(G.wind * 1000).toFixed(0);
    const W = G.W;
    ctx.globalAlpha = 0.5;
    ctx.font = '10px Share Tech Mono';
    ctx.fillStyle = '#00d4ff';
    ctx.textAlign = dir > 0 ? 'left' : 'right';
    ctx.fillText(`WIND ${dir > 0 ? '→' : '←'} ${str}`, dir > 0 ? 10 : W - 10, 20);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  // Combo pop floating text
  function spawnComboText(G, text, color) {
    const el = document.createElement('div');
    el.className = 'combo-pop';
    el.textContent = text;
    el.style.color = color;
    el.style.left  = (G.x / G.W * 100).toFixed(1) + '%';
    el.style.top   = ((G.y - 50) / G.H * 100).toFixed(1) + '%';
    document.getElementById('screen-game').appendChild(el);
    setTimeout(() => el.parentNode && el.parentNode.removeChild(el), 1400);
  }

  return {
    init, resize, render, clearParticles,
    spawnLandParticles, spawnCrashParticles, spawnComboText,
    setParticleMul
  };
})();

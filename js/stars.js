/* ═══════════════════════════════════
   stars.js — Starfield Background
═══════════════════════════════════ */
'use strict';

const StarField = (() => {
  const SC  = document.getElementById('star-canvas');
  const stx = SC.getContext('2d');
  let stars = [];
  let shooting = [];
  let DPR = 1; // device pixel ratio — set in init()

  function init() {
    // ── HD FIX: scale canvas by devicePixelRatio ──
    // Without this, canvas draws at 1x then CSS stretches it → blurry
    DPR = window.devicePixelRatio || 1;
    const W = window.innerWidth;
    const H = window.innerHeight;
    SC.width  = W * DPR;
    SC.height = H * DPR;
    SC.style.width  = W + 'px';
    SC.style.height = H + 'px';
    stx.setTransform(DPR, 0, 0, DPR, 0, 0); // scale all draw calls up

    stars = [];
    // More stars at high DPR screens since we have more pixels
    const count = Math.round(280 * Math.min(DPR, 2));
    for (let i = 0; i < count; i++) {
      stars.push({
        x:   Math.random() * W,
        y:   Math.random() * H,
        r:   Math.random() * 1.6 + 0.2,
        tw:  Math.random() * Math.PI * 2,
        spd: Math.random() * 0.022 + 0.004,
        col: ['#ffffff','#c8e8ff','#ffeedd','#ddeeff','#ffe8ff'][Math.floor(Math.random() * 5)],
        layer: Math.floor(Math.random() * 3)
      });
    }
  }

  function _spawnShooting() {
    if (Math.random() > 0.003) return; // low chance per frame
    shooting.push({
      x: Math.random() * SC.width,
      y: Math.random() * SC.height * 0.4,
      vx: 8 + Math.random() * 6,
      vy: 3 + Math.random() * 3,
      life: 1,
      len: 60 + Math.random() * 40
    });
  }

  function draw() {
    const W = window.innerWidth;
    const H = window.innerHeight;
    stx.clearRect(0, 0, W, H);

    // Stars — use logical pixel coords (transform handles DPR scaling)
    for (const s of stars) {
      s.tw += s.spd;
      const alpha = 0.4 + 0.6 * Math.abs(Math.sin(s.tw));
      stx.globalAlpha = alpha;
      stx.beginPath();
      stx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      stx.fillStyle = s.col;
      stx.fill();
    }

    // Shooting stars
    _spawnShooting();
    for (let i = shooting.length - 1; i >= 0; i--) {
      const s = shooting[i];
      s.x += s.vx; s.y += s.vy; s.life -= 0.025;
      if (s.life <= 0) { shooting.splice(i, 1); continue; }
      const grad = stx.createLinearGradient(s.x - s.vx * 4, s.y - s.vy * 4, s.x, s.y);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(1, `rgba(200,240,255,${s.life * 0.9})`);
      stx.globalAlpha = s.life;
      stx.strokeStyle = grad;
      stx.lineWidth = 1.5;
      stx.beginPath();
      stx.moveTo(s.x - s.len * (s.vx / 10), s.y - s.len * (s.vy / 10));
      stx.lineTo(s.x, s.y);
      stx.stroke();
    }

    stx.globalAlpha = 1;
  }

  window.addEventListener('resize', () => { init(); });

  return { init, draw };
})();

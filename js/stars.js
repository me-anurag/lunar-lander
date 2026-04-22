/* ═══════════════════════════════════
   stars.js — Starfield Background
═══════════════════════════════════ */
'use strict';

const StarField = (() => {
  const SC  = document.getElementById('star-canvas');
  const stx = SC.getContext('2d');
  let stars = [];
  let shooting = [];

  function init() {
    SC.width  = window.innerWidth;
    SC.height = window.innerHeight;
    stars = [];
    for (let i = 0; i < 260; i++) {
      stars.push({
        x:   Math.random() * SC.width,
        y:   Math.random() * SC.height,
        r:   Math.random() * 1.5 + 0.3,
        tw:  Math.random() * Math.PI * 2,
        spd: Math.random() * 0.022 + 0.004,
        col: ['#ffffff','#aaddff','#ffeedd','#ddeeff'][Math.floor(Math.random() * 4)],
        layer: Math.floor(Math.random() * 3) // 0=far, 1=mid, 2=near
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
    stx.clearRect(0, 0, SC.width, SC.height);

    // Stars
    for (const s of stars) {
      s.tw += s.spd;
      const alpha = 0.35 + 0.65 * Math.abs(Math.sin(s.tw));
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
      grad.addColorStop(1, `rgba(200,240,255,${s.life * 0.8})`);
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

  window.addEventListener('resize', () => {
    SC.width  = window.innerWidth;
    SC.height = window.innerHeight;
  });

  return { init, draw };
})();

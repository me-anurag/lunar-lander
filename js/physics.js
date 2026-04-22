/* ═══════════════════════════════════
   physics.js — Game Physics Engine
═══════════════════════════════════ */
'use strict';

const Physics = (() => {

  // Level configuration — deliberately designed for progressive difficulty
  // Don Normam: Feedback loops + Clear challenge gradient
  const LEVEL_CONFIG = [
    // lv1: gentle intro — wide pad, mild gravity, no wind
    { gravity:0.055, thrustPow:0.18, fuelBurn:0.35, wind:0,     turb:0,     padCount:3, padWidth:110, terrainRough:0.4, vLandLimit:2.2, hLandLimit:1.8 },
    // lv2: slightly harder
    { gravity:0.060, thrustPow:0.175, fuelBurn:0.38, wind:0,    turb:0,     padCount:2, padWidth:100, terrainRough:0.5, vLandLimit:2.1, hLandLimit:1.7 },
    // lv3: narrow pads
    { gravity:0.065, thrustPow:0.170, fuelBurn:0.40, wind:0,    turb:0,     padCount:2, padWidth:88,  terrainRough:0.6, vLandLimit:2.0, hLandLimit:1.6 },
    // lv4: wind introduced
    { gravity:0.070, thrustPow:0.165, fuelBurn:0.42, wind:0.010,turb:0,     padCount:2, padWidth:80,  terrainRough:0.7, vLandLimit:2.0, hLandLimit:1.5 },
    // lv5: turbulence added
    { gravity:0.075, thrustPow:0.160, fuelBurn:0.44, wind:0.013,turb:0.005, padCount:2, padWidth:72,  terrainRough:0.8, vLandLimit:1.9, hLandLimit:1.4 },
    // lv6: single pad, tighter
    { gravity:0.080, thrustPow:0.155, fuelBurn:0.46, wind:0.016,turb:0.007, padCount:1, padWidth:64,  terrainRough:0.9, vLandLimit:1.8, hLandLimit:1.3 },
    // lv7: strong wind, less thrust
    { gravity:0.085, thrustPow:0.150, fuelBurn:0.48, wind:0.020,turb:0.009, padCount:1, padWidth:56,  terrainRough:1.0, vLandLimit:1.7, hLandLimit:1.2 },
    // lv8: NIGHTMARE — tight pad, chaotic
    { gravity:0.090, thrustPow:0.145, fuelBurn:0.50, wind:0.024,turb:0.012, padCount:1, padWidth:48,  terrainRough:1.1, vLandLimit:1.6, hLandLimit:1.1 },
  ];

  function getLevelConfig(level) {
    return LEVEL_CONFIG[Math.min(level - 1, LEVEL_CONFIG.length - 1)];
  }

  // Terrain generation using midpoint displacement + pad flattening
  function makeTerrain(W, H, level) {
    const cfg  = getLevelConfig(level);
    const segs = 16 + level * 2;
    const sw   = W / segs;
    const pc   = cfg.padCount;

    // Place pads avoiding edges and each other
    const padSegs = [];
    let attempts  = 0;
    while (padSegs.length < pc && attempts < 200) {
      const s = 2 + Math.floor(Math.random() * (segs - 5));
      if (!padSegs.some(p => Math.abs(p - s) < 4)) padSegs.push(s);
      attempts++;
    }

    const pads = padSegs.map(seg => ({
      x: seg * sw,
      width: cfg.padWidth,
      y: 0
    }));

    // Generate terrain heights
    const pts = [];
    for (let j = 0; j <= segs; j++) {
      let y = H * 0.42
        + Math.sin(j * 0.7) * 52
        + Math.cos(j * 1.4) * 36
        + (Math.random() - 0.5) * 80 * cfg.terrainRough;
      y = Math.min(y, H * 0.80);
      y = Math.max(y, H * 0.18);
      pts.push({ x: j * sw, y });
    }

    // Flatten terrain under pads
    pads.forEach(pad => {
      const si = Math.floor(pad.x / sw);
      const ei = Math.ceil((pad.x + pad.width) / sw);
      const lo = pts[si]?.y ?? H * 0.5;
      const hi = pts[Math.min(ei, pts.length - 1)]?.y ?? H * 0.5;
      const ay = (lo + hi) / 2;
      for (let k = si; k <= ei && k < pts.length; k++) pts[k].y = ay;
      pad.y = ay;
    });

    return { pts, pads, sw, segs };
  }

  // Interpolate terrain height at world X
  function terrainY(terrain, x) {
    const { pts, sw } = terrain;
    const idx = Math.floor(x / sw);
    if (idx >= pts.length - 1) return pts[pts.length - 1].y;
    if (idx < 0) return pts[0].y;
    const frac = (x - pts[idx].x) / sw;
    return pts[idx].y + (pts[idx + 1].y - pts[idx].y) * frac;
  }

  // Check if position is over a pad
  function getPadAt(terrain, x) {
    for (const p of terrain.pads) {
      if (x >= p.x && x <= p.x + p.width) return p;
    }
    return null;
  }

  // Simulate one physics tick — returns new state
  // NOTE: gameState is passed explicitly — G itself has no .gameState property
  function tick(G, keys, inputFlags) {
    if (!G) return G;

    const cfg = getLevelConfig(G.level);
    let { x, y, vx, vy, fuel, angle, time, wind, turb } = G;

    // Gravity
    vy += cfg.gravity;
    // Wind
    vx += (Math.random() - 0.5) * 0.002; // micro variance always
    if (wind) vx += wind;
    // Turbulence
    if (turb) {
      vx += (Math.random() - 0.5) * turb;
      vy += (Math.random() - 0.5) * turb * 0.5;
    }

    const now = Date.now();
    const up    = keys['ArrowUp']    || keys['w'] || keys['W'] || inputFlags.up;
    const left  = keys['ArrowLeft']  || keys['a'] || keys['A'] || inputFlags.left;
    const right = keys['ArrowRight'] || keys['d'] || keys['D'] || inputFlags.right;
    const boost = keys[' '] || inputFlags.boost;

    let thrusting = false, siding = false;

    if (up && fuel > 0) {
      vy   -= cfg.thrustPow;
      fuel -= cfg.fuelBurn;
      thrusting = true;
    }
    if (left && fuel > 0) {
      vx   += 0.08;
      fuel -= cfg.fuelBurn * 0.43;
      siding = true;
    }
    if (right && fuel > 0) {
      vx   -= 0.08;
      fuel -= cfg.fuelBurn * 0.43;
      siding = true;
    }
    if (boost && fuel > 2) {
      vy   -= cfg.thrustPow * 2.4;
      fuel -= cfg.fuelBurn * 3.1;
      thrusting = true;
    }

    fuel  = Math.max(0, fuel);
    angle = Math.max(-44, Math.min(44, vx * 11));
    x += vx; y += vy;
    time++;

    // Wall bounce
    const { W, H } = G;
    if (x < 10)     { x = 10;    vx =  Math.abs(vx) * 0.5; }
    if (x > W - 10) { x = W-10;  vx = -Math.abs(vx) * 0.5; }
    if (y < 0)      { y = 0;     vy =  Math.abs(vy) * 0.3;  }

    return { ...G, x, y, vx, vy, fuel, angle, time, thrusting, siding };
  }

  return { getLevelConfig, makeTerrain, terrainY, getPadAt, tick };
})();

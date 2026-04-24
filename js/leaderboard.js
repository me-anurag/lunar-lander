/* ═══════════════════════════════════
   leaderboard.js — v3.0
   FIXED:
   - Global board pulls from Supabase (async), not localStorage
   - Each user sees ALL players, not just themselves
   - Scoring rescaled: max ~500 pts per landing (not 4000+)
   - Rank thresholds redesigned — Commander is truly hard

   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   NEW SCORING FORMULA
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

   Per landing:
     precision  = max(0, 10 - vSpeed×3 - hSpeed×2)       → 0-10 pts
     fuel_bonus = floor(fuel / 10)                         → 0-10 pts
     time_bonus = max(0, 10 - floor(time/60))             → 0-10 pts
     base       = precision + fuel_bonus + time_bonus      → 0-30 pts
     multi      = streak≥5→×4 | streak≥3→×3 | streak≥2→×2 | ×1
     perf_bonus = Vy<0.5 AND Hx<0.3 AND fuel>20 → +15 flat
     earned     = floor(base × multi) + perf_bonus         → typ 10-75 pts

   Session ELO (what gets stored):
     ELO = raw × level_multi × accuracy_bonus × streak_bonus
     level_multi   = 1 + (maxLevel-1) × 0.18
     accuracy_bonus= 1 + (perfectLandings/totalLandings) × 0.6
     streak_bonus  = 1 + (maxStreak/15) × 0.4

   Rank Thresholds (HARD — require sustained skill):
     ≥ 2000 → COMMANDER     (requires lvl 7+, near-perfect accuracy)
     ≥  900 → ACE PILOT     (requires lvl 5+, good streak)
     ≥  400 → VETERAN       (consistent play through lvl 4)
     ≥  150 → PILOT         (completed several sessions)
     <  150 → CADET

   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
═══════════════════════════════════ */
'use strict';

const Leaderboard = (() => {

  const RANK_TITLES = [
    { min: 2000, title: 'COMMANDER',  badge: 'gold',   icon: '⭐' },
    { min:  900, title: 'ACE PILOT',  badge: 'purple', icon: '🚀' },
    { min:  400, title: 'VETERAN',    badge: 'green',  icon: '🛸' },
    { min:  150, title: 'PILOT',      badge: 'blue',   icon: '🌙' },
    { min:    0, title: 'CADET',      badge: 'dim',    icon: '⚡' },
  ];

  const MEDALS = { 1: '🥇', 2: '🥈', 3: '🥉' };

  function getRankTitle(score) {
    for (const r of RANK_TITLES) {
      if (score >= r.min) return r;
    }
    return RANK_TITLES[RANK_TITLES.length - 1];
  }

  // ── New low-scale scoring ──
  function calcLandingScore({ vSpeed, hSpeed, fuel, time, streak, isPerf }) {
    const precision  = Math.max(0, 10 - vSpeed * 3 - hSpeed * 2);
    const fuelBonus  = Math.floor(fuel / 10);
    const timeBonus  = Math.max(0, 10 - Math.floor(time / 60));
    const base       = precision + fuelBonus + timeBonus;        // 0–30
    const multi      = streak >= 5 ? 4 : streak >= 3 ? 3 : streak >= 2 ? 2 : 1;
    const perfBonus  = isPerf ? 15 : 0;
    return Math.floor(base * multi) + perfBonus;
  }

  // ── Session ELO for leaderboard ──
  function computeSessionELO({ rawScore, maxLevel, totalLandings, perfectLandings, maxStreak }) {
    const lm = 1 + (Math.max(1, maxLevel) - 1) * 0.18;
    const acc = totalLandings > 0 ? perfectLandings / totalLandings : 0;
    const ab  = 1 + acc * 0.6;
    const sb  = 1 + (Math.min(maxStreak, 15) / 15) * 0.4;
    return Math.round(rawScore * lm * ab * sb);
  }

  // ── Render board ──
  function renderBoard(entries, currentPilotName, mode) {
    const container = document.getElementById('lb-list');
    if (!container) return;

    if (!Array.isArray(entries) || entries.length === 0) {
      container.innerHTML = `<div class="lb-empty">
        🌙 No pilots on record yet.<br>Be the first to stake your claim!
      </div>`;
      return;
    }

    if (mode === 'myrank') {
      const myIdx = entries.findIndex(e => e.name === currentPilotName);
      if (myIdx === -1) {
        container.innerHTML = `<div class="lb-empty">
          Play a mission to appear on the board!
        </div>`;
        return;
      }
      const me   = entries[myIdx];
      const rank = myIdx + 1;
      const pct  = Storage.getPercentile(me.score);
      const rt   = getRankTitle(me.score);
      container.innerHTML = `
        <div class="lb-my-highlight">
          <div class="lb-my-rank-num">#${rank}</div>
          <div class="lb-my-rank-label">GLOBAL RANK</div>
          <div class="lb-my-percentile">Top ${Math.max(1, 100 - pct)}% of all pilots</div>
          <div style="margin-top:8px">
            <span class="achievement-badge ${rt.badge}">${rt.icon} ${rt.title}</span>
          </div>
        </div>
      `;
      const start = Math.max(0, myIdx - 2);
      const end   = Math.min(entries.length, myIdx + 3);
      container.innerHTML += entries.slice(start, end)
        .map((e, i) => _entryHTML(e, start + i + 1, e.name === currentPilotName))
        .join('');
      return;
    }

    container.innerHTML = entries.slice(0, 50)
      .map((e, i) => _entryHTML(e, i + 1, e.name === currentPilotName))
      .join('');
  }

  function _entryHTML(entry, rank, isMe) {
    const rankClass = rank <= 3 ? `rank-${rank}` : '';
    const isClass   = isMe ? ' is-me' : '';
    const medal     = MEDALS[rank] || '';
    const rankLabel = medal || `#${rank}`;
    const rCls      = rank <= 3 ? `r${rank}` : 'rn';
    const rt        = getRankTitle(entry.score);
    const dateStr   = _formatDate(entry.date);
    const levelStr  = entry.level  ? `LVL ${entry.level}`    : '';
    const streakStr = entry.streak > 1 ? ` · 🔥${entry.streak}×` : '';
    const badge     = rt.badge.replace('gold','commander')
                              .replace('purple','ace')
                              .replace('green','pilot')
                              .replace('blue','veteran')
                              .replace('dim','cadet');
    return `
      <div class="lb-entry ${rankClass}${isClass}">
        <div class="lb-rank ${rCls}">${rankLabel}</div>
        <div class="lb-avatar">${entry.avatar || '🚀'}</div>
        <div class="lb-info">
          <div class="lb-name">${_esc(entry.name)}${isMe ? ' <span style="color:var(--blue);font-size:10px">(YOU)</span>' : ''}</div>
          <div class="lb-meta">${levelStr}${streakStr} · ${dateStr}</div>
        </div>
        <div class="lb-score-col">
          <div class="lb-score">${entry.score}</div>
          <div class="lb-rank-title badge-${badge}">${rt.icon} ${rt.title}</div>
        </div>
      </div>
    `;
  }

  function _formatDate(ts) {
    if (!ts) return '';
    const diffMs = Date.now() - ts;

    // Guard against future timestamps (clock skew) — show "just now"
    if (diffMs < 0) return 'just now';

    const diffSec = diffMs / 1000;
    const diffMin = diffMs / 60000;
    const diffH   = diffMs / 3600000;

    if (diffSec < 45)        return 'just now';
    if (diffMin < 2)         return '1m ago';
    if (diffMin < 60)        return Math.floor(diffMin) + 'm ago';
    if (diffH < 2)           return '1h ago';
    if (diffH < 24)          return Math.floor(diffH) + 'h ago';
    if (diffH < 48)          return 'yesterday';
    // More than 2 days: show actual date
    const d = new Date(ts);
    return `${d.getUTCDate()}/${d.getUTCMonth()+1}`;
  }

  function _esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function animateEntries() {
    document.querySelectorAll('.lb-entry').forEach((el, i) => {
      el.style.opacity = '0';
      el.style.transform = 'translateX(-12px)';
      setTimeout(() => {
        el.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        el.style.opacity = '1';
        el.style.transform = 'translateX(0)';
      }, i * 50);
    });
  }

  return { renderBoard, getRankTitle, computeSessionELO, calcLandingScore, animateEntries };
})();

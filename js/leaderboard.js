/* ═══════════════════════════════════
   leaderboard.js — Scoring Math & Rendering

   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   LEADERBOARD SCORE FORMULA
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

   Score per landing:
     base     = 1000 + (fuel_remaining × 10) + max(0, 2000 − time_elapsed × 2)
     multi     = streak ≥ 3 → ×3 | streak ≥ 2 → ×2 | ×1
     perf_bonus = landVy < 0.8 AND landVx < 0.4 AND fuel > 15 → +2 to multi
     earned    = floor(base × multi)

   Session ELO (leaderboard rank value):
     ELO = Σ(earned) × level_multiplier × accuracy_bonus × efficiency_coeff
     level_multiplier = 1 + (max_level_reached − 1) × 0.15
     accuracy_bonus   = 1 + (perfect_landings / total_landings) × 0.5
     efficiency_coeff = 1 + (max_streak / 10) × 0.3

   Rank Titles:
     ≥ 40000 → COMMANDER
     ≥ 25000 → ACE PILOT
     ≥ 15000 → VETERAN
     ≥  8000 → PILOT
     <  8000 → CADET

   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
═══════════════════════════════════ */
'use strict';

const Leaderboard = (() => {

  const RANK_TITLES = [
    { min: 40000, title: 'COMMANDER',  badge: 'gold'   },
    { min: 25000, title: 'ACE PILOT',  badge: 'purple' },
    { min: 15000, title: 'VETERAN',    badge: 'green'  },
    { min:  8000, title: 'PILOT',      badge: 'blue'   },
    { min:      0, title: 'CADET',     badge: 'dim'    },
  ];

  const MEDALS = { 1: '🥇', 2: '🥈', 3: '🥉' };

  function getRankTitle(score) {
    for (const r of RANK_TITLES) {
      if (score >= r.min) return r;
    }
    return RANK_TITLES[RANK_TITLES.length - 1];
  }

  // Compute the ELO-like session score for leaderboard submission
  function computeSessionELO({ rawScore, maxLevel, totalLandings, perfectLandings, maxStreak }) {
    const level_multi   = 1 + (Math.max(1, maxLevel) - 1) * 0.15;
    const accuracy      = totalLandings > 0 ? perfectLandings / totalLandings : 0;
    const acc_bonus     = 1 + accuracy * 0.5;
    const eff_coeff     = 1 + (Math.min(maxStreak, 10) / 10) * 0.3;
    return Math.round(rawScore * level_multi * acc_bonus * eff_coeff);
  }

  // Render leaderboard list to #lb-list
  function renderBoard(entries, currentPilotName, mode) {
    const container = document.getElementById('lb-list');
    if (!container) return;

    if (entries.length === 0) {
      container.innerHTML = `<div class="lb-empty">
        🌙 No pilots on record yet.<br>Be the first to stake your claim!
      </div>`;
      return;
    }

    // My Rank tab special view
    if (mode === 'myrank') {
      const myIdx = entries.findIndex(e => e.name === currentPilotName);
      if (myIdx === -1) {
        container.innerHTML = `<div class="lb-empty">
          Play a mission to appear on the board!
        </div>`;
        return;
      }
      const me = entries[myIdx];
      const rank = myIdx + 1;
      const pct  = Storage.getPercentile(me.score);
      const rt   = getRankTitle(me.score);
      container.innerHTML = `
        <div class="lb-my-highlight">
          <div class="lb-my-rank-num">#${rank}</div>
          <div class="lb-my-rank-label">GLOBAL RANK</div>
          <div class="lb-my-percentile">Top ${Math.max(1, 100 - pct)}% of all pilots</div>
          <div style="margin-top:8px">
            <span class="achievement-badge ${rt.badge}">${rt.title}</span>
          </div>
        </div>
      `;
      // Show surrounding 5 entries
      const start = Math.max(0, myIdx - 2);
      const end   = Math.min(entries.length, myIdx + 3);
      const nearby = entries.slice(start, end);
      container.innerHTML += nearby.map((e, i) =>
        _entryHTML(e, start + i + 1, e.name === currentPilotName)
      ).join('');
      return;
    }

    container.innerHTML = entries.slice(0, 50).map((e, i) =>
      _entryHTML(e, i + 1, e.name === currentPilotName)
    ).join('');
  }

  function _entryHTML(entry, rank, isMe) {
    const rankClass = rank <= 3 ? `rank-${rank}` : '';
    const isClass   = isMe ? ' is-me' : '';
    const medal     = MEDALS[rank] || '';
    const rankLabel = medal || `#${rank}`;
    const rNum      = rank <= 3 ? `r${rank}` : 'rn';
    const rt        = getRankTitle(entry.score);
    const dateStr   = _formatDate(entry.date);
    const levelStr  = entry.level ? `LVL ${entry.level}` : '';
    const streakStr = entry.streak > 1 ? ` · 🔥${entry.streak}×` : '';

    return `
      <div class="lb-entry ${rankClass}${isClass}">
        <div class="lb-rank ${rNum}">${rankLabel}</div>
        <div class="lb-avatar">${entry.avatar || '🚀'}</div>
        <div class="lb-info">
          <div class="lb-name">${_escapeHtml(entry.name)}${isMe ? ' (YOU)' : ''}</div>
          <div class="lb-meta">${levelStr}${streakStr} · ${dateStr}</div>
        </div>
        <div class="lb-score-col">
          <div class="lb-score">${_fmt(entry.score)}</div>
          <div class="lb-rank-title badge-${rt.badge.replace('gold','commander').replace('purple','ace').replace('green','pilot').replace('blue','veteran').replace('dim','cadet')}">${rt.title}</div>
        </div>
      </div>
    `;
  }

  function _fmt(n) {
    return n >= 1000 ? (n/1000).toFixed(1) + 'K' : String(n);
  }

  function _formatDate(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now - d;
    const diffH  = diffMs / 3600000;
    if (diffH < 1)    return 'just now';
    if (diffH < 24)   return Math.floor(diffH) + 'h ago';
    if (diffH < 48)   return 'yesterday';
    return `${d.getMonth()+1}/${d.getDate()}`;
  }

  function _escapeHtml(s) {
    return String(s)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;');
  }

  // Animate new entries on the board
  function animateEntries() {
    const entries = document.querySelectorAll('.lb-entry');
    entries.forEach((el, i) => {
      el.style.opacity = '0';
      el.style.transform = 'translateX(-12px)';
      setTimeout(() => {
        el.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        el.style.opacity = '1';
        el.style.transform = 'translateX(0)';
      }, i * 55);
    });
  }

  return { renderBoard, getRankTitle, computeSessionELO, animateEntries };
})();

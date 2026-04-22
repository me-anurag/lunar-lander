/* ═══════════════════════════════════
   profile.js — Pilot Profiles & Avatars
═══════════════════════════════════ */
'use strict';

const Profile = (() => {
  const AVATARS = [
    '🚀','🌙','⭐','🛸','🌟','👨‍🚀','👩‍🚀','🪐',
    '💫','🌠','🔭','🛰️','☄️','🌌','🤖','👾',
    '🦅','🐉','🦁','⚡','🔥','❄️','💎','🏆'
  ];

  let _selectedAvatar = AVATARS[0];
  let _pilotName = '';

  function getAvatars() { return AVATARS; }
  function getSelectedAvatar() { return _selectedAvatar; }
  function setSelectedAvatar(a) { _selectedAvatar = a; }
  function getPilotName() { return _pilotName; }
  function setPilotName(n) { _pilotName = n.trim().toUpperCase().replace(/[^A-Z0-9\-_. ]/g,'').slice(0,16); }

  // Build avatar selection grid
  function buildAvatarGrid() {
    const grid = document.getElementById('avatar-grid');
    if (!grid) return;
    grid.innerHTML = AVATARS.map((a, i) => `
      <div class="avatar-option${i === 0 ? ' selected' : ''}"
           data-avatar="${a}"
           title="${a}">
        ${a}
      </div>
    `).join('');

    grid.addEventListener('click', (e) => {
      const el = e.target.closest('.avatar-option');
      if (!el) return;
      document.querySelectorAll('.avatar-option').forEach(o => o.classList.remove('selected'));
      el.classList.add('selected');
      _selectedAvatar = el.dataset.avatar;
      AudioEngine.SFX.hover();
    });
  }

  // Restore saved pilot into UI
  function restorePilot(pilot) {
    if (!pilot) return;
    _pilotName     = pilot.name    || '';
    _selectedAvatar = pilot.avatar || AVATARS[0];
    const input = document.getElementById('pilot-name-input');
    if (input) input.value = _pilotName;
    // Mark selected avatar
    document.querySelectorAll('.avatar-option').forEach(o => {
      o.classList.toggle('selected', o.dataset.avatar === _selectedAvatar);
    });
  }

  // Update all pilot-card elements on home screen
  function updateHomeCard(pilot, bestScore) {
    const el = {
      avatar:    document.getElementById('home-avatar'),
      name:      document.getElementById('home-pilot-name'),
      rank:      document.getElementById('home-pilot-rank'),
      bestScore: document.getElementById('home-best-score'),
    };
    if (el.avatar)    el.avatar.textContent    = pilot.avatar || '🚀';
    if (el.name)      el.name.textContent      = pilot.name   || 'PILOT';
    if (el.bestScore) el.bestScore.textContent = bestScore > 0 ? _fmt(bestScore) : '—';
    if (el.rank) {
      const rt = Leaderboard.getRankTitle(bestScore);
      el.rank.textContent = rt.title;
    }
  }

  function _fmt(n) {
    return n >= 1000 ? (n/1000).toFixed(1)+'K' : String(n);
  }

  // Validate pilot name
  function validate(name) {
    const n = name.trim();
    if (n.length < 2) return 'Callsign must be at least 2 characters.';
    if (n.length > 16) return 'Callsign max 16 characters.';
    return null;
  }

  return {
    getAvatars, getSelectedAvatar, setSelectedAvatar,
    getPilotName, setPilotName,
    buildAvatarGrid, restorePilot, updateHomeCard, validate,
    AVATARS
  };
})();

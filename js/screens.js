/* ═══════════════════════════════════
   screens.js — v3.0
   FIXED: _loadLeaderboard is now async,
   fetches from Supabase (shows ALL players),
   not just localStorage (which only had current user)
═══════════════════════════════════ */
'use strict';

const ScreenManager = (() => {
  const SCREENS = [
    'screen-splash','screen-home','screen-game',
    'screen-leaderboard','screen-settings','screen-gameover'
  ];
  let _current = null;

  function show(id, opts = {}) {
    SCREENS.forEach(sid => {
      const el = document.getElementById(sid);
      if (!el) return;
      if (sid === id) {
        el.classList.remove('hidden');
        el.classList.add('active');
        if (!opts.noAnim) { el.classList.add('slide-in'); setTimeout(() => el.classList.remove('slide-in'), 500); }
      } else {
        el.classList.remove('active');
        el.classList.add('hidden');
      }
    });
    _current = id;
    _onShow(id);
  }

  function _onShow(id) {
    switch (id) {
      case 'screen-home':        _refreshHome();              break;
      case 'screen-leaderboard': _loadLeaderboard('global');
                                 AudioEngine.SFX.menuOpen();  break;
      case 'screen-settings':    AudioEngine.SFX.menuOpen();  break;
    }
  }

  function _refreshHome() {
    const pilot = Storage.loadPilot();
    if (pilot) Profile.updateHomeCard(pilot, Storage.getBestScore());
    _cyclePhilosophy();
  }

  const PHILO = [
    '"The cosmos is within us. We are made of star-stuff." — Carl Sagan',
    '"Per aspera ad astra." — Through hardships to the stars.',
    '"We choose to go to the moon not because it is easy, but because it is hard." — JFK',
    '"Precision is the poetry of engineering."',
    '"Touch down gently, or not at all."',
    '"Failure is not an option." — Gene Kranz, Apollo 13',
    '"To boldly go where no one has gone before."',
    '"In space, no one can hear you crash."',
  ];
  let _philoIdx = 0, _philoInterval = null;

  function _cyclePhilosophy() {
    const bar = document.getElementById('home-philosophy-bar');
    if (!bar) return;
    bar.textContent = PHILO[_philoIdx];
    if (_philoInterval) clearInterval(_philoInterval);
    _philoInterval = setInterval(() => {
      _philoIdx = (_philoIdx + 1) % PHILO.length;
      bar.style.opacity = '0';
      setTimeout(() => { bar.textContent = PHILO[_philoIdx]; bar.style.opacity = ''; }, 500);
    }, 9000);
  }

  // ─── LEADERBOARD — ASYNC — fetches from Supabase ───
  let _lbTab = 'global';

  async function _loadLeaderboard(tab) {
    _lbTab = tab;
    document.querySelectorAll('.lb-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === tab);
    });
    const pilot = Storage.loadPilot();
    const name  = pilot ? pilot.name : '';

    const container = document.getElementById('lb-list');
    if (container) container.innerHTML = '<div class="lb-loading">Loading pilots...</div>';

    try {
      let entries;
      if (tab === 'today') {
        entries = await Storage.getTodayBoard();
      } else {
        entries = await Storage.getGlobalBoard();  // ← real Supabase data
      }
      Leaderboard.renderBoard(entries, name, tab);
      setTimeout(Leaderboard.animateEntries, 50);
    } catch(e) {
      if (container) container.innerHTML = `<div class="lb-empty">⚠️ Connection error. Try again.</div>`;
    }
  }

  // ─── Wire Buttons ───
  function bindAll() {
    // Splash → Home
    const btnConfirm = document.getElementById('btn-confirm-pilot');
    if (btnConfirm) {
      btnConfirm.addEventListener('click', () => {
        AudioEngine.resume();
        const input = document.getElementById('pilot-name-input');
        const name  = input ? input.value.trim() : '';
        const err   = Profile.validate(name);
        if (err) { _shake(input); _flashError(input, err); return; }
        Profile.setPilotName(name);
        const pilot = { name: name.toUpperCase().slice(0,16), avatar: Profile.getSelectedAvatar(), date: Date.now() };
        Storage.savePilot(pilot);
        AudioEngine.SFX.startup();
        show('screen-home');
      });
    }
    const nameInput = document.getElementById('pilot-name-input');
    if (nameInput) nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') btnConfirm && btnConfirm.click(); });

    // Home → Play
    _btn('btn-play', () => { AudioEngine.resume(); AudioEngine.SFX.click(); show('screen-game'); setTimeout(() => Game.startSession(), 80); });

    // Home → Leaderboard
    _btn('btn-leaderboard', () => { AudioEngine.SFX.click(); show('screen-leaderboard'); });

    // Home → Settings
    _btn('btn-settings', () => { AudioEngine.SFX.click(); show('screen-settings'); });

    // Leaderboard back
    _btn('btn-lb-back', () => { AudioEngine.SFX.menuClose(); show('screen-home'); });

    // LB tabs
    document.querySelectorAll('.lb-tab').forEach(tab => {
      tab.addEventListener('click', () => { AudioEngine.SFX.click(); _loadLeaderboard(tab.dataset.tab); });
    });

    // Settings back
    _btn('btn-settings-back', () => { AudioEngine.SFX.menuClose(); show('screen-home'); });

    // HUD home
    _btn('btn-hud-home', () => {
      AudioEngine.SFX.click();
      if (confirm('Exit mission? Score will be saved.')) Game.endSession();
    });

    // Game modal buttons
    _btn('btn-next',          () => { AudioEngine.SFX.click(); Game.nextLevel(); });
    _btn('btn-restart-modal', () => { AudioEngine.SFX.click(); Game.restartSession(); });
    _btn('btn-modal-home',    () => { AudioEngine.SFX.click(); Game.endSession(); });

    // Game Over buttons
    _btn('btn-go-play', () => { AudioEngine.SFX.click(); show('screen-game'); setTimeout(() => Game.startSession(), 80); });
    _btn('btn-go-lb',   () => { AudioEngine.SFX.click(); show('screen-leaderboard'); });
    _btn('btn-go-home', () => { AudioEngine.SFX.click(); show('screen-home'); });
  }

  function _btn(id, fn) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', fn);
  }
  function _shake(el) {
    if (!el) return;
    el.style.animation = 'none'; el.offsetHeight;
    el.style.animation = 'shake 0.4s ease';
    setTimeout(() => el.style.animation = '', 400);
  }
  function _flashError(el, msg) {
    if (!el) return;
    const orig = el.placeholder; el.placeholder = msg; el.style.borderColor = '#ff4757';
    setTimeout(() => { el.placeholder = orig; el.style.borderColor = ''; }, 2200);
  }

  return { show, bindAll };
})();

// Shake keyframe
const _ss = document.createElement('style');
_ss.textContent = `@keyframes shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-8px)}40%{transform:translateX(8px)}60%{transform:translateX(-5px)}80%{transform:translateX(5px)}}`;
document.head.appendChild(_ss);

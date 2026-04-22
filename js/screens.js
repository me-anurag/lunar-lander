/* ═══════════════════════════════════
   screens.js — Screen Manager
   Handles all screen transitions + button wiring
   Uses Don Norman principles: clear affordances,
   immediate feedback, no dead ends.
═══════════════════════════════════ */
'use strict';

const ScreenManager = (() => {
  const SCREENS = [
    'screen-splash',
    'screen-home',
    'screen-game',
    'screen-leaderboard',
    'screen-settings',
    'screen-gameover'
  ];
  let _current = null;

  function show(id, opts = {}) {
    SCREENS.forEach(sid => {
      const el = document.getElementById(sid);
      if (!el) return;
      if (sid === id) {
        el.classList.remove('hidden');
        el.classList.add('active');
        if (!opts.noAnim) el.classList.add('slide-in');
        setTimeout(() => el.classList.remove('slide-in'), 500);
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
      case 'screen-home':
        _refreshHome();
        break;
      case 'screen-leaderboard':
        _loadLeaderboard('global');
        AudioEngine.SFX.menuOpen();
        break;
      case 'screen-settings':
        AudioEngine.SFX.menuOpen();
        break;
      case 'screen-game':
        // Handled by game.js
        break;
    }
  }

  function _refreshHome() {
    const pilot = Storage.loadPilot();
    if (pilot) {
      const best = Storage.getBestScore();
      Profile.updateHomeCard(pilot, best);
    }
    _cyclePhilosophy();
  }

  // Philosophy bar cycling — Cialdini-style social proof + inspiration
  const PHILO = [
    '"The cosmos is within us. We are made of star-stuff." — Carl Sagan',
    '"Per aspera ad astra." — Through hardships to the stars.',
    '"We choose to go to the moon not because it is easy, but because it is hard." — JFK',
    '"Precision is the poetry of engineering."',
    '"Touch down gently, or not at all."',
    '"The universe is under no obligation to make sense to you." — Neil deGrasse Tyson',
    '"Failure is not an option." — Gene Kranz, Apollo 13',
    '"To boldly go where no one has gone before."',
  ];
  let _philoIdx = 0;
  let _philoInterval = null;

  function _cyclePhilosophy() {
    const bar = document.getElementById('home-philosophy-bar');
    if (!bar) return;
    bar.textContent = PHILO[_philoIdx];
    if (_philoInterval) clearInterval(_philoInterval);
    _philoInterval = setInterval(() => {
      _philoIdx = (_philoIdx + 1) % PHILO.length;
      bar.style.opacity = '0';
      setTimeout(() => {
        bar.textContent = PHILO[_philoIdx];
        bar.style.opacity = '';
      }, 500);
    }, 9000);
  }

  // ─── Leaderboard Tab Logic ───
  let _lbTab = 'global';
  function _loadLeaderboard(tab) {
    _lbTab = tab;
    // Update tab active state
    document.querySelectorAll('.lb-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === tab);
    });
    const pilot = Storage.loadPilot();
    const name  = pilot ? pilot.name : '';
    let entries;
    if (tab === 'global') {
      entries = Storage.getGlobalBoard();
    } else if (tab === 'today') {
      entries = Storage.getTodayBoard();
    } else {
      entries = Storage.getGlobalBoard();
    }
    Leaderboard.renderBoard(entries, name, tab);
    setTimeout(Leaderboard.animateEntries, 50);
  }

  // ─── Wire all buttons ───
  function bindAll() {
    // ── Splash → Home ──
    const btnConfirm = document.getElementById('btn-confirm-pilot');
    if (btnConfirm) {
      btnConfirm.addEventListener('click', () => {
        AudioEngine.resume();
        const input = document.getElementById('pilot-name-input');
        const name  = input ? input.value.trim() : '';
        const err   = Profile.validate(name);
        if (err) { _shake(input); _flashError(input, err); return; }

        Profile.setPilotName(name);
        const pilot = {
          name:   name.toUpperCase().slice(0,16),
          avatar: Profile.getSelectedAvatar(),
          date:   Date.now()
        };
        Storage.savePilot(pilot);
        AudioEngine.SFX.startup();
        show('screen-home');
      });
    }

    // Allow Enter key on name input
    const nameInput = document.getElementById('pilot-name-input');
    if (nameInput) {
      nameInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') btnConfirm && btnConfirm.click();
      });
    }

    // ── Home → Play ──
    const btnPlay = document.getElementById('btn-play');
    if (btnPlay) {
      btnPlay.addEventListener('click', () => {
        AudioEngine.resume();
        AudioEngine.SFX.click();
        show('screen-game');
        setTimeout(() => Game.startSession(), 80);
      });
    }

    // ── Home → Leaderboard ──
    const btnLB = document.getElementById('btn-leaderboard');
    if (btnLB) {
      btnLB.addEventListener('click', () => {
        AudioEngine.SFX.click();
        show('screen-leaderboard');
      });
    }

    // ── Home → Settings ──
    const btnSet = document.getElementById('btn-settings');
    if (btnSet) {
      btnSet.addEventListener('click', () => {
        AudioEngine.SFX.click();
        show('screen-settings');
      });
    }

    // ── Leaderboard back ──
    const btnLbBack = document.getElementById('btn-lb-back');
    if (btnLbBack) {
      btnLbBack.addEventListener('click', () => {
        AudioEngine.SFX.menuClose();
        show('screen-home');
      });
    }

    // ── LB tabs ──
    document.querySelectorAll('.lb-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        AudioEngine.SFX.click();
        _loadLeaderboard(tab.dataset.tab);
      });
    });

    // ── Settings back ──
    const btnSetBack = document.getElementById('btn-settings-back');
    if (btnSetBack) {
      btnSetBack.addEventListener('click', () => {
        AudioEngine.SFX.menuClose();
        show('screen-home');
      });
    }

    // ── In-Game: HUD home button ──
    const btnHudHome = document.getElementById('btn-hud-home');
    if (btnHudHome) {
      btnHudHome.addEventListener('click', () => {
        AudioEngine.SFX.click();
        if (confirm('Exit mission? Your current progress will be scored.')) {
          Game.endSession();
        }
      });
    }

    // ── Game modal buttons ──
    const btnNext = document.getElementById('btn-next');
    if (btnNext) btnNext.addEventListener('click', () => {
      AudioEngine.SFX.click();
      Game.nextLevel();
    });

    const btnRestart = document.getElementById('btn-restart-modal');
    if (btnRestart) btnRestart.addEventListener('click', () => {
      AudioEngine.SFX.click();
      Game.restartSession();
    });

    const btnModalHome = document.getElementById('btn-modal-home');
    if (btnModalHome) btnModalHome.addEventListener('click', () => {
      AudioEngine.SFX.click();
      Game.endSession();
    });

    // ── Game Over buttons ──
    const btnGoPlay = document.getElementById('btn-go-play');
    if (btnGoPlay) btnGoPlay.addEventListener('click', () => {
      AudioEngine.SFX.click();
      show('screen-game');
      setTimeout(() => Game.startSession(), 80);
    });

    const btnGoLB = document.getElementById('btn-go-lb');
    if (btnGoLB) btnGoLB.addEventListener('click', () => {
      AudioEngine.SFX.click();
      show('screen-leaderboard');
    });

    const btnGoHome = document.getElementById('btn-go-home');
    if (btnGoHome) btnGoHome.addEventListener('click', () => {
      AudioEngine.SFX.click();
      show('screen-home');
    });
  }

  // ── Error helpers ──
  function _shake(el) {
    if (!el) return;
    el.style.animation = 'none';
    el.offsetHeight; // reflow
    el.style.animation = 'shake 0.4s ease';
    setTimeout(() => el.style.animation = '', 400);
  }
  function _flashError(el, msg) {
    if (!el) return;
    const orig = el.placeholder;
    el.placeholder = msg;
    el.style.borderColor = '#ff4757';
    setTimeout(() => {
      el.placeholder = orig;
      el.style.borderColor = '';
    }, 2000);
  }

  return { show, bindAll };
})();

// Shake animation injected
const _shakeStyle = document.createElement('style');
_shakeStyle.textContent = `
@keyframes shake {
  0%,100%{transform:translateX(0)}
  20%{transform:translateX(-8px)}
  40%{transform:translateX(8px)}
  60%{transform:translateX(-5px)}
  80%{transform:translateX(5px)}
}`;
document.head.appendChild(_shakeStyle);

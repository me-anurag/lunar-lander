/* ═══════════════════════════════════
   main.js — Application Bootstrap
   Load order: audio → stars → storage → leaderboard
             → profile → settings → physics → renderer
             → hud → game → screens → main
═══════════════════════════════════ */
'use strict';

(function boot() {

  // 1. Init storage + settings first
  Storage.init();
  Settings.load();
  Settings.bindUI();

  // 2. Stars background — start immediately
  StarField.init();

  // 3. Build avatar grid on splash screen
  Profile.buildAvatarGrid();

  // 4. Check for returning pilot
  const existingPilot = Storage.loadPilot();
  if (existingPilot) {
    // Restore saved pilot into splash UI
    Profile.restorePilot(existingPilot);
    // Skip splash — go straight to home
    ScreenManager.show('screen-home', { noAnim: true });
  } else {
    // First visit — show splash
    ScreenManager.show('screen-splash', { noAnim: true });
  }

  // 5. Wire all screen buttons
  ScreenManager.bindAll();

  // 6. Init game engine (binds keyboard + touch)
  Game.init();

  // 7. Set particle quality from settings
  Renderer.setParticleMul(Settings.getParticleMul());

  // 8. Start background ambient music after first user gesture
  //    (browser policy: AudioContext must be resumed from user interaction)
  const _startMusicOnce = () => {
    AudioEngine.startBgMusic();
    document.removeEventListener('click',      _startMusicOnce);
    document.removeEventListener('touchstart', _startMusicOnce);
    document.removeEventListener('keydown',    _startMusicOnce);
  };
  document.addEventListener('click',      _startMusicOnce);
  document.addEventListener('touchstart', _startMusicOnce);
  document.addEventListener('keydown',    _startMusicOnce);

  // 9. Kick off the star animation loop (standalone from game loop)
  function _starLoop() {
    StarField.draw();
    requestAnimationFrame(_starLoop);
  }
  _starLoop();

  // 10. Mobile — prevent pull-to-refresh + context menu
  document.addEventListener('touchmove',   e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
  document.addEventListener('contextmenu', e => e.preventDefault());

  // 11. Visibility API — pause/resume bg music when tab hidden
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      AudioEngine.stopBgMusic();
    } else {
      if (AudioEngine.musicEnabled) {
        AudioEngine.startBgMusic();
      }
    }
  });

  console.log('%c🚀 LUNAR v2.0 — Initialized', 'color:#00d4ff;font-family:monospace;font-size:14px');
  console.log('%cBuilt with physics, psychology, and passion.', 'color:#a855f7;font-family:monospace');
})();

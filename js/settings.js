/* ═══════════════════════════════════
   settings.js — Settings Manager
═══════════════════════════════════ */
'use strict';

const Settings = (() => {
  let _current = null;

  function load() {
    _current = Storage.loadSettings();
    _apply();
  }

  function _apply() {
    if (!_current) return;
    const s = _current;
    // Apply to audio engine
    AudioEngine.setMasterVolume(s.volume);
    AudioEngine.setMusicEnabled(s.music);
    AudioEngine.setSFXEnabled(s.sfx);
    // Apply scanlines
    const sl = document.getElementById('scanlines');
    if (sl) sl.classList.toggle('hidden', !s.scanlines);
    // Sync toggles
    _syncUI();
  }

  function _syncUI() {
    const s = _current;
    _setToggle('toggle-music',     s.music);
    _setToggle('toggle-sfx',       s.sfx);
    _setToggle('toggle-scanlines', s.scanlines);
    _setSlider('slider-volume',    s.volume);
    _setSelect('select-particles', s.particles);
  }

  function _setToggle(id, val) {
    const el = document.getElementById(id);
    if (el) el.checked = val;
  }
  function _setSlider(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val;
  }
  function _setSelect(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val;
  }

  function bindUI() {
    const tm = document.getElementById('toggle-music');
    const ts = document.getElementById('toggle-sfx');
    const tl = document.getElementById('toggle-scanlines');
    const sv = document.getElementById('slider-volume');
    const sp = document.getElementById('select-particles');

    if (tm) tm.addEventListener('change', e => {
      _current.music = e.target.checked;
      AudioEngine.setMusicEnabled(_current.music);
      _save();
    });
    if (ts) ts.addEventListener('change', e => {
      _current.sfx = e.target.checked;
      AudioEngine.setSFXEnabled(_current.sfx);
      _save();
    });
    if (tl) tl.addEventListener('change', e => {
      _current.scanlines = e.target.checked;
      const sl = document.getElementById('scanlines');
      if (sl) sl.classList.toggle('hidden', !_current.scanlines);
      _save();
    });
    if (sv) sv.addEventListener('input', e => {
      _current.volume = parseInt(e.target.value, 10);
      AudioEngine.setMasterVolume(_current.volume);
      _save();
    });
    if (sp) sp.addEventListener('change', e => {
      _current.particles = e.target.value;
      _save();
    });

    // Change name
    const btnName = document.getElementById('btn-change-name');
    if (btnName) btnName.addEventListener('click', () => {
      ScreenManager.show('screen-splash');
      AudioEngine.SFX.menuOpen();
    });

    // Reset
    const btnReset = document.getElementById('btn-reset');
    if (btnReset) btnReset.addEventListener('click', () => {
      if (confirm('Reset ALL progress? This cannot be undone.')) {
        localStorage.clear();
        location.reload();
      }
    });
  }

  function _save() {
    Storage.saveSettings(_current);
  }

  function getParticleMultiplier() {
    const p = _current ? _current.particles : 'medium';
    return p === 'low' ? 0.4 : p === 'high' ? 1.8 : 1.0;
  }

  return { load, bindUI, getParticleMultiplier };
})();

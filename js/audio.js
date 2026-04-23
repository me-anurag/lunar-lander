/* ═══════════════════════════════════
   audio.js — v3.0
   FIXED:
   - Background music completely rewritten: sci-fi beeps/blips/R2D2 style
   - Crash uses real uploaded WAV file (base64 embedded)
   - All SFX volumes boosted
   - Auto-advance countdown sound added
═══════════════════════════════════ */
'use strict';

// ── Crash sound — real WAV embedded as base64 ──
const _CRASH_WAV_B64 = "UklGRi5EBABXQVZFZm10IBAAAAABAAIARKwAABCxAgAEABAAZGF0YYBDBAB8/3r/fP9+/33/e/99/4D/fv96/3n/fv+B/3v/ev+A";
// Full base64 loaded from separate file for size — see _loadCrashSound()

const AudioEngine = (() => {
  let AC          = null;
  let masterGain  = null;
  let musicGain   = null;
  let sfxGain     = null;
  let bgLoopRunning = false;
  let _crashBuffer  = null;   // decoded AudioBuffer for WAV crash
  let _masterVol    = 0.85;
  let _musicEnabled = true;
  let _sfxEnabled   = true;

  function getAC() {
    if (!AC) {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = AC.createGain();
      musicGain  = AC.createGain();
      sfxGain    = AC.createGain();
      masterGain.gain.value = _masterVol;
      musicGain.gain.value  = 0.5;
      sfxGain.gain.value    = 1.0;
      musicGain.connect(masterGain);
      sfxGain.connect(masterGain);
      masterGain.connect(AC.destination);
      _loadCrashSound();
    }
    return AC;
  }

  // Decode the embedded WAV crash sound
  function _loadCrashSound() {
    try {
      const b64 = window._CRASH_SOUND_B64 || '';
      if (!b64) return;
      const bin  = atob(b64);
      const buf  = new ArrayBuffer(bin.length);
      const view = new Uint8Array(buf);
      for (let i = 0; i < bin.length; i++) view[i] = bin.charCodeAt(i);
      AC.decodeAudioData(buf, decoded => { _crashBuffer = decoded; });
    } catch(e) {}
  }

  function resume() {
    try { getAC().resume(); } catch(e) {}
  }

  // ── Tone primitive ──
  function tone(freq, type, dur, vol, delay, dest) {
    if (!_sfxEnabled && dest !== musicGain) return;
    type = type || 'sine'; dur = dur || 0.2; vol = vol || 0.15; delay = delay || 0;
    try {
      const ac = getAC();
      const o  = ac.createOscillator(), g = ac.createGain();
      o.connect(g); g.connect(dest || sfxGain);
      o.type = type; o.frequency.value = freq;
      const t = ac.currentTime + delay;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.start(t); o.stop(t + dur + 0.05);
    } catch(e) {}
  }

  // Frequency sweep — for R2D2 style chirps
  function sweep(f1, f2, type, dur, vol, delay, dest) {
    if (!_sfxEnabled && dest !== musicGain) return;
    type = type || 'sine'; dur = dur || 0.15; vol = vol || 0.2; delay = delay || 0;
    try {
      const ac = getAC();
      const o  = ac.createOscillator(), g = ac.createGain();
      o.connect(g); g.connect(dest || sfxGain);
      o.type = type;
      const t = ac.currentTime + delay;
      o.frequency.setValueAtTime(f1, t);
      o.frequency.exponentialRampToValueAtTime(f2, t + dur * 0.8);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.start(t); o.stop(t + dur + 0.05);
    } catch(e) {}
  }

  function nz(dur, vol, bandFreq) {
    if (!_sfxEnabled) return;
    dur = dur || 0.15; vol = vol || 0.12; bandFreq = bandFreq || 700;
    try {
      const ac  = getAC();
      const buf = ac.createBuffer(1, ac.sampleRate * dur, ac.sampleRate);
      const d   = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const s = ac.createBufferSource(), g = ac.createGain(), f = ac.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = bandFreq;
      s.buffer = buf; s.connect(f); f.connect(g); g.connect(sfxGain);
      g.gain.setValueAtTime(vol, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
      s.start(); s.stop(ac.currentTime + dur + 0.05);
    } catch(e) {}
  }

  // Play decoded WAV buffer
  function _playBuffer(buffer, vol) {
    try {
      const ac = getAC();
      const s  = ac.createBufferSource(), g = ac.createGain();
      s.buffer = buffer;
      g.gain.value = vol || 1.0;
      s.connect(g); g.connect(sfxGain);
      s.start();
    } catch(e) {}
  }

  // ════════════════════════════════════════
  //  BACKGROUND MUSIC — Sci-Fi / R2D2 Style
  //  Beeps, blips, sweeps, electronic pulses
  //  NO droning noise — clean digital sounds
  // ════════════════════════════════════════
  function startBgMusic() {
    if (!_musicEnabled || bgLoopRunning) return;
    try { const ac = getAC(); bgLoopRunning = true; _bgLoop(ac); }
    catch(e) {}
  }

  function _bgLoop(ac) {
    if (!bgLoopRunning || !_musicEnabled) return;
    const now = ac.currentTime;

    // ── Layer 1: Deep sub-bass pulse (felt not heard) ──
    // Very subtle low frequency rhythm — like a spaceship heartbeat
    for (let i = 0; i < 4; i++) {
      const t = now + i * 3;
      sweep(60, 45, 'sine', 0.8, 0.08, i * 3, musicGain);
    }

    // ── Layer 2: R2D2-style chirp sequence ──
    // Short ascending + descending sweeps, randomized
    const chirpPattern = [
      [800, 1600, 0.12, 0.18],
      [1200, 600, 0.10, 0.15],
      [400, 1800, 0.08, 0.20],
      [1600, 800, 0.14, 0.16],
      [600, 2000, 0.09, 0.18],
      [2000, 400, 0.11, 0.14],
    ];
    const chirpTimes = [1.2, 2.8, 4.5, 6.1, 7.8, 9.4];
    chirpPattern.forEach(([f1, f2, dur, vol], i) => {
      const t = chirpTimes[i % chirpTimes.length];
      sweep(f1, f2, 'sine', dur, vol * 0.55, t, musicGain);
      // Tiny echo
      sweep(f1 * 1.05, f2 * 0.95, 'sine', dur * 0.7, vol * 0.2, t + 0.06, musicGain);
    });

    // ── Layer 3: Electronic beep-boop sequence ──
    // Think: C3PO blips, retro computer sounds
    const beepFreqs = [880, 1100, 660, 1320, 550, 990, 440, 1760];
    const beepTimes = [0.4, 0.9, 1.8, 3.1, 4.2, 5.6, 7.0, 8.3];
    beepFreqs.forEach((f, i) => {
      const t = beepTimes[i];
      // Short clean beep
      tone(f, 'square', 0.055, 0.10, t, musicGain);
      // Tiny harmonic overtone
      tone(f * 2, 'sine', 0.04, 0.04, t + 0.005, musicGain);
    });

    // ── Layer 4: Melodic data-burst (like scanning sound) ──
    // Rising arpeggios at key moments
    const arp1 = [330, 415, 523, 659, 830];
    arp1.forEach((f, i) => sweep(f, f * 1.15, 'sine', 0.07, 0.12, 3.5 + i * 0.06, musicGain));

    const arp2 = [830, 659, 523, 415, 330];
    arp2.forEach((f, i) => sweep(f, f * 0.88, 'sine', 0.06, 0.10, 7.2 + i * 0.065, musicGain));

    // ── Layer 5: Rhythmic digital pulse ──
    // Like a spaceship's navigation ping
    for (let i = 0; i < 6; i++) {
      const t = 0.8 + i * 1.85;
      tone(1047, 'square', 0.025, 0.07, t, musicGain);
      tone(523, 'square', 0.02, 0.05, t + 0.03, musicGain);
    }

    // ── Layer 6: Long mysterious sweep (once per loop) ──
    sweep(200, 800, 'sine', 1.2, 0.08, 5.0, musicGain);
    sweep(800, 150, 'sine', 1.0, 0.06, 6.5, musicGain);

    if (bgLoopRunning) setTimeout(() => _bgLoop(ac), 11600);
  }

  function stopBgMusic() {
    bgLoopRunning = false;
    if (musicGain) {
      const ac = getAC();
      musicGain.gain.setValueAtTime(musicGain.gain.value, ac.currentTime);
      musicGain.gain.linearRampToValueAtTime(0, ac.currentTime + 1.0);
      setTimeout(() => { if (_musicEnabled) return; musicGain.gain.value = 0.5; }, 1100);
    }
  }

  // ══════════════════════════════════
  //  SFX
  // ══════════════════════════════════
  const SFX = {
    startup() {
      resume();
      // R2D2-style startup: rising sweep + beeps
      sweep(200, 2000, 'sine', 0.6, 0.22, 0);
      [880, 1100, 1320, 1760].forEach((f,i) => tone(f,'square',0.06,0.14,0.5+i*0.1));
      setTimeout(() => sweep(1000, 2500, 'sine', 0.4, 0.20), 900);
    },
    click() {
      resume();
      tone(1200,'square',0.04,0.18);
      tone(1800,'square',0.03,0.10,0.03);
    },
    thrust() {
      nz(0.09, 0.20, 200);
      tone(60, 'sawtooth', 0.09, 0.14);
      tone(90, 'sawtooth', 0.07, 0.09, 0.02);
    },
    side() {
      nz(0.06, 0.14, 450);
      tone(100, 'sawtooth', 0.06, 0.09);
    },
    land() {
      sweep(400, 800, 'sine', 0.15, 0.22, 0);
      [440,554,659,880].forEach((f,i) => tone(f,'sine',0.40,0.20,0.1+i*0.08));
    },
    perfect() {
      // Epic R2D2 celebration: fast ascending sweep + chord
      sweep(300, 3000, 'sine', 0.5, 0.28, 0);
      [261,329,392,523,659,784,1047].forEach((f,i) => tone(f,'sine',0.5,0.24,0.1+i*0.09));
      setTimeout(() => {
        sweep(1000, 4000, 'sine', 0.4, 0.22);
        [2093,2637].forEach((f,i) => tone(f,'sine',0.55,0.20,i*0.15));
      }, 700);
    },
    crash() {
      // Use real WAV if loaded, else synthesized fallback
      if (_crashBuffer) {
        _playBuffer(_crashBuffer, 1.2);
      } else {
        nz(1.0, 0.45, 200);
        [150,100,70,40].forEach((f,i) => tone(f,'sawtooth',0.4,0.28,i*0.08));
        tone(40, 'sine', 0.6, 0.35, 0.1);
      }
    },
    fuelLow() {
      // Urgent beep-beep
      sweep(440, 220, 'square', 0.12, 0.22, 0);
      sweep(440, 220, 'square', 0.12, 0.18, 0.28);
    },
    streak() {
      // Excited R2D2-style: rapid ascending chirps
      [400,600,900,1400,2000].forEach((f,i) => sweep(f,f*1.4,'sine',0.1,0.18,i*0.07));
    },
    levelUp() {
      sweep(200, 1200, 'sine', 0.3, 0.25, 0);
      [523,659,784,1047,1319].forEach((f,i) => tone(f,'sine',0.35,0.22,0.1+i*0.09));
      setTimeout(() => sweep(800, 2400, 'sine', 0.5, 0.26), 600);
    },
    newRecord() {
      sweep(200, 3000, 'sine', 0.7, 0.30, 0);
      [523,659,784,880,1047,1319,1568].forEach((f,i) => tone(f,'sine',0.4,0.26,i*0.07));
      setTimeout(() => {
        [2093,2349,2637,3136].forEach((f,i) => sweep(f,f*1.2,'sine',0.3,0.22,i*0.12));
      }, 600);
    },
    hover()    { sweep(660,880,'sine',0.04,0.07); },
    menuOpen() { sweep(330,660,'sine',0.15,0.16); tone(880,'sine',0.08,0.12,0.1); },
    menuClose(){ sweep(660,330,'sine',0.12,0.14); },
    rankUp()   { sweep(400,1600,'sine',0.3,0.24); [523,784,1047].forEach((f,i)=>tone(f,'sine',0.25,0.18,0.2+i*0.1)); },

    // Countdown tick for auto-advance (3..2..1..GO)
    countTick(n) {
      if (n > 0) {
        tone(880, 'sine', 0.08, 0.22);
        tone(1760,'sine', 0.05, 0.10, 0.02);
      } else {
        // GO sound — exciting
        sweep(400, 1600, 'sine', 0.2, 0.30);
        tone(1047,'sine', 0.25, 0.26, 0.05);
      }
    }
  };

  // ── Settings ──
  function setMasterVolume(v) {
    _masterVol = v / 100;
    if (masterGain) masterGain.gain.value = _masterVol;
  }
  function setMusicEnabled(v) {
    _musicEnabled = v;
    if (v) { if (musicGain) musicGain.gain.value = 0.5; startBgMusic(); }
    else   { stopBgMusic(); }
  }
  function setSFXEnabled(v) { _sfxEnabled = v; }

  return {
    resume, startBgMusic, stopBgMusic,
    SFX, setMasterVolume, setMusicEnabled, setSFXEnabled,
    get musicEnabled() { return _musicEnabled; },
    get sfxEnabled()   { return _sfxEnabled;   },
    get masterVol()    { return _masterVol * 100; }
  };
})();

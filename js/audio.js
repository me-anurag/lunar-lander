/* ═══════════════════════════════════
   audio.js — Audio Engine v2.1
   FIXED: All volumes boosted significantly
   Web Audio API — zero external files
═══════════════════════════════════ */
'use strict';

const AudioEngine = (() => {
  let AC = null;
  let masterGain = null;
  let musicGain  = null;
  let sfxGain    = null;
  let bgLoopRunning = false;
  let _masterVol = 0.85;   // boosted from 0.7
  let _musicEnabled = true;
  let _sfxEnabled   = true;

  function getAC() {
    if (!AC) {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = AC.createGain();
      musicGain  = AC.createGain();
      sfxGain    = AC.createGain();
      masterGain.gain.value = _masterVol;
      musicGain.gain.value  = 0.55;  // boosted from 0.45
      sfxGain.gain.value    = 1.0;   // boosted from 0.8 — SFX at full chain volume
      musicGain.connect(masterGain);
      sfxGain.connect(masterGain);
      masterGain.connect(AC.destination);
    }
    return AC;
  }

  function resume() {
    try { getAC().resume(); } catch(e) {}
  }

  // ── Low-level tone ──
  function tone(freq, type, dur, vol, delay, dest) {
    if (!_sfxEnabled && dest !== musicGain) return;
    type  = type  || 'sine';
    dur   = dur   || 0.2;
    vol   = vol   || 0.15;   // default vol boosted
    delay = delay || 0;
    try {
      const ac = getAC();
      const o  = ac.createOscillator();
      const g  = ac.createGain();
      o.connect(g);
      g.connect(dest || sfxGain);
      o.type = type;
      o.frequency.value = freq;
      const t = ac.currentTime + delay;
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
      const s = ac.createBufferSource();
      const g = ac.createGain();
      const f = ac.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = bandFreq;
      s.buffer = buf; s.connect(f); f.connect(g); g.connect(sfxGain);
      g.gain.setValueAtTime(vol, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
      s.start(); s.stop(ac.currentTime + dur + 0.05);
    } catch(e) {}
  }

  // ── Background Music — generative ambient loop ──
  function startBgMusic() {
    if (!_musicEnabled || bgLoopRunning) return;
    try {
      const ac = getAC();
      bgLoopRunning = true;
      _scheduleBgLayer(ac);
    } catch(e) {}
  }

  function _scheduleBgLayer(ac) {
    if (!bgLoopRunning || !_musicEnabled) return;
    const now = ac.currentTime;

    // Deep drone — spacey ambient pads
    const droneFreqs = [55, 82.5, 110, 165, 220];
    droneFreqs.forEach((f, i) => {
      const osc  = ac.createOscillator();
      const g    = ac.createGain();
      const lfo  = ac.createOscillator();
      const lfog = ac.createGain();
      lfo.frequency.value = 0.06 + i * 0.025;
      lfog.gain.value     = f * 0.005;
      lfo.connect(lfog);
      lfog.connect(osc.frequency);
      osc.type            = i % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.value = f;
      osc.connect(g);
      g.connect(musicGain);
      const vol = 0.10 - i * 0.012;   // boosted from 0.06
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(vol, now + 3);
      g.gain.setValueAtTime(vol, now + 9);
      g.gain.linearRampToValueAtTime(0, now + 12);
      lfo.start(now); lfo.stop(now + 12.1);
      osc.start(now); osc.stop(now + 12.1);
    });

    // Ping 1 at 4s
    const ping = ac.createOscillator();
    const pg   = ac.createGain();
    ping.type = 'sine'; ping.frequency.value = 440;
    ping.connect(pg); pg.connect(musicGain);
    const pt = now + 4;
    pg.gain.setValueAtTime(0, pt);
    pg.gain.linearRampToValueAtTime(0.04, pt + 0.02);   // boosted from 0.025
    pg.gain.exponentialRampToValueAtTime(0.0001, pt + 1.8);
    ping.start(pt); ping.stop(pt + 2);

    // Ping 2 at 8s
    const ping2 = ac.createOscillator();
    const pg2   = ac.createGain();
    ping2.type = 'sine'; ping2.frequency.value = 660;
    ping2.connect(pg2); pg2.connect(musicGain);
    const pt2 = now + 8;
    pg2.gain.setValueAtTime(0, pt2);
    pg2.gain.linearRampToValueAtTime(0.032, pt2 + 0.02); // boosted from 0.018
    pg2.gain.exponentialRampToValueAtTime(0.0001, pt2 + 1.4);
    ping2.start(pt2); ping2.stop(pt2 + 1.5);

    if (bgLoopRunning) setTimeout(() => _scheduleBgLayer(ac), 11800);
  }

  function stopBgMusic() {
    bgLoopRunning = false;
    if (musicGain) {
      const ac = getAC();
      musicGain.gain.setValueAtTime(musicGain.gain.value, ac.currentTime);
      musicGain.gain.linearRampToValueAtTime(0, ac.currentTime + 1.5);
      setTimeout(() => {
        if (_musicEnabled) return;
        musicGain.gain.value = 0.55;
      }, 1600);
    }
  }

  // ── SFX — all volumes significantly boosted ──
  const SFX = {
    startup() {
      resume();
      [220,330,440,660,880].forEach((f,i) => tone(f,'sine',.32,.18,i*.11));
      setTimeout(() => tone(1320,'sine',.55,.18,0), 650);
    },
    click() {
      resume();
      tone(880,'square',.06,.14);
      tone(1200,'square',.05,.11,.04);
    },
    // Thrust — punchy noise burst + low rumble
    thrust() {
      nz(.09,.18,200);          // louder, lower band
      tone(55,'sawtooth',.09,.12);
      tone(80,'sawtooth',.07,.08,.02);
    },
    side() {
      nz(.06,.12,400);
      tone(90,'sawtooth',.06,.08);
    },
    land() {
      [440,554,659,880].forEach((f,i) => tone(f,'sine',.42,.22,i*.1));
    },
    perfect() {
      [261,329,392,523,659,784,1047].forEach((f,i) => tone(f,'sine',.5,.26,i*.1));
      setTimeout(() => {
        [2093,2637].forEach((f,i) => tone(f,'sine',.6,.22,i*.2));
      }, 800);
    },
    crash() {
      nz(.9,.38,250);           // very loud crash
      [200,150,100,60].forEach((f,i) => tone(f,'sawtooth',.32,.22,i*.1));
      // Extra low boom
      tone(40,'sine',.5,.3,.05);
    },
    fuelLow() {
      tone(220,'square',.18,.18);
      tone(180,'square',.18,.14,.25);
    },
    streak() {
      [660,880,1100,1320].forEach((f,i) => tone(f,'sine',.24,.18,i*.07));
    },
    levelUp() {
      [523,659,784,1047,1319].forEach((f,i) => tone(f,'sine',.34,.20,i*.1));
      setTimeout(() => tone(2093,'sine',.65,.24), 580);
    },
    newRecord() {
      [523,659,784,880,1047,1319,1568].forEach((f,i) => tone(f,'sine',.38,.24,i*.08));
      setTimeout(() => {
        [2093,2349,2637].forEach((f,i) => tone(f,'sine',.55,.22,i*.15));
      }, 700);
    },
    hover() {
      tone(660,'sine',.06,.06);
    },
    menuOpen() {
      [440,660].forEach((f,i) => tone(f,'sine',.18,.14,i*.08));
    },
    menuClose() {
      [660,440].forEach((f,i) => tone(f,'sine',.14,.12,i*.07));
    },
    rankUp() {
      [523,784,1047,1568].forEach((f,i) => tone(f,'sine',.3,.22,i*.1));
    }
  };

  // ── Settings ──
  function setMasterVolume(v) {
    _masterVol = v / 100;
    if (masterGain) masterGain.gain.value = _masterVol;
  }
  function setMusicEnabled(v) {
    _musicEnabled = v;
    if (v) {
      if (musicGain) musicGain.gain.value = 0.55;
      startBgMusic();
    } else {
      stopBgMusic();
    }
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

/* ═══════════════════════════════════
   storage.js — Persistent State
   Uses localStorage for pilot data & settings.
   Simulates a shared global leaderboard using localStorage
   (in production, replace _syncGlobalBoard with a real API call).
═══════════════════════════════════ */
'use strict';

const Storage = (() => {
  const KEYS = {
    pilot:       'lunar_pilot',
    scores:      'lunar_scores',
    settings:    'lunar_settings',
    globalBoard: 'lunar_global_board',
    version:     'lunar_version',
  };
  const VERSION = '2.0';

  // ── Migrate / Init ──
  function init() {
    const v = localStorage.getItem(KEYS.version);
    if (v !== VERSION) {
      // Fresh install or version change — seed demo leaderboard
      _seedDemoBoard();
      localStorage.setItem(KEYS.version, VERSION);
    }
  }

  function _seedDemoBoard() {
    const existing = _getGlobalBoard();
    if (existing.length > 0) return; // don't overwrite if scores exist
    const demo = [
      { name:'APOLLO-1',    avatar:'🚀', score:48200, level:8, streak:7, date: Date.now()-86400000*3 },
      { name:'STARGAZER',   avatar:'🌟', score:41500, level:7, streak:5, date: Date.now()-86400000*2 },
      { name:'MOONDUST',    avatar:'🌙', score:37900, level:7, streak:4, date: Date.now()-86400000*2 },
      { name:'COSMOPILOT',  avatar:'🛸', score:33200, level:6, streak:3, date: Date.now()-86400000   },
      { name:'ORBITRON9',   avatar:'🪐', score:28700, level:6, streak:2, date: Date.now()-3600000*5  },
      { name:'NEBULAX',     avatar:'💫', score:24100, level:5, streak:3, date: Date.now()-3600000*4  },
      { name:'ZEROGEE',     avatar:'⭐', score:19800, level:5, streak:1, date: Date.now()-3600000*3  },
      { name:'VOIDWALKER',  avatar:'🌠', score:16500, level:4, streak:2, date: Date.now()-3600000*2  },
      { name:'CRATER-7',    avatar:'🔭', score:12300, level:4, streak:1, date: Date.now()-3600000    },
      { name:'LUNARNOOB',   avatar:'👨‍🚀', score: 8800, level:3, streak:1, date: Date.now()-1800000  },
    ];
    localStorage.setItem(KEYS.globalBoard, JSON.stringify(demo));
  }

  // ── Pilot ──
  function savePilot(pilot) {
    localStorage.setItem(KEYS.pilot, JSON.stringify(pilot));
  }
  function loadPilot() {
    try { return JSON.parse(localStorage.getItem(KEYS.pilot)); } catch(e) { return null; }
  }

  // ── Session Scores ──
  function saveScore(entry) {
    const scores = loadScores();
    scores.push(entry);
    // Keep last 100 sessions
    if (scores.length > 100) scores.splice(0, scores.length - 100);
    localStorage.setItem(KEYS.scores, JSON.stringify(scores));
  }
  function loadScores() {
    try { return JSON.parse(localStorage.getItem(KEYS.scores)) || []; } catch(e) { return []; }
  }
  function getBestScore() {
    const scores = loadScores();
    if (scores.length === 0) return 0;
    return Math.max(...scores.map(s => s.score || 0));
  }
  function getTotalLandings() {
    return loadScores().reduce((acc, s) => acc + (s.landings || 0), 0);
  }
  function getMaxStreak() {
    return Math.max(0, ...loadScores().map(s => s.maxStreak || 0));
  }
  function getHighestLevel() {
    return Math.max(1, ...loadScores().map(s => s.level || 1));
  }

  // ── Global Leaderboard (localStorage-simulated) ──
  function _getGlobalBoard() {
    try { return JSON.parse(localStorage.getItem(KEYS.globalBoard)) || []; } catch(e) { return []; }
  }
  function submitScore(pilotName, avatar, score, level, streak) {
    const board = _getGlobalBoard();
    // Find existing entry for this pilot
    const existingIdx = board.findIndex(e => e.name === pilotName);
    if (existingIdx >= 0) {
      if (score > board[existingIdx].score) {
        board[existingIdx] = { name: pilotName, avatar, score, level, streak, date: Date.now() };
      }
    } else {
      board.push({ name: pilotName, avatar, score, level, streak, date: Date.now() });
    }
    // Sort desc by score
    board.sort((a, b) => b.score - a.score);
    // Keep top 100
    if (board.length > 100) board.splice(100);
    localStorage.setItem(KEYS.globalBoard, JSON.stringify(board));
    return getRankForScore(score);
  }
  function getGlobalBoard() {
    return _getGlobalBoard();
  }
  function getTodayBoard() {
    const midnight = new Date(); midnight.setHours(0,0,0,0);
    return _getGlobalBoard().filter(e => e.date >= midnight.getTime());
  }
  function getRankForScore(score) {
    const board = _getGlobalBoard();
    const rank = board.findIndex(e => e.score <= score) + 1;
    return rank === 0 ? board.length + 1 : rank;
  }
  function getPercentile(score) {
    const board = _getGlobalBoard();
    if (board.length === 0) return 100;
    const below = board.filter(e => e.score < score).length;
    return Math.round((below / board.length) * 100);
  }

  // ── Settings ──
  function saveSettings(s) {
    localStorage.setItem(KEYS.settings, JSON.stringify(s));
  }
  function loadSettings() {
    try {
      return JSON.parse(localStorage.getItem(KEYS.settings)) || _defaultSettings();
    } catch(e) {
      return _defaultSettings();
    }
  }
  function _defaultSettings() {
    return {
      music: true, sfx: true, volume: 70,
      scanlines: true, particles: 'medium'
    };
  }

  return {
    init, savePilot, loadPilot,
    saveScore, loadScores, getBestScore,
    getTotalLandings, getMaxStreak, getHighestLevel,
    submitScore, getGlobalBoard, getTodayBoard,
    getRankForScore, getPercentile,
    saveSettings, loadSettings
  };
})();

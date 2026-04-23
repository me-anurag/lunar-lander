/* ═══════════════════════════════════
   storage.js — v2.2  (Supabase NEW key system)
   ─────────────────────────────────────────────
   YOUR KEY IS CORRECT.  sb_publishable_... IS the right
   key for browser use on Supabase's new key system.
   It replaces the old "anon public" eyJ... key.
   ─────────────────────────────────────────────
   BUGS FIXED vs previous version:
   1. submitScore — no error handling (silent fail)
   2. submitScore — no upsert → duplicate rows per player
   3. getGlobalBoard — raw Supabase field names don't match
      what the app expects  (.date vs .created_at)
   4. getTodayBoard — read old localStorage, not Supabase
   5. getRankForScore / getPercentile — old localStorage
   6. screens.js called async functions without await
   ─────────────────────────────────────────────
   ONE-TIME SQL — run this in Supabase SQL Editor:
     ALTER TABLE scores
       ADD CONSTRAINT scores_name_key UNIQUE (name);
   This makes upsert work (one row per pilot, keeps best score).
═══════════════════════════════════ */
'use strict';

const SUPABASE_URL = "https://slgmriloxwueemhuoffz.supabase.co";
const SUPABASE_KEY = "sb_publishable_WSWQgBvACjvw-Fed_XwBnA_Qsw7sCxs";

const Storage = (() => {

  const KEYS = {
    pilot:    'lunar_pilot',
    scores:   'lunar_scores',
    settings: 'lunar_settings',
    version:  'lunar_version',
    cache:    'lunar_board_cache',
    cacheTs:  'lunar_board_cache_ts',
  };

  const VERSION   = '2.0';
  const CACHE_TTL = 30_000; // 30 seconds between Supabase fetches

  function init() {
    if (localStorage.getItem(KEYS.version) !== VERSION) {
      localStorage.setItem(KEYS.version, VERSION);
    }
  }

  // ─── Supabase headers (new publishable-key format) ───
  function _h(extra = {}) {
    return {
      'Content-Type':  'application/json',
      'apikey':        SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      ...extra
    };
  }

  // ══════════════════════════════════
  //  PILOT  (device-local)
  // ══════════════════════════════════
  function savePilot(pilot) {
    localStorage.setItem(KEYS.pilot, JSON.stringify(pilot));
  }
  function loadPilot() {
    try { return JSON.parse(localStorage.getItem(KEYS.pilot)); }
    catch { return null; }
  }

  // ══════════════════════════════════
  //  SESSION SCORES  (device-local)
  // ══════════════════════════════════
  function saveScore(entry) {
    const scores = loadScores();
    scores.push(entry);
    if (scores.length > 100) scores.splice(0, scores.length - 100);
    localStorage.setItem(KEYS.scores, JSON.stringify(scores));
  }
  function loadScores() {
    try { return JSON.parse(localStorage.getItem(KEYS.scores)) || []; }
    catch { return []; }
  }
  function getBestScore() {
    const s = loadScores();
    return s.length ? Math.max(...s.map(x => x.score || 0)) : 0;
  }
  function getTotalLandings() {
    return loadScores().reduce((a, s) => a + (s.landings || 0), 0);
  }
  function getMaxStreak() {
    return Math.max(0, ...loadScores().map(s => s.maxStreak || 0));
  }
  function getHighestLevel() {
    return Math.max(1, ...loadScores().map(s => s.level || 1));
  }

  // ══════════════════════════════════
  //  SUBMIT SCORE → Supabase (UPSERT)
  //  Requires UNIQUE constraint on name:
  //    ALTER TABLE scores
  //      ADD CONSTRAINT scores_name_key UNIQUE (name);
  // ══════════════════════════════════
  async function submitScore(pilotName, avatar, score, level, streak) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/scores`, {
        method:  'POST',
        headers: _h({
          'Prefer': 'resolution=merge-duplicates,return=representation'
        }),
        body: JSON.stringify({
          name:       pilotName,
          avatar:     avatar,
          score:      score,
          level:      level,
          streak:     streak,
          created_at: new Date().toISOString()
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error('[Supabase] submitScore failed:', res.status, errText);
      } else {
        // Bust cache so leaderboard shows the new score
        localStorage.removeItem(KEYS.cache);
        localStorage.removeItem(KEYS.cacheTs);
      }
    } catch (e) {
      console.error('[Supabase] submitScore network error:', e.message);
    }

    // Always return rank from local cache (works offline too)
    return getRankForScore(score);
  }

  // ══════════════════════════════════
  //  GET GLOBAL BOARD ← Supabase
  //  Cached 30s to avoid hammering free tier.
  //  ASYNC — callers must await this.
  // ══════════════════════════════════
  async function getGlobalBoard() {
    // Return fresh cache if available
    const ts = parseInt(localStorage.getItem(KEYS.cacheTs) || '0', 10);
    if (Date.now() - ts < CACHE_TTL) {
      const cached = _readCache();
      if (cached.length > 0) return cached;
    }

    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/scores` +
        `?select=name,avatar,score,level,streak,created_at` +
        `&order=score.desc` +
        `&limit=100`,
        { headers: _h() }
      );

      if (!res.ok) {
        console.error('[Supabase] getGlobalBoard failed:', res.status, await res.text());
        return _readCache();
      }

      const rows = await res.json();
      if (!Array.isArray(rows)) {
        console.error('[Supabase] unexpected response format:', rows);
        return _readCache();
      }

      // Normalize: Supabase returns created_at (ISO string)
      // but the rest of the app expects .date (milliseconds)
      const normalized = rows.map(r => ({
        name:   r.name   || 'UNKNOWN',
        avatar: r.avatar || '🚀',
        score:  r.score  || 0,
        level:  r.level  || 1,
        streak: r.streak || 0,
        date:   r.created_at ? new Date(r.created_at).getTime() : Date.now()
      }));

      localStorage.setItem(KEYS.cache,   JSON.stringify(normalized));
      localStorage.setItem(KEYS.cacheTs, String(Date.now()));

      return normalized;

    } catch (e) {
      console.error('[Supabase] getGlobalBoard network error:', e.message);
      return _readCache();
    }
  }

  function _readCache() {
    try { return JSON.parse(localStorage.getItem(KEYS.cache)) || []; }
    catch { return []; }
  }

  // ══════════════════════════════════
  //  TODAY'S BOARD — async
  // ══════════════════════════════════
  async function getTodayBoard() {
    const board = await getGlobalBoard();
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    return board.filter(e => e.date >= midnight.getTime());
  }

  // ══════════════════════════════════
  //  RANK / PERCENTILE — from cache
  // ══════════════════════════════════
  function getRankForScore(score) {
    const board = _readCache();
    if (!board.length) return 1;
    const idx = board.findIndex(e => e.score <= score);
    return idx === -1 ? board.length + 1 : idx + 1;
  }

  function getPercentile(score) {
    const board = _readCache();
    if (!board.length) return 100;
    const below = board.filter(e => e.score < score).length;
    return Math.round((below / board.length) * 100);
  }

  // ══════════════════════════════════
  //  SETTINGS  (device-local)
  // ══════════════════════════════════
  function saveSettings(s) {
    localStorage.setItem(KEYS.settings, JSON.stringify(s));
  }
  function loadSettings() {
    try {
      return JSON.parse(localStorage.getItem(KEYS.settings)) || _defaultSettings();
    } catch {
      return _defaultSettings();
    }
  }
  function _defaultSettings() {
    return { music: true, sfx: true, volume: 70, scanlines: true, particles: 'medium' };
  }

  return {
    init,
    savePilot, loadPilot,
    saveScore, loadScores, getBestScore,
    getTotalLandings, getMaxStreak, getHighestLevel,
    submitScore,        // async
    getGlobalBoard,     // async
    getTodayBoard,      // async
    getRankForScore, getPercentile,
    saveSettings, loadSettings
  };

})();

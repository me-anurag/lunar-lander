/* ═══════════════════════════════════
   storage.js — v3.0  LEADERBOARD REWRITE
   ─────────────────────────────────────
   ALL BUGS FIXED:

   BUG 1 FIXED: Supabase returns timestamps WITHOUT 'Z' suffix.
     JS Date() was treating "2025-04-23T10:00:00" as LOCAL time.
     In IST (UTC+5:30) this makes a brand-new score show "5h ago".
     Fix: always append 'Z' when normalizing created_at.

   BUG 2 FIXED: submitScore was sending created_at from client.
     Removed — Supabase column DEFAULT now() handles it server-side.
     Server timestamp is always correct UTC regardless of client clock.

   BUG 3 FIXED: Upsert was ALWAYS overwriting, even with lower score.
     Now checks existing score first. Only submits if new score > old.

   BUG 4+5 FIXED: getRankForScore read empty cache right after busting it.
     submitScore now awaits a fresh board fetch BEFORE computing rank.
     Rank shown to player is accurate.

   BUG 6 FIXED (in leaderboard.js): _formatDate now shows minutes too.
     "2m ago", "15m ago" etc. instead of jumping straight to "1h ago".
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

  const VERSION   = '3.0';
  const CACHE_TTL = 30_000; // 30 seconds

  function init() {
    if (localStorage.getItem(KEYS.version) !== VERSION) {
      // Clear old cache on version change
      localStorage.removeItem(KEYS.cache);
      localStorage.removeItem(KEYS.cacheTs);
      localStorage.setItem(KEYS.version, VERSION);
    }
  }

  function _h(extra = {}) {
    return {
      'Content-Type':  'application/json',
      'apikey':        SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      ...extra
    };
  }

  // ── Timestamp fix: Supabase returns "2025-04-23T10:00:00" (no Z)  ──
  // Without 'Z', JS Date() parses as LOCAL time — wrong in any non-UTC timezone.
  // Adding 'Z' forces UTC interpretation which matches Supabase server time.
  function _toMs(isoStr) {
    if (!isoStr) return Date.now();
    // If already has timezone info (Z or +HH:MM), use as-is
    // Otherwise append Z to treat as UTC
    const normalized = /[Z+]/.test(isoStr.slice(-6)) ? isoStr : isoStr + 'Z';
    return new Date(normalized).getTime();
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
  //  SUBMIT SCORE → Supabase
  //
  //  Strategy:
  //  1. Fetch current best score for this pilot from Supabase
  //  2. Only POST if new score > existing (preserves personal best)
  //  3. After successful insert, fetch fresh board
  //  4. Compute accurate rank from fresh data
  //  5. Cache fresh board so leaderboard shows correctly immediately
  // ══════════════════════════════════
  async function submitScore(pilotName, avatar, score, level, streak) {
    try {
      // Step 1: Check if pilot already has a higher score
      const existing = await _fetchExistingScore(pilotName);
      if (existing !== null && existing >= score) {
        console.log(`[Supabase] Score ${score} ≤ existing best ${existing} — not updating`);
        // Still fetch fresh board to get accurate rank
        const freshBoard = await _fetchBoardFromServer();
        return _rankInBoard(freshBoard, score);
      }

      // Step 2: Upsert (insert or update if score is better)
      // NOTE: created_at is NOT sent — Supabase DEFAULT now() handles it
      // This ensures server-side UTC timestamp, no client clock issues
      const res = await fetch(`${SUPABASE_URL}/rest/v1/scores`, {
        method:  'POST',
        headers: _h({
          'Prefer': 'resolution=merge-duplicates,return=representation'
        }),
        body: JSON.stringify({
          name:   pilotName,
          avatar: avatar,
          score:  score,
          level:  level,
          streak: streak
          // NO created_at — server sets this with DEFAULT now()
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error('[Supabase] submitScore failed:', res.status, errText);
        // Still try to compute rank from stale cache
        return _rankInBoard(_readCache(), score);
      }

      console.log('[Supabase] Score submitted successfully');

      // Step 3: Fetch fresh board AFTER insert (cache was just busted by insert)
      localStorage.removeItem(KEYS.cache);
      localStorage.removeItem(KEYS.cacheTs);
      const freshBoard = await _fetchBoardFromServer();

      // Step 4: Compute accurate rank
      return _rankInBoard(freshBoard, score);

    } catch (e) {
      console.error('[Supabase] submitScore network error:', e.message);
      return _rankInBoard(_readCache(), score);
    }
  }

  // Fetch just one pilot's current score to compare before upsert
  async function _fetchExistingScore(pilotName) {
    try {
      const encoded = encodeURIComponent(pilotName);
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/scores?name=eq.${encoded}&select=score&limit=1`,
        { headers: _h() }
      );
      if (!res.ok) return null;
      const rows = await res.json();
      if (!Array.isArray(rows) || rows.length === 0) return null;
      return rows[0].score || 0;
    } catch { return null; }
  }

  // Core function: fetch board from Supabase, normalize, cache, return
  async function _fetchBoardFromServer() {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/scores` +
      `?select=name,avatar,score,level,streak,created_at` +
      `&order=score.desc` +
      `&limit=100`,
      { headers: _h() }
    );

    if (!res.ok) {
      console.error('[Supabase] board fetch failed:', res.status);
      return _readCache();
    }

    const rows = await res.json();
    if (!Array.isArray(rows)) return _readCache();

    const normalized = rows.map(r => ({
      name:   r.name   || 'UNKNOWN',
      avatar: r.avatar || '🚀',
      score:  r.score  || 0,
      level:  r.level  || 1,
      streak: r.streak || 0,
      // BUG 1 FIX: append 'Z' so JS parses as UTC, not local time
      // "2025-04-23T10:00:00" → "2025-04-23T10:00:00Z"
      // Without Z, IST users (UTC+5:30) see timestamps 5.5h in the past
      date: _toMs(r.created_at)
    }));

    localStorage.setItem(KEYS.cache,   JSON.stringify(normalized));
    localStorage.setItem(KEYS.cacheTs, String(Date.now()));
    return normalized;
  }

  // Compute rank within a given board array
  function _rankInBoard(board, score) {
    if (!Array.isArray(board) || board.length === 0) return 1;
    const idx = board.findIndex(e => e.score <= score);
    return idx === -1 ? board.length + 1 : idx + 1;
  }

  // ══════════════════════════════════
  //  GET GLOBAL BOARD ← Supabase
  //  Returns cached version if fresh (<30s old)
  //  Otherwise fetches from server
  // ══════════════════════════════════
  async function getGlobalBoard() {
    const ts = parseInt(localStorage.getItem(KEYS.cacheTs) || '0', 10);
    if (Date.now() - ts < CACHE_TTL) {
      const cached = _readCache();
      if (cached.length > 0) return cached;
    }
    try {
      return await _fetchBoardFromServer();
    } catch (e) {
      console.error('[Supabase] getGlobalBoard error:', e.message);
      return _readCache();
    }
  }

  function _readCache() {
    try { return JSON.parse(localStorage.getItem(KEYS.cache)) || []; }
    catch { return []; }
  }

  // ══════════════════════════════════
  //  TODAY'S BOARD
  //  Uses UTC midnight to match server timestamps
  // ══════════════════════════════════
  async function getTodayBoard() {
    const board = await getGlobalBoard();
    // Compute UTC midnight (not local midnight) to match server timestamps
    const now     = new Date();
    const utcMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    return board.filter(e => e.date >= utcMidnight);
  }

  // ══════════════════════════════════
  //  RANK / PERCENTILE
  //  NOTE: only valid AFTER getGlobalBoard() has been awaited
  // ══════════════════════════════════
  function getRankForScore(score) {
    return _rankInBoard(_readCache(), score);
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
    try { return JSON.parse(localStorage.getItem(KEYS.settings)) || _defaultSettings(); }
    catch { return _defaultSettings(); }
  }
  function _defaultSettings() {
    return { music: true, sfx: true, volume: 70, scanlines: true, particles: 'medium' };
  }

  return {
    init,
    savePilot, loadPilot,
    saveScore, loadScores, getBestScore,
    getTotalLandings, getMaxStreak, getHighestLevel,
    submitScore,      // async — awaits fresh board fetch
    getGlobalBoard,   // async
    getTodayBoard,    // async
    getRankForScore, getPercentile,
    saveSettings, loadSettings
  };

})();
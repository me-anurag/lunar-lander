/* ═══════════════════════════════════
   storage.js — v4.0  REALTIME LEADERBOARD
   ─────────────────────────────────────
   HOW REALTIME WORKS:
   Supabase Realtime uses WebSockets (Postgres logical replication).
   When ANY player submits a score, Supabase pushes the change to
   every connected browser in ~100ms — no polling, no page refresh.

   The flow:
   1. Page loads → WebSocket connects to Supabase Realtime
   2. We subscribe to INSERT and UPDATE events on the scores table
   3. Any change anywhere in the world → our callback fires instantly
   4. We update local cache + re-render leaderboard live
   5. submitScore still does a normal REST POST (Realtime handles broadcast)

   ALL BUGS FROM v3.0 ARE CARRIED FORWARD:
   ✅ BUG 1: Timezone — _toMs() appends Z for UTC parsing
   ✅ BUG 2: No created_at in POST — server sets it
   ✅ BUG 3: Score comparison — only update if better
   ✅ BUG 4+5: Fresh board fetch after submit for accurate rank
   ✅ BUG 6: _formatDate shows minutes (fixed in leaderboard.js)
   ✅ BUG 7: UTC midnight for Today tab
═══════════════════════════════════ */
'use strict';

const SUPABASE_URL = "https://slgmriloxwueemhuoffz.supabase.co";
const SUPABASE_KEY = "sb_publishable_WSWQgBvACjvw-Fed_XwBnA_Qsw7sCxs";

// Realtime WebSocket endpoint (Supabase Realtime v2 protocol)
const REALTIME_URL = SUPABASE_URL.replace('https://', 'wss://') + '/realtime/v1/websocket';

const Storage = (() => {

  const KEYS = {
    pilot:    'lunar_pilot',
    scores:   'lunar_scores',
    settings: 'lunar_settings',
    version:  'lunar_version',
    cache:    'lunar_board_cache',
    cacheTs:  'lunar_board_cache_ts',
  };

  const VERSION   = '4.0';
  const CACHE_TTL = 60_000; // 60s — Realtime keeps it fresh anyway

  // Realtime WebSocket state
  let _ws             = null;
  let _wsReady        = false;
  let _wsRetryCount   = 0;
  let _onBoardUpdate  = null;  // callback: (newBoard) => void
  let _heartbeatTimer = null;

  // ── Init: connect Realtime + clear old cache on version change ──
  function init() {
    if (localStorage.getItem(KEYS.version) !== VERSION) {
      localStorage.removeItem(KEYS.cache);
      localStorage.removeItem(KEYS.cacheTs);
      localStorage.setItem(KEYS.version, VERSION);
    }
    _connectRealtime();
  }

  // ── Supabase REST headers ──
  function _h(extra = {}) {
    return {
      'Content-Type':  'application/json',
      'apikey':        SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      ...extra
    };
  }

  // ── Timezone-safe timestamp conversion ──
  // Supabase returns "2025-04-23T10:00:00" (no Z) for old columns
  // After SQL fix it returns "2025-04-23T10:00:00+00:00"
  // This handles BOTH cases correctly
  function _toMs(isoStr) {
    if (!isoStr) return Date.now();
    // If it already has timezone marker (Z or +HH:MM), use as-is
    // If not, append Z to force UTC interpretation
    const hasZone = /[Z+]/.test(isoStr.slice(-6)) || isoStr.endsWith('Z');
    return new Date(hasZone ? isoStr : isoStr + 'Z').getTime();
  }

  // ── Normalize a raw Supabase row to app format ──
  function _normalize(r) {
    return {
      name:   r.name   || 'UNKNOWN',
      avatar: r.avatar || '🚀',
      score:  Number(r.score)  || 0,
      level:  Number(r.level)  || 1,
      streak: Number(r.streak) || 0,
      date:   _toMs(r.created_at)
    };
  }

  // ════════════════════════════════════════
  //  SUPABASE REALTIME — WebSocket
  //  Protocol: Supabase Realtime v2 (Phoenix channels)
  //  Subscribes to postgres_changes on scores table
  //  Fires _onBoardUpdate() whenever any score changes
  // ════════════════════════════════════════
  function _connectRealtime() {
    try {
      const url = `${REALTIME_URL}?apikey=${SUPABASE_KEY}&vsn=1.0.0`;
      _ws = new WebSocket(url);

      _ws.onopen = () => {
        console.log('[Realtime] WebSocket connected');
        _wsReady = true;
        _wsRetryCount = 0;
        _joinChannel();
        _startHeartbeat();
      };

      _ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          _handleRealtimeMessage(msg);
        } catch(e) {}
      };

      _ws.onerror = (e) => {
        console.warn('[Realtime] WebSocket error — falling back to polling');
      };

      _ws.onclose = () => {
        _wsReady = false;
        _stopHeartbeat();
        // Exponential backoff reconnect: 2s, 4s, 8s, max 30s
        const delay = Math.min(2000 * Math.pow(2, _wsRetryCount), 30000);
        _wsRetryCount++;
        console.log(`[Realtime] Reconnecting in ${delay/1000}s...`);
        setTimeout(_connectRealtime, delay);
      };
    } catch(e) {
      console.warn('[Realtime] WebSocket not supported — using polling');
      _startPolling();
    }
  }

  // Join the Supabase Realtime channel for the scores table
  function _joinChannel() {
    if (!_ws || !_wsReady) return;
    const joinMsg = {
      topic:   'realtime:public:scores',
      event:   'phx_join',
      payload: {
        config: {
          broadcast:  { self: false },
          presence:   { key: '' },
          postgres_changes: [{
            event:  '*',      // INSERT, UPDATE, DELETE
            schema: 'public',
            table:  'scores'
          }]
        }
      },
      ref: '1'
    };
    _ws.send(JSON.stringify(joinMsg));
  }

  // Handle incoming Realtime messages
  function _handleRealtimeMessage(msg) {
    // Heartbeat reply
    if (msg.event === 'phx_reply' && msg.payload?.status === 'ok') return;

    // Postgres change event
    if (msg.event === 'postgres_changes') {
      const record = msg.payload?.data?.record || msg.payload?.record;
      const type   = msg.payload?.data?.type   || msg.payload?.type; // INSERT/UPDATE/DELETE

      if (!record) return;

      console.log(`[Realtime] ${type} event received for:`, record.name);

      // Update local cache immediately with the new/updated record
      _applyRealtimeUpdate(record, type);

      // Fire the board update callback (re-renders leaderboard if open)
      if (_onBoardUpdate) {
        _onBoardUpdate(_readCache());
      }
    }
  }

  // Apply a realtime change to the local cache without a full re-fetch
  function _applyRealtimeUpdate(record, type) {
    let board = _readCache();
    const normalized = _normalize(record);

    if (type === 'DELETE') {
      board = board.filter(e => e.name !== normalized.name);
    } else {
      // INSERT or UPDATE
      const existingIdx = board.findIndex(e => e.name === normalized.name);
      if (existingIdx >= 0) {
        // Only update if new score is better (mirrors the DB trigger)
        if (normalized.score > board[existingIdx].score) {
          board[existingIdx] = normalized;
        }
      } else {
        board.push(normalized);
      }
      // Re-sort by score descending
      board.sort((a, b) => b.score - a.score);
    }

    // Save updated cache (timestamp stays fresh — we just got live data)
    localStorage.setItem(KEYS.cache,   JSON.stringify(board));
    localStorage.setItem(KEYS.cacheTs, String(Date.now()));
  }

  // Phoenix protocol heartbeat — must send every 30s or server closes connection
  function _startHeartbeat() {
    _stopHeartbeat();
    _heartbeatTimer = setInterval(() => {
      if (_ws && _wsReady) {
        _ws.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: null }));
      }
    }, 25000);
  }

  function _stopHeartbeat() {
    if (_heartbeatTimer) { clearInterval(_heartbeatTimer); _heartbeatTimer = null; }
  }

  // Fallback polling when WebSocket fails (e.g. corporate firewalls)
  let _pollTimer = null;
  function _startPolling() {
    if (_pollTimer) return;
    _pollTimer = setInterval(async () => {
      try {
        const board = await _fetchBoardFromServer();
        if (_onBoardUpdate) _onBoardUpdate(board);
      } catch(e) {}
    }, 10000); // every 10 seconds as fallback
  }

  // Register a callback for live board updates
  function onBoardUpdate(fn) {
    _onBoardUpdate = fn;
  }

  // ════════════════════════════════════════
  //  PILOT  (device-local)
  // ════════════════════════════════════════
  function savePilot(pilot) { localStorage.setItem(KEYS.pilot, JSON.stringify(pilot)); }
  function loadPilot() {
    try { return JSON.parse(localStorage.getItem(KEYS.pilot)); } catch { return null; }
  }

  // ════════════════════════════════════════
  //  SESSION SCORES  (device-local)
  // ════════════════════════════════════════
  function saveScore(entry) {
    const scores = loadScores();
    scores.push(entry);
    if (scores.length > 100) scores.splice(0, scores.length - 100);
    localStorage.setItem(KEYS.scores, JSON.stringify(scores));
  }
  function loadScores() {
    try { return JSON.parse(localStorage.getItem(KEYS.scores)) || []; } catch { return []; }
  }
  function getBestScore() {
    const s = loadScores();
    return s.length ? Math.max(...s.map(x => x.score || 0)) : 0;
  }
  function getTotalLandings() { return loadScores().reduce((a,s) => a+(s.landings||0), 0); }
  function getMaxStreak()     { return Math.max(0, ...loadScores().map(s => s.maxStreak||0)); }
  function getHighestLevel()  { return Math.max(1, ...loadScores().map(s => s.level||1)); }

  // ════════════════════════════════════════
  //  SUBMIT SCORE → Supabase REST
  //  (Realtime subscription handles broadcast to others)
  // ════════════════════════════════════════
  async function submitScore(pilotName, avatar, score, level, streak) {
    try {
      // Check existing score — only submit if better
      const existing = await _fetchExistingScore(pilotName);
      if (existing !== null && existing >= score) {
        console.log(`[Storage] Score ${score} ≤ existing ${existing} — not updating`);
        const freshBoard = await _fetchBoardFromServer();
        return _rankInBoard(freshBoard, score);
      }

      // POST to Supabase — no created_at, server sets it with DEFAULT now()
      const res = await fetch(`${SUPABASE_URL}/rest/v1/scores`, {
        method:  'POST',
        headers: _h({ 'Prefer': 'resolution=merge-duplicates,return=representation' }),
        body: JSON.stringify({ name: pilotName, avatar, score, level, streak })
      });

      if (!res.ok) {
        console.error('[Supabase] submitScore failed:', res.status, await res.text());
        return _rankInBoard(_readCache(), score);
      }

      console.log('[Supabase] Score submitted — Realtime will broadcast to others');

      // Bust cache + fetch fresh for accurate rank display to THIS player
      localStorage.removeItem(KEYS.cache);
      localStorage.removeItem(KEYS.cacheTs);
      const freshBoard = await _fetchBoardFromServer();
      return _rankInBoard(freshBoard, score);

    } catch(e) {
      console.error('[Supabase] submitScore error:', e.message);
      return _rankInBoard(_readCache(), score);
    }
  }

  async function _fetchExistingScore(pilotName) {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/scores?name=eq.${encodeURIComponent(pilotName)}&select=score&limit=1`,
        { headers: _h() }
      );
      if (!res.ok) return null;
      const rows = await res.json();
      return (Array.isArray(rows) && rows.length > 0) ? Number(rows[0].score) : null;
    } catch { return null; }
  }

  // ════════════════════════════════════════
  //  FETCH BOARD FROM SUPABASE SERVER
  // ════════════════════════════════════════
  async function _fetchBoardFromServer() {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/scores` +
      `?select=name,avatar,score,level,streak,created_at` +
      `&order=score.desc&limit=100`,
      { headers: _h() }
    );

    if (!res.ok) {
      console.error('[Supabase] board fetch failed:', res.status);
      return _readCache();
    }

    const rows = await res.json();
    if (!Array.isArray(rows)) return _readCache();

    const board = rows.map(_normalize);
    localStorage.setItem(KEYS.cache,   JSON.stringify(board));
    localStorage.setItem(KEYS.cacheTs, String(Date.now()));
    return board;
  }

  function _readCache() {
    try { return JSON.parse(localStorage.getItem(KEYS.cache)) || []; } catch { return []; }
  }

  function _rankInBoard(board, score) {
    if (!Array.isArray(board) || !board.length) return 1;
    const idx = board.findIndex(e => e.score <= score);
    return idx === -1 ? board.length + 1 : idx + 1;
  }

  // ════════════════════════════════════════
  //  GET GLOBAL BOARD
  //  Uses cache if fresh (Realtime keeps it updated anyway)
  //  Falls back to REST fetch if cache is stale
  // ════════════════════════════════════════
  async function getGlobalBoard() {
    const ts = parseInt(localStorage.getItem(KEYS.cacheTs) || '0', 10);
    if (Date.now() - ts < CACHE_TTL) {
      const cached = _readCache();
      if (cached.length > 0) return cached;
    }
    try { return await _fetchBoardFromServer(); }
    catch(e) { return _readCache(); }
  }

  // ════════════════════════════════════════
  //  TODAY'S BOARD  (UTC midnight)
  // ════════════════════════════════════════
  async function getTodayBoard() {
    const board = await getGlobalBoard();
    const now = new Date();
    const utcMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    return board.filter(e => e.date >= utcMidnight);
  }

  // ════════════════════════════════════════
  //  RANK / PERCENTILE (from cache)
  // ════════════════════════════════════════
  function getRankForScore(score) { return _rankInBoard(_readCache(), score); }
  function getPercentile(score) {
    const board = _readCache();
    if (!board.length) return 100;
    return Math.round((board.filter(e => e.score < score).length / board.length) * 100);
  }

  // ════════════════════════════════════════
  //  SETTINGS  (device-local)
  // ════════════════════════════════════════
  function saveSettings(s) { localStorage.setItem(KEYS.settings, JSON.stringify(s)); }
  function loadSettings() {
    try { return JSON.parse(localStorage.getItem(KEYS.settings)) || _defaultSettings(); }
    catch { return _defaultSettings(); }
  }
  function _defaultSettings() {
    return { music:true, sfx:true, volume:70, scanlines:true, particles:'medium' };
  }

  return {
    init, onBoardUpdate,
    savePilot, loadPilot,
    saveScore, loadScores, getBestScore,
    getTotalLandings, getMaxStreak, getHighestLevel,
    submitScore, getGlobalBoard, getTodayBoard,
    getRankForScore, getPercentile,
    saveSettings, loadSettings
  };

})();

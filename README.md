# New branch created !!!
# 🚀 LUNAR — Moon Lander v2.0

A full-featured, deployable arcade moon lander game built for the web.  
No backend required. No login. Instant play.

---

## 📁 File Structure

```
lunar-lander/
├── index.html              Main entry point — all screens
├── css/
│   ├── base.css            Design tokens, resets, shared buttons/toggles
│   ├── screens.css         Splash, Home, Game Over screen styles
│   ├── game.css            HUD, canvas, result modal, touch gamepad
│   ├── leaderboard.css     Leaderboard screen & entry styles
│   ├── profile.css         Pilot card & avatar styles
│   └── settings.css        Settings panel styles
├── js/
│   ├── audio.js            Web Audio API engine + generative bg music
│   ├── stars.js            Animated starfield + shooting stars
│   ├── storage.js          localStorage persistence (scores, pilot, settings)
│   ├── leaderboard.js      Score formula, ELO calculation, board rendering
│   ├── profile.js          Pilot profiles + emoji avatar grid
│   ├── settings.js         Settings manager (audio, display, reset)
│   ├── physics.js          Physics engine + terrain generation (8 level configs)
│   ├── renderer.js         Canvas 2D renderer (terrain, lander, particles)
│   ├── hud.js              HUD updates + result modal
│   ├── game.js             Game state machine + main loop
│   ├── screens.js          Screen router + all button wiring
│   └── main.js             Application bootstrap
└── README.md
```

---

## 🎮 Screens

| Screen | Description |
|--------|-------------|
| **Splash** | Pilot name + emoji avatar selection. No login required. |
| **Home** | Pilot card, game rules, play/leaderboard/settings navigation. |
| **Game** | Full physics gameplay with HUD, touch controls, result modals. |
| **Leaderboard** | Global / Today / My Rank tabs with ELO-sorted board. |
| **Settings** | Music, SFX, volume, scanlines, particle quality, pilot edit, reset. |
| **Game Over** | Session stats, final ELO score, global rank, fly-again button. |

---

## 🧮 Scoring & Leaderboard Math

### Per-Landing Score
```
base     = 1000 + (fuel_remaining × 10) + max(0, 2000 − time_elapsed × 2)
multi     = streak ≥ 3 → ×3 | streak ≥ 2 → ×2 | else ×1
perf_cond = Vy < 0.8 AND Hx < 0.4 AND fuel > 15% → +2 to multiplier
earned    = floor(base × multi)
```

### Session ELO (Leaderboard Ranking Value)
```
ELO = raw_score × level_multiplier × accuracy_bonus × efficiency_coeff

level_multiplier = 1 + (max_level_reached − 1) × 0.15
accuracy_bonus   = 1 + (perfect_landings / total_landings) × 0.5
efficiency_coeff = 1 + (min(max_streak, 10) / 10) × 0.3
```

This rewards: reaching high levels, landing precisely, and maintaining long streaks — not just grinding raw score at level 1.

### Rank Titles
| Score     | Title      |
|-----------|------------|
| ≥ 40,000  | COMMANDER  |
| ≥ 25,000  | ACE PILOT  |
| ≥ 15,000  | VETERAN    |
| ≥ 8,000   | PILOT      |
| < 8,000   | CADET      |

---

## 🧠 Design Principles Applied

### Don Norman — Design of Everyday Things
- **Affordances**: Glowing landing pad, pulsing green beacon → clearly communicates "land here"
- **Feedback**: HUD color transitions (green → gold → red), combo pop-ups, streak banners
- **Discoverability**: Laws panel on home screen, key legend always visible
- **Constraints**: Wall bouncing, fuel depletion, angle limits prevent impossible states
- **Mapping**: Left key → moves left, right key → moves right (natural mapping)

### Hook Model (Nir Eyal)
- **Trigger**: Game over screen's default focused button is "FLY AGAIN" — zero friction to replay
- **Action**: One tap / one key to launch — minimal friction
- **Variable Reward**: Random terrain every level, variable streak multipliers, leaderboard position changes
- **Investment**: Pilot identity, rank progression, leaderboard position accumulates over sessions

### Flow Theory (Csikszentmihalyi)
- 8 deliberate difficulty levels: never too easy, never impossible
- Each level adds one new challenge (pad size → gravity → wind → turbulence)
- Real-time HUD feedback keeps player in "flow zone"

### TikTok-Style Compulsion Loop
- Post-landing: modal appears immediately with score breakdown + "NEXT MISSION" button prominently focused
- No waiting screen, no main menu redirect between levels
- "Just one more level" is always one tap away

---

## 🔊 Audio System

All audio is generated procedurally using the **Web Audio API** — no audio files needed.

| Event | Sound |
|-------|-------|
| Startup | Rising arpeggio sequence |
| Thrust | Noise burst + low sawtooth |
| Perfect landing | Full major chord arpeggio + high sparkle |
| Normal landing | Short chord arpeggio |
| Crash | Noise burst + descending tones |
| Level Up | Ascending arpeggio + high stab |
| New Record | Full ascending scale + fanfare |
| Background | Generative ambient drone + spatial pings (loops every 12s) |

---

## 🌐 Deployment

### Static Hosting (zero backend)
The leaderboard uses `localStorage` — scores persist on the user's device.  
This works perfectly for a single-device experience.

**Deploy to:**
- Netlify: drag & drop the `lunar-lander/` folder
- Vercel: `vercel --prod`
- GitHub Pages: push folder, enable Pages
- Any static file server

### For True Global Leaderboard (Multi-User)
To share a real leaderboard across devices/users, replace the `Storage.submitScore` and `Storage.getGlobalBoard` functions in `js/storage.js` with API calls to:
- **Firebase Realtime Database** (free tier) — simplest option
- **Supabase** (free tier) — REST API, no backend needed
- **Any REST API** you control

The leaderboard rendering in `js/leaderboard.js` is completely decoupled — just replace the data source in `storage.js`.

**Example Firebase replacement (storage.js):**
```js
async function submitScore(name, avatar, score, level, streak) {
  await fetch('https://your-db.firebaseio.com/scores.json', {
    method: 'POST',
    body: JSON.stringify({ name, avatar, score, level, streak, date: Date.now() })
  });
}
async function getGlobalBoard() {
  const res = await fetch('https://your-db.firebaseio.com/scores.json?orderBy="score"&limitToLast=50');
  const data = await res.json();
  return Object.values(data).sort((a,b) => b.score - a.score);
}
```

---

## 📱 Responsive Design

- **Laptop**: Keyboard controls (↑W / ← → / Space / R), full HUD
- **Mobile/Tablet**: Auto-detected touch gamepad appears at bottom
- Uses `clamp()` for all font sizes and spacing
- Safe area insets for notched phones
- `viewport-fit=cover` for full-screen immersion on iOS

---

## 🎯 Game Controls

| Input | Action |
|-------|--------|
| ↑ / W | Main thruster |
| ← / A | Left thruster |
| → / D | Right thruster |
| Space | Boost (2.4× thrust, high fuel cost) |
| R | Restart session |
| Touch ▲ | Main thruster (mobile) |
| Touch ◀▶ | Side thrusters (mobile) |
| Touch ⚡ | Boost (mobile) |

---

## ⚙️ Level Progression

| Level | Gravity | Thrust | Wind | Turbulence | Pad Width | Challenge |
|-------|---------|--------|------|------------|-----------|-----------|
| 1 | 0.055 | 0.18 | None | None | 110px | Easy intro |
| 2 | 0.060 | 0.175 | None | None | 100px | Getting real |
| 3 | 0.065 | 0.170 | None | None | 88px | Tighter pads |
| 4 | 0.070 | 0.165 | Yes | None | 80px | Wind arrives |
| 5 | 0.075 | 0.160 | Yes | Yes | 72px | Turbulence |
| 6 | 0.080 | 0.155 | Yes | Yes | 64px | Single pad |
| 7 | 0.085 | 0.150 | Strong | Yes | 56px | Tough |
| 8 | 0.090 | 0.145 | Max | Max | 48px | NIGHTMARE |

---

Built with Web Standards. No frameworks. No dependencies. Pure HTML/CSS/JS.

# Pitwall — iRacing Team Race Engineering Platform

**Pitwall** is a distributed race-engineering tool for iRacing endurance and sprint teams. It streams real-time telemetry from each driver's local iRacing instance to a central server, where strategists monitor live race state, manage pit strategy, and coordinate team communications.

## Vision

A **pit-wall engineer's control center** — a single pane of glass showing fuel consumption, lap times, tire wear, position gaps, and pit windows; one-click strategy updates to all drivers; integrated team chat and radio.

---

## Architecture

### Topology

```
Driver PC #1 (Windows)                Driver PC #2 (Windows)
┌─────────────────────┐              ┌─────────────────────┐
│ iRacing (sim)       │              │ iRacing (sim)       │
│ ↓ (MMF + UDP)       │              │ ↓ (MMF + UDP)       │
│ Pitwall Client      │              │ Pitwall Client      │
│ (Electron)          │              │ (Electron)          │
│ - irsdk-node        │              │ - irsdk-node        │
│ - React UI          │              │ - React UI          │
│ - WS client         │              │ - WS client         │
└──────────┬──────────┘              └──────────┬──────────┘
           │                                    │
           │ wss:// (binary, 5-10 Hz)          │
           │                                    │
           └────────────────┬────────────────────┘
                            │
                            ↓
              ┌─────────────────────────────────┐
              │ Central Server (Fly.io)         │
              │ ┌──────────────────────────────┐│
              │ │ Gateway (Node WS)            ││
              │ │ Session Engine (state, calc) ││
              │ │ Fan-out Hub (per-team WS)    ││
              │ └──────────────────────────────┘│
              │ Redis (hot state)               │
              │ PostgreSQL + TimescaleDB (cold) │
              └─────────────────────────────────┘
                            │
                            ↓
              Team Hub Client (Electron)
              - Live timing board
              - Strategy planner
              - Fuel/tire calc
              - Chat & radio
```

**Key insight:** One Electron binary with role selection (Driver vs. Hub). 80% shared code for auth, WS transport, charts, models. Driver mode enables telemetry capture; Hub mode unlocks strategist dashboards.

**Voice:** Integrated Discord (deep links to team voice channels), not built in-house.

---

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| **Client shell** | Electron + React 18 + TypeScript + Vite | Shared codebase, fast iteration, Electron required for telemetry access |
| **Telemetry reader** | `irsdk-node` in Electron utility process | Isolates native-addon crashes from renderer, keeps JS/TS unified |
| **Transport** | WebSocket + MessagePack binary | NAT/firewall-friendly (port 443), 3-5x smaller than JSON, bidirectional |
| **Server** | Node.js 22 LTS + Fastify + raw `ws` | Same language as client, binary-WS friendly, low overhead |
| **Live state** | Redis | Obvious for session state, TTL-based auto-cleanup |
| **Persistent storage** | PostgreSQL + TimescaleDB | One database, hypertables for telemetry, vanilla tables for relational data |
| **Auth** | Clerk | Email + Discord OAuth, team invites, role-based perms; abstract layer for portability |
| **Client state** | Zustand + TanStack Query | Minimal boilerplate, right primitives |
| **ORM** | Drizzle | TS-first, generates types shared with client |
| **Charts** | uPlot (live) + Recharts (static) | uPlot only option fast enough for streaming 60+ Hz data |
| **UI panels** | Dockview or rc-dock | Strategists customize their own layouts |
| **Monorepo** | pnpm + Turborepo | Standard, fast, well-supported |
| **Deploy** | Fly.io (server) | Global regions, WS-friendly, cheap, single-command deploy |

---

## Features

### MVP (Phase 1–2: ~4 weeks)

- [ ] Electron driver client: read iRacing telemetry (fuel, lap time, position, lap count) at 5 Hz
- [ ] WS transport to central server with MessagePack encoding
- [ ] Electron hub mode: live fuel gauge, last-5-laps per driver, connection status
- [ ] Persist sessions to Postgres; store telemetry samples to TimescaleDB
- [ ] Session replay: scrub a slider to see state at time T
- [ ] Clerk team/auth flow; role-based access (DRIVER, STRATEGIST, OWNER, SPECTATOR)

### Phase 2 (Weeks 5–7)

- [ ] Stint planner: input race duration, fuel-per-lap estimate → pit stop schedule
- [ ] Live fuel calc: "laps remaining on current consumption"
- [ ] Pit window highlight on timing board
- [ ] Strategist publish plan; drivers see next pit action
- [ ] In-app text chat (per session)
- [ ] Strategy-call macros (PIT NOW, SAVE FUEL, PUSH) one-click broadcast

### Phase 3–4 (Weeks 8+)

- [ ] Setup file management (`.sto` upload, diff view, tagging by track/car/conditions)
- [ ] Track map with live car positions (SVG centerlines per track)
- [ ] Detailed telemetry traces (throttle/brake overlays for driver coaching)
- [ ] Tire degradation model fitted to lap data
- [ ] Weather integration (iRacing weather API + forecast)
- [ ] Post-race PDF report generation
- [ ] Spotter mode UI specialization
- [ ] Discord Rich Presence + Activities (embedded voice/data)

---

## Data Model

### Core Entities

```
Team
  id, name, slug, owner_user_id, created_at

User
  id, email, display_name, discord_id, avatar_url

TeamMembership
  team_id, user_id, role (OWNER|STRATEGIST|DRIVER|SPECTATOR)

Session                              // one race, practice, or qualifying event
  id, team_id, name, track_id, car_id, session_type,
  scheduled_start, actual_start, actual_end,
  weather_snapshot_json

DriverAssignment                     // who is driving in this session
  session_id, user_id, client_instance_id,
  status (CONNECTED|DRIVING|RESTING|OFFLINE)

Stint                                // continuous run by one driver
  id, session_id, driver_assignment_id,
  start_lap, end_lap, start_fuel, end_fuel,
  tire_set_id, planned, notes

LapData (one row per lap per driver)
  id, session_id, driver_assignment_id, lap_number,
  lap_time_ms, sector_1_ms, sector_2_ms, sector_3_ms,
  fuel_used_l, avg_tire_wear_pct, incidents, valid

TelemetrySample (TimescaleDB hypertable)
  time, session_id, driver_assignment_id,
  speed_kph, rpm, gear, throttle, brake, steering,
  lap_dist_pct, fuel_l, tire_temps_jsonb, position

SetupFile
  id, team_id, car_id, track_id, name, version,
  parent_setup_id, file_bytes, parsed_json,
  created_by_user_id, created_at, notes

ChatMessage
  id, session_id, author_user_id,
  kind (TEXT|STRATEGY_CALL|PIT_COMMAND|SYSTEM),
  body, payload_jsonb, created_at

PitStop
  id, session_id, driver_assignment_id,
  lap_in, lap_out, fuel_added_l, tires_changed,
  repairs, planned, notes

StrategyPlan
  id, session_id, plan_jsonb, version,
  updated_by_user_id, updated_at
```

**Single source of truth:** Shared TypeScript types in `packages/shared` generate Drizzle schema and are used by both client and server.

---

## Telemetry Pipeline

### Channels & Sampling

**iRacing exposes ~100 channels at 60 Hz (memory-mapped file + UDP).**

We sample in tiers to avoid noise and bandwidth waste:

| Tier | Rate | Channels | Purpose |
|---|---|---|---|
| **Lap snapshot** | 1/lap | lap time, sectors, fuel used, tire wear | Strategy core |
| **Live state** | 5 Hz | speed, gear, fuel, position, lap progress | Timing board |
| **Trace** | 10 Hz | throttle/brake/steering/RPM/tire temps | Coaching (optional) |
| **Raw** | 60 Hz (local only) | everything | IBT dump for post-race review |

**Encoding:**
- MessagePack binary (3-5x smaller than JSON)
- Delta encoding for 5 Hz tier (full snapshot every 1 s, deltas in between)
- Bandwidth: ~5 KB/s per driver upstream

**Latency (end-to-end p50):**
```
iRacing MMF → Node        < 5 ms
Batching window           100-200 ms
Driver → Server WS        30-80 ms
Server processing         < 20 ms
Server → Hub WS           30-80 ms
Render                    < 16 ms
─────────────────────────
Total p50                 ~250 ms
Total p95                 < 500 ms
```

✓ Fine for strategy. ✗ Too slow for spotter calls (use Discord voice).

### iRacing SDK Integration

- **Library:** `node-irsdk@2.1.6` (community-maintained fork)
- **Read method:** Memory-mapped file on Windows; Electron utility process (not renderer)
- **Session info:** YAML header with drivers, car, track, weather, session state
- **iRacing TOS:** Confirmed personal-use telemetry streaming is permitted

---

## Current State

### Phase 0 ✓ (Complete)

- [x] Monorepo scaffolding (pnpm + Turborepo)
- [x] Shared types: `TelemetrySample`, `LapSummary`, `Team`, `Role`, WS protocol
- [x] irsdk-node spike runner (`pnpm spike:telemetry`)
  - Reads real telemetry on Windows (if iRacing is open)
  - Falls back to mock Spa simulation on non-Windows
  - Verified at 5.0 Hz
- [x] Patch script: `scripts/patch-node-irsdk.js` automates Node 22 + VS2026 compatibility fixes

### Repo Structure

```
Pitwall/
  apps/
    client/
      src/spike/run.ts              # Standalone telemetry spike
      src/telemetry/
        channels.ts                 # iRacing channel constants
        sampler.ts                  # Data mapping + fuel math
  packages/
    shared/
      src/models/index.ts           # Domain types
      src/protocol/index.ts         # WS message schemas
  scripts/
    patch-node-irsdk.js             # Windows build fixes
```

---

## Next Steps

### Phase 1 MVP Implementation (3-4 weeks)

1. **Electron scaffolding**
   - Main process: owns WS connection, orchestrates utility process
   - Renderer: React app with role picker (Driver vs. Hub mode)
   - Utility process: runs telemetry reader, posts batched samples via `MessagePortMain`

2. **WS transport**
   - Server gateway: auth handshake, assign driver to session
   - Client: connect, authenticate with team token, subscribe to live updates
   - Reconnect logic: exponential backoff, ping/pong every 20 s

3. **Driver mode**
   - Reads 5 fields (Speed, Fuel, Lap, LapCurrentLapTime, LapLastLapTime)
   - Batches at 5 Hz, encodes as MessagePack, sends to server
   - Simple UI: connection pill, "Driving as [name]", current lap time

4. **Hub mode**
   - Subscribe to team's active session
   - Live fuel gauge per connected driver
   - Last-5-laps list per driver
   - Connection status (CONNECTED / DISCONNECTED)

5. **Database**
   - Postgres + TimescaleDB on Fly.io
   - Drizzle schema + migrations
   - Persist sessions, lap data, telemetry samples
   - Retention: raw telemetry ~30 days, aggregates forever

6. **Deployment**
   - Docker image for server
   - Fly.io deploy (automatic on push)
   - electron-builder for Windows client (release artifacts on GitHub)

### Pre-Phase-1 Spike

**Critical:** Before committing, verify:
- [ ] `irsdk-node` stability on current iRacing (run spike for full 1-hour session, zero crashes)
- [ ] CPU/RAM on driver PC with Electron idle (target: <2% CPU, <200 MB RAM)
- [ ] WS over residential ISP (test idle-close at 60 s, verify ping keeps it alive)
- [ ] iRacing TOS permits third-party telemetry streaming (legal review)

---

## Known Risks & Unknowns

1. **Electron + native addon on Windows updates**
   - `irsdk-node`, `better-sqlite3` both need rebuilds per Node/Electron version
   - Mitigation: CI test Windows builds; patch script automates fixes for v2.x

2. **Voice codec & latency**
   - Building WebRTC is 3+ months; Discord integration is the right call
   - Fallback if Discord unavailable: third-party WebRTC API (Twilio, Daily.co)

3. **Scale assumptions**
   - Currently sized for one team (4 drivers + 2 engineers per race)
   - Single Node.js server OK for MVP; shard at scale (one session = one shard key)
   - Redis cluster needed if multiple teams run simultaneously

4. **Time-sync across clients**
   - Use iRacing's `SessionTime` (relative to session start) as canonical clock
   - Server adds receive-time only for diagnostics
   - Prevents off-by-one lap-time comparisons

5. **Track centerlines for map view**
   - iRacing exposes `LapDistPct`; need per-track SVG centerlines
   - v1 hand-trace critical tracks (Monza, Spa, Daytona, Sebring, Le Mans)
   - v2 scrape from iRacing API or community data

---

## Design Principles

1. **Start small, iterate.** MVP is fuel gauge + lap times; everything else is iteration.
2. **Shared types = source of truth.** `packages/shared` types generate schema, client models, and WS contracts.
3. **Pure strategy engine.** `packages/strategy-engine` is pure functions (fuel calc, pit windows) with no I/O; unit-test in isolation.
4. **Don't reinvent.** Discord for voice/chat integration, not custom WebRTC. Clerk for auth, not custom sessions.
5. **One language.** TypeScript everywhere (client, server, shared). No Python sidecars, no IPC language boundaries.
6. **Isolation.** Native addons run in Electron utility process, not renderer. Server HTTP/WS separated from data engine.

---

## Useful Commands

```bash
# Install dependencies (patches node-irsdk on Windows if needed)
pnpm install

# Verify telemetry read on Windows (with iRacing open)
pnpm spike:telemetry

# Re-apply node-irsdk patches if dependencies are reinstalled
pnpm patch:irsdk

# Type check all packages
pnpm typecheck

# Build all packages
pnpm build
```

---

## References

- **iRacing SDK:** https://github.com/bsphere/node-irsdk
- **Flyio:** https://fly.io (server deploy)
- **Clerk:** https://clerk.com (auth)
- **Drizzle ORM:** https://orm.drizzle.team
- **uPlot:** https://github.com/leeoniya/uPlot (live charts)
- **Electron:** https://www.electronjs.org

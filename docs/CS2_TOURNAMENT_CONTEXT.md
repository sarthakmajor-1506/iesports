# CS2 Tournament Pipeline — Build Context & Resume Guide

> Purpose: everything a fresh session needs to resume building the CS2 tournament
> pipeline. Mirrors how Dota and Valorant already work. Written 2026-07-26.

## The one-line model

iesports (Firestore) owns the tournament. The CS2 game server is a dumb executor.
Same shape as Dota's GC bridge:

```
Dota:  Firestore  →  botLobbyCommands   →  Railway bot  →  Steam GC  →  lobby
CS2:   Firestore  →  cs2ServerCommands  →  Railway bot  →  RCON      →  MatchZy
                  ←  matchzy webhook     ←  MatchZy events (into Firestore)
```

**Decision: we drive MatchZy directly over RCON. We do NOT use MAT (MatchZy Auto
Tournament).** MAT would be a second source of truth (its own Postgres + dashboard)
next to Firestore. We already own brackets/Swiss/seeding/veto/announcing for Dota
and Valorant, so the server stays disposable and Firestore stays authoritative.
The pre-existing `bot/src/services/matchzy.ts` + `bot/scripts/matchzyPull/Push*.ts`
target MAT — they are the abandoned path. Leave them or delete them; do not build
on them.

## The server

- Friend's server (works today): `62.72.41.184:27042`, Contabo VPS **in Mumbai**
  (`m27984.contaboserver.net`), plain Ubuntu VPS, not a managed game host.
  Verified live via A2S: CS2 v1.41.7.2, MatchZy default hostname format present
  (`MatchZy | {TEAM1} vs {TEAM2}` idle name), RCON TCP port open. MatchZy is very
  likely already installed — confirm with `meta list` / `css_plugins list`.
- Join password shared by friend: `lotgg5` (this is `sv_password`, NOT the RCON
  password — still need `rcon_password` from him).
- Single server = **serial matches**. One BO1 ≈ 45 min, so an 8-team round ≈ 3h.
  Schedule around this. User has accepted single-server for now.

### Self-host option (if not relying on friend)
- Any VPS **in Mumbai** (region is non-negotiable for IST players; ~20-40ms).
  Contabo Mumbai ≈ ₹500-900/mo is the cheapest proven option.
- Need a **GSLT** (free, steamcommunity.com/dev/managegameservers, game 730) or
  players can't connect from the public internet. Steam acct must own CS2 + have
  a phone + no bans/limits.
- steamcmd `app_update 730 validate`; Metamod:Source (CS2 build) + gameinfo.gi
  edit; CounterStrikeSharp "with-runtime" build; MatchZy release into csgo/.
- Snapshot the box and destroy between tournaments — Firestore holds all state,
  so the server is disposable. A tournament weekend costs <₹100 compute.
- **Railway CANNOT host the game server**: no public UDP ingress, no India region,
  containers replaced on deploy. Railway stays the control plane only.

## Integration surfaces (all verified against MatchZy source/docs)

1. **Push a match** (RCON → MatchZy):
   `matchzy_loadmatch_url "<https-url>" "<header-name>" "<token>"`
   MatchZy GETs our JSON with that auth header. Config JSON fields:
   `matchid`, `num_maps`, `maplist[]`, `skip_veto`, `map_sides[]`,
   `players_per_team`, `clinch_series`, `team1/team2 { name, players:{steam64:name} }`,
   `spectators`, `cvars{}`. Only Steam64 IDs supported.

2. **Live results** (MatchZy → us): cvars
   `matchzy_remote_log_url`, `matchzy_remote_log_header_key`,
   `matchzy_remote_log_header_value` (Get5-compatible). MatchZy POSTs JSON events.
   Event names (from Events.cs, field `event`): `series_start`, `going_live`,
   `round_end`, `map_result`, `series_end`, `map_picked`, `map_vetoed`,
   `side_picked`, `player_disconnect`, `demo_upload_ended`.
   **Per-player stats are NOT in the webhook** (only scores) — that's why the
   leaderboard tab needs the MySQL path below.

3. **Player stats** (MySQL): set `csgo/cfg/MatchZy/database.json` DatabaseType to
   MySQL (host on Railway/managed). Tables: `matchzy_stats_matches`,
   `matchzy_stats_maps`, `matchzy_stats_players` (matchid, kills, deaths, assists,
   ADR, etc.). Bot polls after `series_end` to fill the leaderboard.

### Verified MatchZy console (RCON) commands
`css_start`, `css_forcestart`, `css_endmatch`, `css_forceend`, `css_restart`,
`css_forcepause`, `css_forceunpause`, `css_map <map>`, `css_whitelist`,
`reload_admins`, `matchzy_loadmatch_url`, `get5_endmatch`. Admins live in
`csgo/cfg/MatchZy/admins.json` (Steam64 → "" or CSSharp flags). Put
iesportsbot's Steam64 there as a **manual fallback** (a human on that account
can type in-game `.start`/`.forceready`/`.stop`), but the automation path is RCON.

### Useful cvars
`matchzy_whitelist_enabled_default true` (only rostered SteamIDs join),
`matchzy_hostname_format`, `matchzy_demo_upload_url` (→ push GOTV demos to Firebase
Storage for disputes), `matchzy_autostart_mode 1`.

## Build status

### DONE — Phase 1: RCON transport (bot side)
- `bot/src/services/cs2-rcon.ts` — dependency-free Source RCON client on `net`.
  Handles CS2 quirks: ignores missing pre-auth RESPONSE_VALUE; multi-packet
  responses resolved on a QUIET_MS silence window (no reliable terminator on CS2).
  One short-lived connection per exec batch. Never throws. Exports `rconExec`,
  `rconArg` (sanitises `\r\n;"`), `rconTargetFromEnv`, `parseStatus`.
- `bot/src/services/cs2-server.ts` — Firestore command bridge, mirrors
  `bot-lobby.ts` exactly (incl. the diff-suppressed heartbeat with 5-min liveness
  floor — the Dota heartbeat was the #1 Firestore write source, so keep the guard).
  Consumes `cs2ServerCommands/{id}` {action,params,status:"pending"}, publishes
  `cs2ServerControl/state`. Actions: load_match, start, force_start, end_match,
  force_end, restart_match, pause, unpause, reload_admins, change_map,
  set_password, status, exec. Every action maps to a verified console command.
- `bot/src/index.ts` — calls `startCS2ServerControl(getDb())` after
  `startBotLobbyControl`. **Inert unless `CS2_RCON_HOST` + `CS2_RCON_PASSWORD` set**,
  so it cannot affect the live Dota GC path.

**RCON output is advisory.** Match state (scores, winner) comes from the webhook
into Firestore, NEVER from parsing `status`.

### TODO — Phase 2: match-config server (web)
`web/app/api/cs2/match-config/[matchId]/route.ts` (Next 16, `params` is a Promise —
`{ params }: { params: Promise<{ matchId: string }> }`, `await params`). GET,
bearer-token guarded (the header MatchZy sends on loadmatch_url; token in
`CS2_MATCH_CONFIG_TOKEN`). Reads `cs2Tournaments/{tid}/matches/{mid}` + team
rosters, resolves each member's Steam64 from `users`. Returns MatchZy JSON with
`skip_veto:true` and `maplist`/`map_sides` from the veto result (Phase 3), so the
server just plays what Discord decided. Use lazy `adminDb` from `@/lib/firebaseAdmin`.

### TODO — Phase 3: veto (reuse, don't rebuild)
Extend `bot/src/services/map-veto.ts` (already 810 lines, handles Valorant BO1/3/5).
Add CS2 Active Duty pool + CS2 sequences (BO1 = 6 bans). Veto result feeds Phase 2's
maplist + map_sides.

### TODO — Phase 4: result webhook (web)
`web/app/api/cs2/matchzy-events/route.ts` — token-auth, idempotent on
`(matchid, map_number, event)`. `going_live`→status live; `round_end`→live score;
`map_result`→write `game{N}`; `series_end`→status completed + winnerId + series score.
**FIELD-SHAPE GOTCHA:** the CS2 page (`web/app/cs2/tournament/[id]/page.tsx:97`)
reads `m[\`game${i}\`]` OR `m.games?.[\`game${i}\`]` — an object keyed `game1..gameN`.
The abandoned `matchzy.ts` writes `games` as an ARRAY — that renders blank. Write
the keyed `game1/game2/...` shape (same as Valorant's dual-storage pattern).

### TODO — Phase 5: stats + reconciliation
Bot polls `matchzy_stats_players` after series_end → `cs2Tournaments/{tid}/leaderboard`
(K/D, ADR, HS%, KAST, MVPs) — leaderboard tab already reads this collection.
`matchzy_demo_upload_url`→Firebase Storage. Admin manual-override route modeled on
`web/app/api/admin/dota-manual-result/route.ts`.

### TODO — Phase 6: standings, brackets, comms
- `web/lib/recomputeCS2Standings.ts` mirroring `recomputeDotaStandings.ts`.
- **Reuse the exact tiebreaker chain everywhere**: `points → roundDiff → mapDiff →
  wins` (seed drift from inconsistent sorts has bitten this repo — see memory
  `project_iesports_bracket_seed_sort`).
- Add `{ coll: "cs2Tournaments", statuses:[...] }` to `GAMES` in
  `bot/src/services/result-announcer.ts` for Discord + WhatsApp result posts.

## What's already in the repo (read layer, DONE before this work)
- `web/app/cs2/tournament/[id]/page.tsx` — full tabbed UI (overview/players/teams/
  standings/matches/brackets/leaderboard). Already reads keyed `game1..N`.
- `web/app/api/tournaments/detail/route.ts` — routes `game=cs2` → `cs2Tournaments`
  + `soloPlayers` collections.
- `web/app/api/cs2/solo/route.ts` + `unregister` — Steam-linked registration.
- `web/lib/types.ts` → `CS2Tournament` interface (~line 624).
- Firestore: `cs2Tournaments/{id}`, `.../soloPlayers/{uid}`, `cs2Teams/{id}`.

## Env vars to add (Railway bot; all optional — pipeline is inert without them)
```
CS2_RCON_HOST=62.72.41.184
CS2_RCON_PORT=27042
CS2_RCON_PASSWORD=<from friend — the rcon_password, NOT lotgg5>
CS2_MATCH_CONFIG_TOKEN=<random 32+ char, shared with matchzy_loadmatch_url header>
CS2_STATUS_POLL_MS=20000            # optional
MATCHZY_DATABASE_URL=<only if using the abandoned MAT path — not needed>
```
Web (Vercel) needs `CS2_MATCH_CONFIG_TOKEN` too (to validate the webhook + config
requests).

## Immediate next step when resuming
Get `rcon_password` from friend + confirm `meta list`/`css_plugins list`. Then set
the CS2_RCON_* env on Railway, load a hand-written 2-player match JSON to prove the
RCON→loadmatch→webhook loop end-to-end before building Phases 2-6.

## Landmines
- Never parse `status` for match state — webhook is truth.
- Rotate `sv_password` per match (set_password action) so stale passwords don't
  let people walk into a live game.
- Steam linkage: a wrong/unlinked Steam64 = player literally cannot join a
  whitelisted match. Add a pre-match roster validation step.
- Valve CS2 updates break Metamod/CSSharp → MatchZy won't load. Pin versions, hold
  updates during event windows, keep a known-good box snapshot.
- Do not touch `bot/` on a live deploy without Sarthak redeploying (SAFETY_RULES #4).
  The CS2 bot code is inert until env is set, which is why it was safe to add.

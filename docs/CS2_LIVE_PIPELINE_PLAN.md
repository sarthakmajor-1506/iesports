# CS2 Live Pipeline: Build Plan for the Royal Sports League

> Written 2026-07-31. Hand this to Sonnet as the execution brief.
> Read `docs/CS2_TOURNAMENT_CONTEXT.md` first for background, then this file
> for what actually changed and what to build.
>
> **Scope decision (confirmed with Sarthak):** semi-automatic. An admin clicks
> "load match" in the panel, the server pulls the roster and maps from us, and
> MatchZy pushes live scores and results back into Firestore automatically.
> Map veto stays manual in Discord for now. Per-player stats (K/D, ADR, HS%)
> are out of scope for v1. Event is 24 to 48 hours away, so build in the order
> given and stop at the "minimum to run the event" line if time runs short.

---

## 0. What changed since the last session

The blocker is gone. The friend supplied the `rcon_password` and it is verified
working. **The value is deliberately not written in this file** (see the
no-secrets rule in section 5). Sarthak has it; it goes straight into the Railway
environment variable in section 2b and nowhere else.

Everything below was verified live against `62.72.41.184:27042` on 2026-07-31,
not assumed. This replaces the "unverified" caveats in `CS2_TOURNAMENT_CONTEXT.md`.

| Fact | Value | How it was confirmed |
|---|---|---|
| RCON auth | works (password held outside the repo) | full auth handshake, commands echoed |
| Hostname | `Match Server 1 //LOTGaming` | `status` |
| CS2 build | `1.41.7.3/14173`, `secure public` | `status` |
| GSLT | already set and logged in | `sv_setsteamaccount` returns "already logged into steam" |
| Metamod / CSSharp | CounterStrikeSharp `v1.0.371` | `meta list` |
| **MatchZy** | **`0.8.5`, LOADED** | `css_plugins list` |
| Other plugins | PlayerSettings 0.9.3, MenuManager 1.4.1, WeaponPaints 3.2b | `css_plugins list` |
| GOTV | enabled, port `27043`, `tv_delay 0`, 10 slots | `status`, `tv_enable`, `tv_delay` |
| `sv_password` | `lotgg5` | `sv_password` |
| Current map | `de_dust2`, 0 humans, not hibernating | `status` |
| `game_mode` / `game_type` | `1` / `0` (competitive 5v5) | cvar read |
| `sv_hibernate_when_empty` | `false` | cvar read |
| `matchzy_hostname_format` | `LOGaming \| {TEAM1} vs {TEAM2}` (friend's custom value) | cvar read |
| `matchzy_everyone_is_admin` | `False` | cvar read |

**Every cvar we need exists on this build and is currently empty (unset):**
`matchzy_loadmatch_url`, `matchzy_remote_log_url`, `matchzy_remote_log_header_key`,
`matchzy_remote_log_header_value`, `matchzy_demo_upload_url`,
`matchzy_remote_backup_url`, `matchzy_whitelist_enabled_default`,
`matchzy_kick_when_no_match_loaded`, `matchzy_autostart_mode`.

Confirmed via `find matchzy_`. Nothing we set will clobber an existing value.

### Two new landmines found during verification

1. **`iesports.in` 307-redirects to `www.iesports.in`.** Every URL handed to
   MatchZy must use `https://www.iesports.in/...`. MatchZy's HTTP client is not
   guaranteed to follow redirects, and a redirected POST is a silent data loss.
   This applies to `matchzy_loadmatch_url` and `matchzy_remote_log_url`.
   (Vercel serves from `bom1`, same region as the game server, so latency is fine.)

2. **`cs2ServerControl` and `cs2ServerCommands` are denied to browser clients.**
   `web/firestore.rules` is default-deny with no recursive wildcard, and neither
   collection is listed. So the CS2 admin tab **must not** copy the client-side
   `onSnapshot` pattern from `BotLobbyTab.tsx:86-100`. Poll the API route's
   `action:"state"` path instead (server-side Admin SDK read). Note that
   `BotLobbyTab`'s own listener is probably erroring in production for the same
   reason, and silently falling back to its manual refresh. Do not copy the bug.

### Live tournament state (read from production API, 2026-07-31)

`cs2Tournaments/cs2-royal-sports-league`, status `upcoming`, 12 of 40 slots
booked, registration closing 23:59 IST tonight. All 12 registrants have a
distinct, valid-looking Steam64. No teams and no matches generated yet
(`shuffleCS2Teams` has not been run).

---

## 1. Architecture

No change from the decision already recorded in `CS2_TOURNAMENT_CONTEXT.md`.
Firestore is authoritative, the game server is a disposable executor.

```
Admin panel  ->  /api/admin/cs2-server  ->  cs2ServerCommands  ->  Railway bot  ->  RCON  ->  MatchZy
                                                                                      |
                          MatchZy GETs  <-  /api/cs2/match-config/[matchId]  <---------+
                          MatchZy POSTs ->  /api/cs2/matchzy-events  ->  Firestore  ->  website
```

**Why the bot and not RCON straight from Vercel:** the bot path needs zero new
bot code. `bot/src/services/cs2-rcon.ts` and `bot/src/services/cs2-server.ts`
are already written, committed, and wired into `bot/src/index.ts`, guarded to be
inert until `CS2_RCON_HOST` and `CS2_RCON_PASSWORD` exist. Turning it on is an
environment-variable change plus a redeploy, which sidesteps SAFETY_RULES #4
entirely. Do not write RCON code in the web app.

**Everything new in this plan is web-side.** There is one optional bot change
(section 8) and it is explicitly deferred.

---

## 2. Prerequisites: Sarthak does these, not Sonnet

These gate everything. Do them first, they take about five minutes.

### 2a. Generate the shared token

Any random 32+ character string. Call it `<TOKEN>` below. It is used in three
places and must be byte-identical in all three.

### 2b. Railway (bot service) environment variables

```
CS2_RCON_HOST=62.72.41.184
CS2_RCON_PORT=27042
CS2_RCON_PASSWORD=<the rcon_password from the friend, verified working>
CS2_MATCH_CONFIG_TOKEN=<TOKEN>
```

`CS2_RCON_PORT` is **not optional**. `rconTargetFromEnv()` in
`bot/src/services/cs2-rcon.ts:65` defaults to 27015 and this server is on 27042.

Redeploy the bot. Success looks like this line in the Railway logs:

```
[CS2] RCON control running -> 62.72.41.184:27042
```

If you instead see `[CS2] RCON not configured`, the env vars did not land.

### 2c. Vercel environment variable

```
CS2_MATCH_CONFIG_TOKEN=<TOKEN>
```

Same value. Redeploy the web app (or let the branch deploy do it).

### 2d. Confirm with the friend before the event

- Exclusive use of the box for the whole tournament window, no other pugs
  running. (Sarthak has confirmed this is the plan. Get it in writing.)
- **What is the server's player slot count?** This could not be determined over
  RCON: `status` reports "(0 max)" while unreserved, and `sv_maxplayers` is not
  a valid CS2 command. MatchZy sets slots when a match loads, but if the box was
  started with fewer than 10 slots, 5v5 will not fit. Test 3 in section 7 proves
  this either way. Ask him what he launched it with.
- Ask him not to update CS2 or the plugins during the event window. A Valve
  update breaks Metamod and CounterStrikeSharp, and MatchZy stops loading.
- Get a way to reach him during the event if the box needs a restart.

---

## 3. Task list

Ordered by dependency. Tasks 1 through 5 are the minimum to run the event.
Everything after task 5 is polish that can ship later.

Work on branch `sister/cs2-royal-league-groups` (the existing worktree at
`C:\Users\Sarthak\Documents\claude\iesports\iesports-cs2-royal-league`). It is
currently clean and already holds all the CS2 Royal League work.

---

### Task 1: `web/app/api/admin/cs2-server/route.ts`

The missing piece the bot already references by name at
`bot/src/services/cs2-server.ts:166`.

**Model it on `web/app/api/admin/bot-lobby/route.ts` almost verbatim.** Same
shape: `verifyAdmin` from `@/lib/verifyAdmin`, an `action:"state"` read path, an
allowlist of command actions, enqueue into Firestore, return `{ok, commandId}`.

Differences from `bot-lobby`:

- Collections are `cs2ServerControl/state` and `cs2ServerCommands`.
- Allowlisted actions, matching the switch in `cs2-server.ts:117-175` exactly:
  `load_match`, `start`, `force_start`, `end_match`, `force_end`,
  `restart_match`, `pause`, `unpause`, `reload_admins`, `change_map`,
  `set_password`, `status`, `exec`.
- **`exec` must be allowlisted here.** The bot's `exec` is deliberately
  unrestricted and its comment says the allowlisting belongs in this route.
  Permit only these command prefixes, reject everything else with a 400:
  ```
  matchzy_remote_log_url, matchzy_remote_log_header_key,
  matchzy_remote_log_header_value, matchzy_whitelist_enabled_default,
  matchzy_kick_when_no_match_loaded, matchzy_autostart_mode,
  matchzy_hostname_format, sv_password, tv_delay, css_plugins, meta,
  find, status
  ```
  Reject any value containing `;`, a newline, or a quote before enqueuing.
  (The bot's `rconArg()` also strips these, but defence in depth: this route is
  the only thing standing between an admin session and arbitrary server
  commands.)
- `change_map`: validate `^[a-z0-9_]+$` before enqueuing, same as the bot does.
- `set_password`: clamp to 30 characters.

**`load_match` needs extra work here, it is not a passthrough.** Before
enqueuing, this route must:

1. Read `cs2Tournaments/{tid}/matches/{mid}`.
2. Allocate a numeric MatchZy match id. Use `Date.now()`. **Do not use the
   Firestore document id.** MatchZy 0.8.5 treats `matchid` as a numeric type in
   several code paths, and our match ids are strings like `cs2-sf1`.
3. Write `matchzyMatchId` onto the match doc, and write a reverse index doc
   `cs2MatchzyIndex/{matchzyMatchId}` containing `{tournamentId, matchId}`.
   The webhook in task 3 resolves incoming events through this index.
4. Enqueue the command with
   `params.url = "https://www.iesports.in/api/cs2/match-config/" + matchId + "?t=" + tournamentId`,
   `params.headerKey = "X-IESports-Token"`, `params.headerValue` left unset so
   the bot fills it from `CS2_MATCH_CONFIG_TOKEN`, and `params.matchId = matchId`.

   **Use `www.iesports.in`.** See section 0, landmine 1.

**Acceptance:** `POST {adminKey, action:"status"}` enqueues a doc that the bot
picks up within a second or two and marks `status:"done"` with the raw `status`
output in `result`.

---

### Task 2: `web/app/api/cs2/match-config/[matchId]/route.ts`

The endpoint MatchZy GETs when it is told to load a match.

**Next 16 signature.** `params` is a Promise and must be awaited:

```ts
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
) {
  const { matchId } = await params;
  ...
}
```

**Auth:** read the `X-IESports-Token` request header, compare against
`process.env.CS2_MATCH_CONFIG_TOKEN`, return 401 on mismatch. Use a
length-checked comparison, and return 401 (never 403 or a body that reveals
whether the match exists) so this cannot be used as an enumeration oracle.

**Tournament id** comes from the `?t=` query param.

**Roster resolution.** `CS2Team.members[]` does **not** carry `steamId` (only
`uid`, `steamName`, `steamAvatar`, `skillLevel`). Resolve each member's Steam64
from `cs2Tournaments/{tid}/soloPlayers/{uid}.steamId`, falling back to
`users/{uid}.steamId`. Prefer `soloPlayers`: it is one subcollection read and it
is confirmed populated for every current registrant.

**If any player is missing a Steam64, return a 409 with the list of offending
uids rather than emitting a partial roster.** A player absent from the config
literally cannot join a whitelisted server, and silently dropping them turns
into a 20-minute debugging session mid-event.

**Response body**, MatchZy config format:

```jsonc
{
  "matchid": 1753958400000,          // the numeric matchzyMatchId, NOT the doc id
  "num_maps": 1,                     // bestOf: 1 for group, 3 for sf/final
  "maplist": ["de_mirage"],          // length must equal num_maps
  "skip_veto": true,                 // veto happens in Discord, not on the server
  "map_sides": ["knife"],            // length must equal num_maps
  "players_per_team": 5,
  "clinch_series": true,             // BO3 ends at 2-0 instead of playing a dead map
  "team1": {
    "name": "Team Alpha",
    "players": { "76561198668622560": "anshulsaklecha" }
  },
  "team2": { "name": "Team Bravo", "players": { } },
  "cvars": {
    "matchzy_whitelist_enabled_default": "true"
  }
}
```

- `num_maps` derivation, matching `cs2-manual-result/route.ts:85-87`:
  `m.isBracket ? (m.bracketType === "grand_final" ? tournament.grandFinalBestOf : tournament.bracketBestOf) : (tournament.matchesPerRound || 1)`.
- `map_sides` accepts `knife`, `team1_ct`, `team1_t`. Default every entry to
  `"knife"` (a knife round for sides is what players expect) unless the admin
  picked sides in the panel.
- `maplist` comes from the admin's map selection in the panel, stored on the
  match doc as `plannedMaps: string[]` by task 4. If `plannedMaps` is absent,
  fall back to `["de_mirage"]` for BO1 and
  `["de_mirage","de_inferno","de_nuke"]` for BO3, and include a warning in the
  server log. Do not 500 over a missing map choice during a live event.
- Only Steam64 is supported in `players`. No Steam2, no Steam3.

**Acceptance:** `curl -H "X-IESports-Token: <TOKEN>" "https://www.iesports.in/api/cs2/match-config/<mid>?t=cs2-royal-sports-league"`
returns valid JSON with 5 Steam64 keys per team. Without the header it returns 401.

---

### Task 3: `web/app/api/cs2/matchzy-events/route.ts`

The webhook. This is the piece that makes results appear on the website without
anyone typing them.

**Auth:** same `X-IESports-Token` header check.

**Critical first step: log before you map.** The exact JSON shape MatchZy 0.8.5
emits per event is not documented well enough to code against blind, and this
plan will not pretend otherwise. Build the route so that its very first action,
before any parsing, is to append the raw body to
`cs2MatchzyEvents/{autoId}` as `{receivedAt, raw}`. Keep this permanently. It
costs almost nothing (a handful of writes per match), it is the only forensic
trail when a result lands wrong mid-event, and during Test 4 it is how you learn
the real field names. Write the mapping logic against what you actually observe
in that collection, not against the field names guessed below.

**Resolve the target match** by reading `cs2MatchzyIndex/{payload.matchid}` to
get `{tournamentId, matchId}`. **If the index doc does not exist, log it and
return 200 OK without writing anything.** Returning an error would make MatchZy
retry forever, and a 200 with no write is the correct behaviour for an event
belonging to somebody else's match. This is what keeps a stray pug on a shared
box from corrupting tournament data.

**Idempotency.** MatchZy can resend. Derive a deterministic key from
`(matchid, map_number, event, round_number)` and use it as a document id in a
`cs2MatchzyEventSeen` collection, written in the same transaction as the state
change. Skip anything already seen. `round_end` in particular fires 20 to 30
times per map.

**Event handling (verify names against the raw log first):**

| Event | Write |
|---|---|
| `series_start` | `status:"live"`, `liveStartedAt` |
| `going_live` | `status:"live"`, `game{N}.status:"live"` |
| `round_end` | `game{N}.team1RoundsWon`, `game{N}.team2RoundsWon`, `liveUpdatedAt`. Nothing else. |
| `map_result` | `game{N}` final scores plus `game{N}.status:"completed"` |
| `series_end` | the full settle: see below |
| `map_picked` / `map_vetoed` / `side_picked` | append to `vetoLog[]`, no state change |
| `player_disconnect` | ignore for v1 |
| `demo_upload_ended` | store the URL on `game{N}.demoUrl` if present |

**FIELD SHAPE, do not get this wrong.** Games are stored as an object keyed
`game1`, `game2`, `game3`, never as an array. The tournament page reads
`m[\`game${i}\`] || m.games?.[\`game${i}\`]` at
`web/app/cs2/tournament/[id]/page.tsx:98`. The abandoned `bot/src/services/matchzy.ts`
writes an array and renders blank. Match the shape that
`web/app/api/admin/cs2-manual-result/route.ts:73-77` writes.

**On `series_end`, do not reimplement the settle logic.** The cascade
(standings recompute, semifinal seeding from group standings, final seeding from
semifinal winners, champion stamping, Discord announcement) already exists and
is correct in `cs2-manual-result/route.ts:100-204`.

**Refactor it out into `web/lib/settleCS2Match.ts` and call it from both
routes.** Export something like
`settleCS2Match(db, {tournamentId, matchId, winner, team1Rounds, team2Rounds, source})`,
where `source` is `"manual-admin"` or `"matchzy"` and lands in the existing
`result.source` provenance field. Move `maybeSeedCS2Semifinals` and
`maybeSeedCS2Final` into the same file. `cs2-manual-result/route.ts` then
becomes a thin auth-and-validate wrapper over it and must keep behaving
identically, because it is the fallback path when the webhook fails mid-event.

This refactor is worth the 45 minutes. Two divergent copies of bracket-advance
logic is exactly how a grand final gets seeded wrong at 11pm.

**Always return 200 quickly.** Do the Firestore writes, then return. Discord
announcements go through the existing `.catch()` fire-and-forget pattern so a
Discord outage cannot make MatchZy retry a result.

---

### Task 4: `web/app/admin/components/CS2ServerTab.tsx` and the tab wiring

**Wiring** (3 small edits to `web/app/admin/page.tsx`):
- line 29: add `"cs2Server"` to the `AdminTab` union.
- near line 16: `const CS2ServerTab = dynamic(() => import("@/app/admin/components/CS2ServerTab"), { ssr: false });`
- near line 1447: add the tab button, and near line 3975 the render branch,
  both copying the `botLobby` pattern exactly.

**Component**, modeled on `BotLobbyTab.tsx` but **polling the API route, not
using `onSnapshot`** (section 0, landmine 2). Poll `action:"state"` every 5
seconds while the tab is visible, pause on `document.hidden`.

Panel sections:

1. **Server status.** Online/offline pill, hostname, current map, humans/max,
   `loadedMatchId`, `lastCommand`, `lastError`, and the age of `updatedAt` so a
   dead bot is visible at a glance. A "Refresh" button firing `action:"status"`.

2. **Prepare server.** One button that enqueues the five `exec` commands from
   section 6 in order. This is what points the server at our webhook. Show the
   token as masked. **Label it clearly as "run once at the start of the event",
   and note next to it that these are runtime cvars that do not survive a server
   restart.** If the box reboots, this button has to be pressed again.

3. **Load a match.** A tournament dropdown (CS2 only), a match dropdown
   populated from `cs2Tournaments/{tid}/matches`, a map picker (one map for BO1,
   three for BO3, from the Active Duty pool: `de_mirage`, `de_inferno`,
   `de_nuke`, `de_ancient`, `de_anubis`, `de_dust2`, `de_train`), and a
   **"Validate rosters" button that runs before "Load match" is enabled.**
   Validate calls the match-config route server-side and surfaces any missing
   Steam64 by player name. This is the single highest-value 30 minutes in the
   whole plan: an unlinked Steam account is invisible until a player cannot
   connect, and by then you have nine people waiting.
   The map picker writes `plannedMaps` onto the match doc, which task 2 reads.

4. **Match control.** Buttons for `start`, `force_start`, `pause`, `unpause`,
   `restart_match`, `end_match`, `force_end`. Put `force_end` and `end_match`
   behind a `window.confirm`, same as `BotLobbyTab` does for `destroy`.

5. **Server admin.** `change_map` with a dropdown, and `set_password` with a
   "generate" button producing a random 6-character password.
   **Rotate the join password for every match.** `lotgg5` is currently shared
   with the friend and whoever else has ever played there.

6. **Recent commands.** Last 8 from `cs2ServerCommands`, with status and error,
   from the route's `state` response.

Styling: inline styles only, no Tailwind classes. Copy the `sectionStyle`,
`labelStyle`, `inputStyle`, `btn()` helpers straight out of `BotLobbyTab.tsx`.

---

### Task 5: Generate the teams and matches

Not code, an operation, but it is on the critical path and nothing above can be
tested end to end without it.

Once registration closes, run the existing script:

```
npx tsx scripts/shuffleCS2RoyalSportsLeague.ts            # dry run, prints the draft
npx tsx scripts/shuffleCS2RoyalSportsLeague.ts --apply    # writes teams + matches
```

This is a production data mutation. Per SAFETY_RULES #1, **Sarthak runs this, not
Sonnet.** It creates `cs2Tournaments/{tid}/teams/*`, the round-robin matches, and
the `cs2-sf1` / `cs2-sf2` / `cs2-final` placeholders that the settle cascade
depends on.

Note the tournament currently has 12 of 40 players. `shuffleCS2Teams` splits
into 2 groups of 4 teams of 5. Twelve players is not 40. Decide before running
whether to cut to a smaller bracket or extend registration, and if the shape
changes, the fixed `cs2-sf1`/`cs2-sf2`/`cs2-final` ids that the auto-seed logic
keys off must still exist.

---

## === Minimum to run the event is everything above this line ===

---

### Task 6: Live scoreboard and OBS overlay

Nice to have, skip if the event is tomorrow.

- `web/lib/cs2Live.ts`: normalizer reading the webhook-fed Firestore state
  (not an external API, unlike `dotaLive.ts` which polls Steam).
- `web/app/api/cs2/live/route.ts`: copy the 25-second in-process `Map` cache and
  `export const dynamic = "force-dynamic"` from `web/app/api/dota/live/route.ts`,
  and set `Cache-Control: no-store`.
- `web/app/overlay/cs2-scoreboard/page.tsx`: copy
  `web/app/overlay/scoreboard/page.tsx`. Transparent body, 8-second poll,
  `pointerEvents:"none"`, keep the last good frame on error, render an empty div
  when not found so OBS shows nothing rather than an error.

If you build this, set `tv_delay` to 90 or more before casting, otherwise the
GOTV feed is a live stream of both teams' positions. It is currently `0`.

### Task 7: Fix the CS2 standings sort inconsistency

Real bug, found during this review, unrelated to the server work but cheap.

`web/app/cs2/tournament/[id]/page.tsx:527-529` sorts standings by
`points -> buchholz -> mapDiff`. The canonical CS2 chain is
`points -> roundDiff -> mapDiff -> wins`, implemented in
`web/lib/recomputeCS2Standings.ts:110-116` and exported as `sortCS2Standings`.

The page can therefore display a different table order than the one the
semifinal auto-seeding uses, which means the bracket can be seeded from an order
nobody saw on screen. Import `sortCS2Standings` on the page and delete the local
sort. This is the exact seed-drift class of bug that ONBOARDING rule #10 warns
about.

### Task 8: Deferred, do not build now

- **Map veto automation** (`bot/src/services/map-veto.ts` + CS2 pool). Bot
  change, needs a redeploy, and veto works fine manually in Discord.
- **Per-player stats.** Requires MatchZy's MySQL, which requires SSH on the game
  server. Out of scope per the scope decision. The leaderboard tab will render
  empty, which is correct and honest.
- **Demo upload** to Firebase Storage via `matchzy_demo_upload_url`.
- **CS2 in `bot/src/services/result-announcer.ts`.** Not needed: the settle path
  already posts to Discord directly via `sendCS2MatchResult`.
- **Firestore rules for `cs2Tournaments`.** Currently absent, so client reads
  are denied and everything correctly goes through `/api/tournaments/detail`.
  Leave it. Adding rules now is a change to a security file on the eve of an
  event, for no functional gain.

---

## 4. New Firestore collections

| Collection | Written by | Purpose |
|---|---|---|
| `cs2ServerCommands/{autoId}` | task 1 route | command queue, consumed by the bot |
| `cs2ServerControl/state` | the bot | live server state, read by task 1's `state` action |
| `cs2MatchzyIndex/{matchzyMatchId}` | task 1 `load_match` | numeric MatchZy id to `{tournamentId, matchId}` |
| `cs2MatchzyEventSeen/{key}` | task 3 | idempotency guard |
| `cs2MatchzyEvents/{autoId}` | task 3 | raw event log, forensic trail |

All five are server-only via the Admin SDK. Default-deny in `firestore.rules`
already covers them, no rules change needed.

New fields on `cs2Tournaments/{tid}/matches/{mid}`: `matchzyMatchId` (number),
`plannedMaps` (string[]), `liveStartedAt`, `liveUpdatedAt`, `vetoLog` (array).

Add `CS2Match`, `CS2ServerState` and `CS2ServerCommand` interfaces to the end of
`web/lib/types.ts`. Append only, never restructure.

---

## 5. Repo conventions Sonnet must follow

From `web/CLAUDE.md`, `ONBOARDING.md` and `docs/SAFETY_RULES.md`:

- **Brand is lowercase `iesports`** in every user-facing string.
- **Inline styles only.** No CSS files, no Tailwind classes, no CSS modules.
  CS2 class prefixes are `cs2-*` / `cs-*` / `csd-*`.
- **`adminDb` from `@/lib/firebaseAdmin` in every API route.** Never the client
  SDK. Do not touch `firebaseAdmin.ts` itself, the lazy Proxy is load-bearing.
- **Additive changes only** to `lib/types.ts`, `AuthContext.tsx`, `Navbar.tsx`.
- **`if (existingMatch.isBracket === true) return;`** at the top of any Swiss or
  standings logic.
- **No debug `console.log` in production routes.** The paired success/error
  operational logs in Discord integration code are the documented exception, and
  the raw MatchZy event log is a Firestore write, not a console log.
- **No em-dashes and no double-hyphens** in prose: commit messages, PR bodies,
  code comments, UI copy.
- **Never push to `main`.** Work on `sister/cs2-royal-league-groups`.
- **Never commit a secret.** The token, the RCON password and `lotgg5` go in
  environment variables and nowhere else. Note that `62.72.41.184`, `27042` and
  `lotgg5` are already committed in `docs/CS2_TOURNAMENT_CONTEXT.md`; do not add
  the RCON password to any tracked file, including this one.
- **Do not touch `bot/`.** No change there is required by this plan.
- **Do not run anything in `web/scripts/ad-hoc/`**, and do not run the seed or
  shuffle scripts. Sarthak runs those.

---

## 6. Server preparation commands

Run once at the start of the event, via the panel's "Prepare server" button or
directly through `action:"exec"`. **These are runtime cvars and do not survive a
server restart.**

```
matchzy_remote_log_url "https://www.iesports.in/api/cs2/matchzy-events"
matchzy_remote_log_header_key "X-IESports-Token"
matchzy_remote_log_header_value "<TOKEN>"
matchzy_whitelist_enabled_default true
matchzy_autostart_mode 1
```

`www.` is mandatory. See section 0, landmine 1.

Leave `matchzy_kick_when_no_match_loaded` at its default of `false`. Setting it
true locks everyone out of the server between matches, including you when you
are trying to debug.

Do not change `matchzy_hostname_format`. It is the friend's branding and
changing it buys nothing.

Loading a match is then a single command, which the bot builds for you:

```
matchzy_loadmatch_url "https://www.iesports.in/api/cs2/match-config/<matchId>?t=<tid>" "X-IESports-Token" "<TOKEN>"
```

---

## 7. Test plan

Run these in order. Each one isolates a single link in the chain, so a failure
tells you exactly which piece is broken.

**Test 1: RCON reaches the server.** After the Railway redeploy, panel ->
`action:"status"`. Expect the command doc to go `pending` -> `processing` ->
`done` within a couple of seconds, with `Match Server 1 //LOTGaming` in the
result and `cs2ServerControl/state` showing `status:"online"`.
*If it fails:* check `CS2_RCON_PORT` is 27042, not the 27015 default.

**Test 2: the config endpoint serves a roster.** `curl` it with the token as
shown in task 2. Expect 5 Steam64 keys per team. Expect 401 without the header.
*If it fails:* almost certainly missing `steamId` on a `soloPlayers` doc.

**Test 3: MatchZy can fetch the config.** Prepare the server, then load a match.
Watch `status` afterwards: the hostname should change to
`LOTGaming | <TEAM1> vs <TEAM2>` and the map should change to your first map.
**This is also the test that answers the slot-count question from section 2d:**
if MatchZy loads the match and the server reports 10 or more max players, 5v5
fits.
*If it fails:* the server could not reach `www.iesports.in`, or the redirect bit
you. Check `cs2MatchzyEvents` is empty and the RCON output of the loadmatch
command for an error string.

**Test 4: the webhook receives events.** With the match loaded, have two people
join and knife it out, or use `css_forcestart`. Watch `cs2MatchzyEvents` fill up.
**Read the raw payloads and write the task 3 mapping against them.** Do not skip
this. It is the only place the true field names come from.

**Test 5: a full result lands on the website.** Play or force a short match to
completion. Expect `status:"completed"`, a keyed `game1` with round scores, a
Discord post, and updated standings on
`https://www.iesports.in/cs2/tournament/cs2-royal-sports-league`.
*If it fails:* compare what the webhook wrote against what
`cs2-manual-result` writes. The shape has to match.

**Test 6: the fallback still works.** Enter a result through the existing manual
admin path and confirm it behaves exactly as before the refactor. This is the
safety net for the event and it must not have regressed.

Do all of this against a throwaway match, not a real fixture. Ask Sarthak to
create a scratch CS2 tournament with two dummy teams, as SAFETY_RULES suggests.

---

## 8. Landmines

Carried forward from `CS2_TOURNAMENT_CONTEXT.md` plus what this review found.

- **The webhook is the source of truth for match state. Never parse RCON
  `status` for scores or winners.** `status` output is advisory, and the RCON
  client resolves multi-packet responses on a silence window, so it can be
  truncated under load.
- **Use `www.iesports.in` everywhere.** New this session.
- **Do not use `onSnapshot` in the admin tab** for `cs2ServerControl`. New this
  session.
- **Write `game1`/`game2`/`game3` as keyed object fields, never an array.**
- **One server means matches run serially.** A BO1 is about 45 minutes. Eight
  teams in a round is roughly 3 hours of wall clock. Schedule accordingly and
  tell the players, because idle teams leave.
- **Rotate `sv_password` every match.** `lotgg5` is effectively public.
- **A player without a linked Steam64 cannot join a whitelisted server.**
  Validate rosters before every single match, not just the first.
- **Runtime cvars die on server restart.** If the box reboots mid-event, press
  "Prepare server" again before loading the next match.
- **Preserve the diff-suppressed heartbeat** in `cs2-server.ts:50-52`. The Dota
  equivalent was doing 57,000 Firestore writes a day before it was hashed.
- **A Valve CS2 update breaks Metamod and CounterStrikeSharp**, and MatchZy
  stops loading. Nothing you can do from the panel. This is why section 2d asks
  the friend to hold updates.
- **`WeaponPaints` is installed on this server.** It is a skin changer. Harmless
  for match integrity, but if a player reports seeing odd skins, that is why,
  and it is not a sign the match config is wrong.

---

## 9. Time estimate

| Task | Estimate |
|---|---|
| 2. Prerequisites (Sarthak) | 5 min |
| 1. `admin/cs2-server` route | 1 to 1.5 h |
| 2. `cs2/match-config` route | 1.5 to 2 h |
| 3. `cs2/matchzy-events` route + `settleCS2Match` refactor | 3 to 4 h |
| 4. `CS2ServerTab` + wiring | 2 to 3 h |
| 5. Shuffle teams (Sarthak) | 10 min |
| Testing (section 7) | 1 to 2 h |
| **Minimum to run the event** | **9 to 13 h** |
| 6. Live overlay | +3 h |
| 7. Standings sort fix | +20 min |

If the clock runs out, the honest fallback is tasks 1, 4 and 5 only: you get a
working control panel to run the server from, and results still get typed in
through the existing manual admin route. That is strictly better than today and
it is a safe place to stop.

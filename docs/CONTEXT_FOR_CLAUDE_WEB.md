# iesports — Project Brief for Claude (Web)

> Paste this whole file into Claude.ai or Claude Code when starting a new session
> so the model has full context about the project, tech stack, conventions,
> and the trickier bits of the Dota 2 bot pipeline.
>
> **Brand wordmark**: always lowercase `iesports` in user-facing copy
> (Discord, lobby names, web UI, footers).
> Capitalized "IEsports" is wrong — never use it for player-visible text.

---

## What iesports is

**iesports** (iesports.in) is an Indian esports tournament platform run by
Sarthak Jain. Built around fair, rank-verified, casual-but-serious play with
a Discord-first ops layer.

- **Live games**: Valorant, Dota 2, CS2
- **Coming**: Call of Duty (Q3 2026)
- **Founder + sole engineer**: Sarthak (user). Single-developer codebase.
- **Distribution**: web app + Discord bot hosted on Railway. WhatsApp result
  posting is a side channel for community groups (whatsapp-web.js, separate
  service).

---

## Repo layout

The git repo is at `~/Documents/iesports/iesports/` (yes, doubled folder name).

```
iesports/
├── web/                          ← Next.js 15 app, deployed to Vercel as project "iesports"
│   ├── app/
│   │   ├── api/
│   │   │   ├── admin/            ← admin-protected routes (verifyAdmin or x-admin-secret header)
│   │   │   │   ├── bot-lobby/                ← enqueue botLobbyCommands (Dota GC ops)
│   │   │   │   ├── dota-result-job/          ← queue dotaResultJobs for resolveDotaResults
│   │   │   │   ├── dota-manual-result/       ← admin-stamped winner fallback
│   │   │   │   └── dota-match-reset/         ← soft/hard match reset
│   │   │   ├── valorant/
│   │   │   │   └── match-update/route.ts     ← THE central match-ops route. Handles
│   │   │   │                                   set-lobby, start, next-game, cleanup-vcs
│   │   │   │                                   for BOTH Valorant AND Dota (via isDotaTournament branch).
│   │   │   └── tournaments/
│   │   │       └── detail/route.ts           ← read-only, returns tournament + teams + matches + standings + leaderboard
│   │   ├── admin/page.tsx                    ← admin panel, ~3500 lines
│   │   ├── tournament/[id]/page.tsx          ← Dota tournament detail (matches + standings + leaderboard)
│   │   ├── valorant/tournament/[id]/page.tsx ← Valorant equivalent
│   │   └── components/                       ← Navbar, RegisterModal, DoubleBracket SVG, etc.
│   ├── lib/
│   │   ├── firebase.ts                       ← CLIENT Firebase SDK
│   │   ├── firebaseAdmin.ts                  ← ADMIN SDK (lazy Proxy — see Vercel notes below)
│   │   ├── recomputeDotaStandings.ts         ← shared helper called from manual-result + match-reset
│   │   └── types.ts                          ← shared TS types
│   ├── public/                               ← logos, share-image backgrounds, riot.txt
│   └── scripts/                              ← admin/maintenance scripts (npx tsx scripts/X.ts)
├── bot/                          ← Discord.js + steam-user, deployed to Railway
│   └── src/
│       ├── index.ts              ← Discord client, cron schedulers, command queues
│       └── services/
│           ├── dota-gc.ts        ← Steam GC connection, lobby SO parsing, requestMatchDetails (PRACTICE LOBBIES ARE DENIED — see below)
│           ├── bot-lobby.ts      ← consumes botLobbyCommands queue, publishes botLobbyControl/state heartbeat
│           ├── match-orchestrator.ts ← scheduled-match cron entry; onMatchComplete writes results + standings
│           ├── dota-results.ts   ← resolveDotaResults() — scans GC match history, maps to tournament rosters
│           ├── opendota.ts       ← OpenDota rank refresh
│           └── firebase.ts       ← bot-side admin SDK
└── whatsapp/                     ← whatsapp-web.js LocalAuth, consumes whatsappOutbox
```

---

## Tech stack (must respect)

| Layer | Tech |
|---|---|
| Web framework | Next.js 16 (App Router, TypeScript, Turbopack) |
| Database | Firebase Firestore (Blaze plan) |
| Auth | Firebase Auth — Phone OTP + Steam OpenID + Discord OAuth |
| Hosting (web) | Vercel — project name **`iesports`**, production branch `main`, root dir `web/` |
| Hosting (bot) | Railway, auto-deploys from `main` push |
| Dota rank | OpenDota (2k req/month free tier) |
| Valorant rank | Henrik API (interim, replacing with official Riot API after Production key approval) |
| CS2 rank | Steam OpenID only (no public CS2 rank API) |
| Discord | discord.js (bot side), REST via fetch (web side) |
| Steam GC | steam-user library, raw GC sendToGC for Dota messages (no node-dota2) |
| Video | Remotion for share videos |
| Analytics | @vercel/analytics |

---

## Coding rules (FOLLOW STRICTLY)

1. **Inline styles only.** No new CSS files, no Tailwind, no CSS modules. Existing class prefixes: `dt-*` (Dota listing), `vt-*` (Valorant), `cs2-*` (CS2), `ie-*` (landing), `dtd-*` (Dota tournament detail). Style with `style={{ ... }}`.

2. **Additive changes to shared files.** Extend `lib/types.ts`, `AuthContext.tsx`, `Navbar.tsx` — never restructure.

3. **Multi-game extensibility via constants.** New games = add entries to `GAME_COLLECTIONS`, `GAME_OPTIONS`, `FORMAT_OPTIONS` constants.

4. **`isBracketMatch` guard — CRITICAL.** Swiss auto-resolve and standings logic MUST be gated:
   ```ts
   if (existingMatch.isBracket === true) return; // prevent Swiss logic from corrupting bracket matches
   ```
   Otherwise Swiss `matchDay` collisions corrupt bracket data.

5. **Server-side Firestore = Admin SDK only.** In API routes use `import { adminDb } from '@/lib/firebaseAdmin'`. Client SDK fails silently for unauthenticated users.

6. **Valorant match data — dual storage shape:**
   ```ts
   const game1 = match.game1 ?? match.games?.game1; // flat (new) with nested (old) fallback
   ```

7. **No debug console.logs in API routes** except the deliberate operational telemetry in `valorant/match-update`, `match-fetch`, `match-result` — those are kept.

8. **NEVER log raw OAuth tokens, Steam API keys, or Firebase private keys.**

9. **Riot API compliance (Production app in flight):**
   - No MMR/ELO/rank estimator exposed to users
   - No de-anonymising other players (no PUUID/Riot ID leak)
   - No NFT, gambling, betting integration
   - 70% of net entry fees must go to prize pools (games-of-skill positioning)
   - All Riot assets via Data Dragon / Press Kit — never redistribute Riot IP

10. **Brand wordmark `iesports` lowercase everywhere user-facing.** Discord embeds, lobby names, footers, DMs. Capitalized "IEsports" is treated as a bug. The startup banner in bot console + Steam machine name are NOT user-facing so they keep capitalization.

11. **`web/app/api/payments/` is .gitignored.** Razorpay integration is WIP. Don't `git add` anything under that path.

---

## Firestore collections (high-signal subset)

### `users/{uid}`
UID format: `discord_{discordId}` or `steam_{steam64}`. Fields:
- Auth: `phone`, `fullName`, `steamId`, `steamName`, `steamAvatar`, `discordId`, `discordUsername`
- Dota: `dotaRankTier` (Valve's 11-80 scale), `dotaBracket` ∈ {herald_guardian, crusader_archon, legend_ancient, divine_immortal}, `dotaMMR`, `recentMatches`, `smurfRiskScore`
- Valorant: `riotGameName`, `riotTagLine`, `riotTier`, `riotRank`, `riotPuuid`, `riotRegion`, `riotAccountLevel`, `riotVerified` ∈ {unlinked, pending, verified}, `riotScreenshotUrl`
- Registration arrays: `registeredTournaments`, `registeredValorantTournaments`, `registeredCS2Tournaments`, `registeredSoloTournaments`
- Admin: `role` ∈ {super_admin, cafe_admin}

### Game-specific tournament collections
| Game | Tournaments | Teams | Subcollections |
|---|---|---|---|
| Dota 2 | `tournaments` | `teams` | matches, standings, leaderboard, players |
| Valorant | `valorantTournaments` | `valorantTeams` | matches, standings, leaderboard, soloPlayers |
| CS2 | `cs2Tournaments` | `cs2Teams` | matches, soloPlayers |
| Dota solo | `soloTournaments` | — | players |

### Bot ↔ web message bus (Firestore-mediated)
- `botLobbyCommands/{id}` — GC action queue {action, params, status:"pending"|"processing"|"done"|"error"}. Actions: create, invite_all, invite, kick, shuffle, flip, launch, destroy, refresh. Bot consumes via onSnapshot.
- `botDiscordCommands/{id}` — Discord-side ops queue. Only action right now: `evacuate_vc {vcId, fallbackVcId}` (bot uses Discord.js gateway voice cache; REST can't enumerate VC members).
- `botLobbyControl/state` — single doc, bot heartbeats every 1.5s. Fields: status, gcReady, lobbyName, password, region, gameMode, members[], memberCount, lobbyMatchId, lobbyState (CSODOTALobby.State enum), lobbyMatchOutcome, lobbyHeroes, lastError, lastCommand.
- `dotaResultJobs/{id}` — manual result fetch requests. Bot cron picks up, runs resolveDotaResults, writes report + logs back.
- `botQueues/{id}` — scheduled match queue. status ∈ {open, in_progress, closed}. Auto-fired by bot cron at scheduledTime, but also created on-demand by `/api/valorant/match-update` action=set-lobby for tournament matches.
- `whatsappOutbox/{id}` + `whatsappStatus/state` — WhatsApp group result posts.

---

## The Dota 2 bot lobby flow (where most session work happened)

Why this is complex: Valve doesn't expose a Tournament API for Dota practice lobbies. To run our own tournament with Discord+web ops you need:
1. A Steam account (`iesportsbot`) that hosts the practice lobby via GC messages
2. A Discord bot that posts embeds, manages VCs, accepts admin commands
3. A web layer that synthesizes botQueues from admin clicks

The clean pipeline today:

**Pre-match (admin clicks Set Lobby & Notify in admin Step 1):**
- web POST `/api/valorant/match-update {action:"set-lobby"}` → `isDotaTournament` branch
- web creates `🎮 {Initials1} vs {Initials2}` waiting room VC
- web posts Discord embed in tournament channel with @-mentions + clickable VC link
- web synthesizes `botQueues/{id}` doc with `status:"open"`, `scheduledTime:now`
- Bot cron (every minute) picks up the queue → `startMatchLobby(client, queue)`
- Bot calls `bot.createLobby(name, password, mode, region)` via GC — `k_EMsgGCPracticeLobbyCreate` (7038), 90s timeout
- Bot waits for the lobby's CSODOTALobby SO to arrive at type_id 2004 in any of msgType 21, 22, 23, 24, 26, 4004 (CMsgClientWelcome on reconnect)
- Bot sends Steam invites to all roster steam32s
- Bot also auto-invites Shrey Jain (steam32=129122102, override via env `LOBBY_ADMIN_STEAM32`) as lobby admin/broadcaster
- Bot posts lobby embed + admin-controls row to tournament Discord channel
- These message IDs get stashed on the match doc's `discordOpsMessageIds` array so Cleanup VCs can sweep them later

**During match (players accept invites, join lobby):**
- Admin clicks **Start Match** in admin Step 3 → web POST `/api/valorant/match-update {action:"start"}`
- web creates `🔴 {team1Name}` + `🔵 {team2Name}` team VCs
- web moves roster discord IDs from waiting room to their team VC
- web evacuates non-roster stragglers from waiting room → Dota General VC (`1475549366600073321` default, env `DOTA_GENERAL_VC_ID`) via `botDiscordCommands evacuate_vc`
- web deletes waiting room
- web sets match status `live`
- web enqueues `botLobbyCommands {action:"launch"}` so the bot triggers the actual game server allocation via `k_EMsgGCPracticeLobbyLaunch` (7041) — the bot is the lobby host so only it can launch

**Match plays. Bot in lobby observes lobby SO updates throughout:**
- `lobbyState` transitions: UI(0) → SERVERSETUP(1) → SERVERASSIGN(6) → RUN(2) → POSTGAME(3)
- When `match_id` (field 30 in CSODOTALobby) gets stamped during server allocation, bot emits `lobbyMatchId` event; orchestrator writes it to `tournaments/{tid}/matches/{mid}.dotaMatchId`
- When state→POSTGAME(3) AND `match_outcome` (field 70) > 0, bot emits `matchComplete` event with {matchId, matchOutcome, radiantWin, members, heroBySteam32}

**Post-match (auto via POSTGAME SO):**
- Bot's onMatchComplete handler in `match-orchestrator.ts`:
  - Loads both team rosters from Firestore
  - Maps team1/team2 → Radiant/Dire by overlapping the lobby's members[] with the rosters
  - Writes `status:"completed"`, `winner`, `team1Score`, `team2Score`, `dotaMatchId`, `result:{source:"lobby-so-postgame", ...}`, `games.game1` to the match doc
  - Posts a result embed to the tournament Discord channel (stored as `resultMessageId`, NOT in `discordOpsMessageIds` so cleanup-vcs preserves it)
  - Recomputes the entire `standings` subcollection inline (sums points, kills, mapsWon, etc. across all completed matches)

**End-of-match cleanup (admin clicks Cleanup VCs in admin Step 5):**
- web enqueues `botDiscordCommands evacuate_vc` for waiting room + team1VC + team2VC in parallel
- Bot moves voice members to Dota General before web deletes the channels (so players keep voice continuity)
- web deletes tracked `discordOpsMessageIds` — both web-posted embeds AND bot's lobby embed/admin controls
- Result message survives (stashed under `resultMessageId`)

---

## The two CRITICAL bugs that took most of the session

### Bug 1: CSODOTALobby field 120, not 2

The bot's hand-rolled protobuf schema in `dota-gc.ts` read `repeated CDOTALobbyMember members = 2`. But the real proto (SteamDatabase/Protobufs/dota2/dota_gcmessages_common_lobby.proto) says `repeated CSODOTALobbyMember all_members = 120`. Field 2 is empty/garbage for CSODOTALobby. Result: `memberCount=0` for every lobby including ones with 10 humans. Broke:
- Bot's `pollFirestoreForTeams` waiting on lobbyUpdate events (never fired)
- `lobbyCreated` event was gated on `members.length > 0` (never fired → 90s create timeouts)
- VC creation from bot side
- All side-mapping (team1=radiant vs team1=dire)

Fixed by rewriting the schema to use `all_members = 120` and the full enum names.

### Bug 2: State enum ordering

The bot mapped `lobbyState=3` to "RUN" in logs and gating logic. Real proto enum is `UI=0, SERVERSETUP=1, RUN=2, POSTGAME=3, READYUP=4, NOTREADY=5, SERVERASSIGN=6`. So state=3 is actually **POSTGAME** (match complete). The bot had been seeing match-end events the whole time and labeling them as "RUN".

Combined fix: emit `matchComplete` when state→3 + match_outcome > 0; orchestrator writes results without needing requestMatchDetails (which Valve denies for our account anyway).

---

## What still blocks per-player stats

`requestMatchDetails` (k_EMsgGCMatchDetailsRequest, 7095) returns `result=15` (Access Denied) when the bot account is in Unassigned team. Steam Web API GetMatchDetails is also locked for our key on practice/custom lobbies. OpenDota doesn't index practice lobbies.

**Unlock path: register a Dota 2 league_id.** At https://www.dota2.com/eventregistration/ register a Tier 5 Amateur League. Once approved, set `leagueid` (field 42 in CSODOTALobby create payload) in `bot/src/services/dota-gc.ts buildDetails()` — practice lobbies tagged with a league ID become indexable by OpenDota AND queryable via Steam Web API. Per-player K/D/A/damage/heal/GPM/items all become available automatically.

Alternative: STRATZ free API key from stratz.com/api as a fallback in `dota-results.ts` (~50 lines).

For now the auto-resolve captures **winner + match outcome + hero picks** (heroes are in CSODOTALobbyMember.hero_id at field 2 which IS exposed in the SO). Per-player K/D/A requires the manual "Team X wins" button in admin Step 4 OR waiting on league_id approval.

---

## Vercel deploy chain (because this broke silently)

**Vercel project name: `iesports`** (NOT `web` — there's a stray `web` project Sarthak should delete, accidentally created by `vercel --prod --yes` from the web/ dir).

**Critical: Next.js 16 build "Collect page data" pass imports every API route in worker processes without env vars.** Any module that calls SDK constructors at module load (top-level `cert(...)`, `new Razorpay({...})`) crashes the entire build. Auto-deploys can silently fail for hours.

**Fix pattern: lazy Proxy.** See `web/lib/firebaseAdmin.ts`:
```ts
const lazy = <T extends object>(get: () => T): T =>
  new Proxy({} as T, {
    get(_t, prop) {
      const target = get();
      const value = (target as any)[prop];
      return typeof value === "function" ? value.bind(target) : value;
    },
    set(_t, prop, value) { (get() as any)[prop] = value; return true; },
    has(_t, prop) { return prop in (get() as any); },
    ownKeys(_t) { return Reflect.ownKeys(get() as any); },
    getOwnPropertyDescriptor(_t, prop) { return Object.getOwnPropertyDescriptor(get() as any, prop); },
  });

export const adminDb: Firestore = lazy(() => getFirestore(ensureApp()));
```

The `set` trap and method binding are BOTH required. Without binding, `this._settingsFrozen = true` inside Firestore SDK methods throws "Cannot assign to read only property '_settingsFrozen'" because `this` becomes the Proxy.

---

## Game-specific patterns

### Dota 2 — bracket assignment is FIXED at registration
Player rank (`dotaRankTier`) determines bracket once: herald_guardian (1-25), crusader_archon (26-45), legend_ancient (46-65), divine_immortal (66-80). Stored on `tournaments/{id}/players/{uid}.dotaBracket`. Don't refresh from user docs at runtime — the page polled every 60s and was flipping rank between mount + first poll, reshuffling positions.

### Valorant — bracket is COMPUTED post-registration
Raw `riotTier` stored at registration. After deadline, admin runs bracket computation → quartile-based S/A/B/C tiers. `bracketsComputed: boolean` flag tracks state.

### Valorant formats:
- `shuffle` (solo reg → snake-draft → Swiss → double elim)
- `auction` (captain picks with budget; S-tier max 2 per team)
- `standard` (pre-formed teams)

### CS2 — no rank verification, Steam OpenID only
No public CS2 rank API exists. Admins / community manually balance rosters.

### Solo Dota scoring (for `soloTournaments`)
```
Score = (Kills × 3) + (Assists × 1) − (Deaths × 2) + LastHits/10 + GPM/100 + XPM/100 + (Win ? 20 : 0)
Player total = sum of top 5 match scores within tournament window
```

### Dota tournament leaderboard MVP (role-fair Impact score)
Computed CLIENT-SIDE in `tournament/[id]/page.tsx`:
```
Carry track:   K×5 + Dmg/1500 + GPM/60 + Tower/800 + WinRate×15 − D×2
Support track: A×3 + Heal/500 + K×2 + WinRate×15 − max(0, D − 5)
Impact = max(carry, support)
```
Either archetype can take MVP. Mirrors OpenDota IMP and Stratz per-role weights.

---

## Useful commands

```bash
# Dev
cd web && npm run dev
cd bot && npm run dev

# Typecheck (run from web/ or bot/ subdir)
npx tsc --noEmit

# Deploy
git push origin main  # Vercel + Railway both auto-deploy
vercel --prod         # manual web deploy (link first: vercel link --project iesports --yes)

# Common scripts (run from web/)
npx tsx scripts/_botState.ts                                        # dump live bot state
npx tsx scripts/_recomputeDomin8Standings.ts                        # rebuild standings from scratch
npx tsx scripts/_resetR2M2.ts                                       # hard reset one match (template)
npx tsx scripts/_softResetMatch.ts <tournamentId> <matchId>         # admin-doc-only reset
npx tsx scripts/enqueueDotaResultFetch.ts --tid=X [--matchid=Y]     # manual GC result fetch
npx tsx scripts/_dumpDotaLb.ts                                      # inspect leaderboard subcollection
```

---

## Common Discord channel IDs (current as of 2026-05-24)

| Purpose | ID |
|---|---|
| Domin8 tournament channel | `1504863767203283051` |
| Test tournament channel | `1507408605593206844` |
| **Dota 2 General VC** (evacuation fallback) | `1475549366600073321` |

Override via env vars: `DOTA_GENERAL_VC_ID`, `DISCORD_GUILD_ID`, `LOBBY_CONTROL_CHANNEL_ID`, etc.

---

## Things to remember when working in this repo

1. The web ↔ bot relationship is **mediated entirely through Firestore**. Don't try to make web call the bot directly — the bot holds the Steam GC session and can't expose HTTP.
2. **Bot account `iesportsbot` is single-session.** If someone logs into it elsewhere, Railway gets `LoggedInElsewhere` and the lobby disbands. Tell users to log out before debugging.
3. **Don't write "completed" status on stale data cleanup scripts.** The `_cleanWrongMatchIds.ts` landmine: stripping a wrong `dotaMatchId` should ONLY strip that field, never bulk-wipe sibling result fields. Standings broke because of this.
4. **Standings auto-recompute is now wired** into `onMatchComplete` (bot), `dota-manual-result` (web), and `dota-match-reset` (web). Shared helper at `web/lib/recomputeDotaStandings.ts`.
5. **Admin panel uses Firestore `onSnapshot` (real-time push)** for bot lobby state + dotaResultJobs, not polling. Down from 3s polling to ~500ms perceived latency.
6. **Mobile UX** for the Dota tournament detail page uses 3-line clamp at ≤600px and ≤400px breakpoints. Don't revert to single-line ellipsis.
7. **`isTestTournament: true` + `visibleToUids: string[]`** makes a tournament show only to a whitelisted set of UIDs — used for internal Dota dry-runs.

---

## When in doubt

The git log on `main` is the most reliable source. Recent commits are well-described and cite incident specifics. `web/scripts/` has small utility scripts for almost every common operation (look for the `_` prefix — those are ad-hoc; the unprefixed ones are stable tools).

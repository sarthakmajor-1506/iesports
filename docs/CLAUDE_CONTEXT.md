# Claude Context — iesports Project Memory

> This file is for **your Claude** to read. It captures accumulated knowledge from prior sessions, including incident learnings, architectural snapshots, and convention decisions that aren't obvious from the code alone.
>
> Sarthak's Claude (running on his Mac) has 17 small memory files in `~/.claude/...` that won't transfer to your machine. This file consolidates them so your Claude has the same context.

---

## Project-level facts

### Firebase project + Vercel

- **Firebase project ID:** `iesports-auth`
- **Firestore plan:** Blaze (paid) with 20K writes/day free tier
- **Vercel project name:** `iesports` (NOT `web` — there was an incident from creating the wrong project name during a manual `vercel --prod` run; treat the canonical project name as critical infrastructure)
- **Railway service name:** runs the Discord/Dota bot, auto-deploys from main branch pushes

### Firebase Admin SDK lazy initialization pattern

`web/lib/firebaseAdmin.ts` uses a Proxy-based lazy initializer because Next.js 16's "Collect page data" build step instantiates API routes in worker processes WITHOUT env vars. Eager Firebase init throws during that step and breaks the build.

The Proxy must:
1. Return the underlying Firestore instance lazily on first access
2. Bind `this` for method calls (otherwise Firestore's `_settingsFrozen` invariant throws on `.collection()`)
3. Implement `get`, `set`, `has`, `ownKeys`, `getOwnPropertyDescriptor` traps

Do not "simplify" this file. The shape is load-bearing.

### Vercel project linking gotcha

When relinking the Vercel project from a fresh checkout:
```bash
rm -rf .vercel
vercel link --project iesports --yes
```

NEVER run `vercel --prod --yes` without first linking — it creates a NEW project instead of using the existing one. This happened once and resulted in two parallel Vercel projects (one wired to the live domain, one not), with deploys going to the wrong one.

---

## Brand conventions

### Lowercase `iesports`, always

Every user-facing surface: page text, Discord embed footers, video text overlays, email subject lines, lobby names, WhatsApp messages. Sarthak swept these once already; new code must respect the convention from the start.

Examples of where this matters:
- Default Dota lobby name: `"iesports Lobby"` (in `bot/src/services/bot-lobby.ts`)
- Discord embed footer: `"iesports Tournament"` (NOT "IEsports Tournament")
- Email signatures, share-image overlays, anywhere the brand name appears

### No em-dashes or double-hyphens in prose written for Sarthak

He has a strong stylistic preference against `—` (em-dash) and `--` (double-hyphen) in sentences. Use commas, colons, parentheses, or split sentences instead.

Allowed:
- CLI flags: `--apply`, `--force` (these aren't prose)
- Compound words: `diff-suppress`, `cross-tournament` (hyphenated words are fine)

Not allowed:
- "We fixed the bug — it was wrong" → "We fixed the bug. It was wrong" or "We fixed the bug (it was wrong)"
- "X is great, but — and this matters — only if Y" → restructure

Applies to: PR descriptions, commit messages, code comments, UI copy, any prose you generate.

---

## Architecture: web ↔ bot message bus

The Next.js app and the Discord/Dota bot communicate via Firestore collections, not HTTP. The bot uses `onSnapshot` real-time listeners on these collections; the web side writes commands to them and watches for status updates.

### Collection roles

| Collection | Direction | Purpose |
|---|---|---|
| `botLobbyCommands/{id}` | web → bot | "Create/destroy/launch/invite for a Dota lobby". Doc fields: `{action, params, status: "pending" \| "processing" \| "done" \| "error"}` |
| `botLobbyControl/state` | bot → web | Single doc with live GC state, members, match_id, gameMode, etc. Updated by the bot's diff-suppressed heartbeat (1.5s tick, only writes on payload change with 5-min liveness floor) |
| `botDiscordCommands/{id}` | web → bot | Discord-side actions like `evacuate_vc` (move all users out of a voice channel) |
| `dotaResultJobs/{id}` | web → bot | "Fetch match result for this matchId via GC". Replaces the previous OpenDota/Steam API approach |
| `botQueues/{id}` | bidirectional | Per-match queue state. Includes `dotaMatchId` once the bot captures it from the GC |
| `whatsappOutbox/{id}` | web → external | Queue for WhatsApp messages |

### The GC reconnect / heartbeat fix

Earlier this year the bot was losing its Steam Game Coordinator connection silently. The fix: a keepalive heartbeat + auto-reconnect logic in `bot/src/services/dota-gc.ts`. If you ever see "Bot lobby unavailable" errors and the bot is online, check the GC connection status in `botLobbyControl/state` first.

### POSTGAME SO match-result capture

Valve denies `requestMatchDetails` with `result=15` for practice lobbies when the bot is in the "Unassigned" team. Workaround: parse the POSTGAME Shared Object (SO) directly from the CSODOTALobby state. The bot emits `matchComplete` when `state===3 && match_outcome>0`, with `liveLobbyMatchOutcome` and `liveLobbyHeroes` populated.

### CSODOTALobby proto field gotcha

The Dota Game Coordinator protocol stores lobby members at **field 120**, not field 2 (which an outdated schema doc claimed). State enum values are also non-obvious:
- `UI=0`
- `SERVERSETUP=1`
- `RUN=2`
- `POSTGAME=3` (not 4 as previously thought)
- `READYUP=4`
- `NOTREADY=5`
- `SERVERASSIGN=6`

If you ever touch `bot/src/services/dota-gc.ts`, verify against the current Steam GC proto definitions before changing field numbers.

---

## Firestore data shapes

### Dota 2 tournament (`tournaments/{id}`)

```ts
{
  name: string,
  description: string,
  game: "dota2",
  format: "round_robin" | "double_elimination" | ...,
  startDate, endDate, registrationDeadline,
  prizePool, entryFee, totalSlots, slotsBooked,
  matchesPerRound, swissRounds,
  bracketGenerated, bracketsComputed,
  isTestTournament?: boolean,
  visibleToUids?: string[],         // filter list endpoint
  discordChannelId?: string,        // per-tournament Discord routing
}

tournaments/{id}/matches/{matchId} {
  matchDay: number,
  team1Id, team2Id, team1Name, team2Name,
  team1Score, team2Score,           // match-level score (0/1/2 in BO2)
  scheduledTime: ISO string,
  status: "pending" | "in_progress" | "completed",
  isBracket: boolean,               // CRITICAL guard for Swiss logic
  winner: "team1" | "team2",
  game1MatchId, game2MatchId,
  dotaMatchId,                      // captured from GC
  vcStatus,                         // "waiting" | "started" | "cleanup"
  resultMessageId,                  // separate from operational discordOpsMessageIds
}

tournaments/{id}/teams/{teamId} {
  teamName, teamLogo, members: string[],
  captainUid, teamCode, status,
}
```

### Valorant tournament (`valorantTournaments/{id}`)

```ts
{
  name, format: "shuffle" | "auction" | "standard",
  bracketSize, bracketBestOf, eliminationBestOf, grandFinalBestOf,
  groupStageRounds, matchesPerRound,
  bracketGenerated, bracketsComputed, bracketTeamCount, ubTeamCount,
  playersSnapshot: ValorantSoloPlayer[],
  playersSnapshotUpdatedAt,
}

valorantTournaments/{id}/matches/{matchId} {
  team1Id, team2Id, team1Name, team2Name,
  team1Score, team2Score,           // maps won in BO2 (0/1/2)
  status, matchDay, matchIndex,
  isBracket, bracketType: "winners" | "losers" | "grand_final",
  bracketRound: number,
  scheduledTime, completedAt,

  // Per-game data (dual storage paths)
  game1: GameDoc,
  game2: GameDoc,
  games?: { game1?: GameDoc, game2?: GameDoc },  // legacy nested path
}

GameDoc {
  mapName: string,
  team1RoundsWon, team2RoundsWon,
  team1ValorantSide: "Red" | "Blue",       // color, NOT side label
  team2ValorantSide: "Red" | "Blue",
  roundResults: Array<{
    round: number,
    winTeam: "Blue" | "Red",
    winner: "team1" | "team2",             // direct, use this NOT winTeam
    endType: string,
  }>,
  playerStats: Array<{
    puuid, name, tag, team: "Blue" | "Red", agent,
    kills, deaths, assists, score,
    headshots, bodyshots, legshots,
    damageDealt, damageReceived,
    firstKills, firstDeaths,
    teamId, tournamentTeam: "team1" | "team2",
  }>,
  killMatrix: Record<string, ...>,
}
```

### Valorant team (`valorantTournaments/{id}/teams/{teamId}`)

```ts
{
  tournamentId, teamIndex, teamName, teamLogo,
  avgSkillLevel, totalSkillLevel,
  members: Array<{
    uid, riotGameName, riotTagLine, riotAvatar,
    riotRank, riotTier, iesportsRating, skillLevel,
    riotPuuid,                              // ← joins to playerStats.puuid
  }>,
}
```

### Valorant standings (`valorantTournaments/{id}/standings/{teamId}`)

```ts
{
  teamId, teamName,
  played, wins, draws, losses, points,
  mapsWon, mapsLost,
  roundsWon, roundsLost,
  buchholz,
}
```

---

## Critical sort consistency: Valorant playoff seeding

Three code paths compute the seed-to-team mapping. ALL THREE must use the same tiebreaker or the bracket seeds drift from the standings page.

**Canonical tiebreaker** (do not change without changing all three):

1. `points` desc
2. `(roundsWon - roundsLost)` desc
3. `(mapsWon - mapsLost)` desc
4. `wins` desc

**Code paths:**
1. `web/app/valorant/tournament/[id]/page.tsx` — standings table render
2. `web/app/api/valorant/generate-brackets/route.ts` — bracket generator
3. `web/scripts/dev-tools/resolveBracketPlaceholders.ts` — placeholder resolver

If you touch one, touch all three. If a live tournament's bracket shows a different seed-to-team mapping than its standings, run the resolver:
```bash
cd web
npx tsx scripts/dev-tools/resolveBracketPlaceholders.ts valorantTournaments <tournament-id>          # dry-run preview
npx tsx scripts/dev-tools/resolveBracketPlaceholders.ts valorantTournaments <tournament-id> --apply  # commit
```

---

## Critical guard: Swiss vs bracket matches

Any function that touches a match document and applies Swiss logic, standings recompute, or pairing logic must check `isBracket` first:

```ts
if (existingMatch.isBracket === true) return; // do not apply Swiss logic to bracket matches
```

Forgetting this caused real incidents because the Swiss `resolve-round` logic was firing on bracket matches that happened to share a `matchDay` value, corrupting bracket state.

The collision: Swiss rounds and bracket rounds both use `matchDay` to group matches by date. When bracket matches reused day numbers (e.g. `matchDay: 6` for the playoff weekend), the Swiss round-resolve function would scoop them up and apply Swiss tiebreakers, breaking the bracket.

Fix: every Swiss-touching function filters `where("isBracket", "!=", true)` or has the guard at the top.

---

## Valorant team detail page (built May 2026)

### File map

| File | Role |
|---|---|
| `web/lib/valorantTeamAnalytics.ts` | Pure-function library. No I/O. Computes team/player/map/side stats, generates insights, generates matchup advice. |
| `web/app/api/valorant/team-analytics/route.ts` | Only Firestore consumer. Four parallel reads (tournament + teams + matches + standings), calls computeTeamAnalytics for focal team + opponent. 60s revalidate. |
| `web/app/valorant/tournament/[id]/team/[teamId]/page.tsx` | Client component. Fetches API, renders. Pure presentation. |

### Data flow

1. Page fetches `/api/valorant/team-analytics?tournamentId=X&teamId=Y`
2. API reads `valorantTournaments/X` doc + 3 subcollections (`teams`, `matches`, `standings`)
3. API runs `computeTeamAnalytics(focalTeam, focalStanding, allMatches, allStandings)`
4. If `findUpcomingMatch` returns a match, API also computes the opponent's analytics and calls `generateMatchupAdvice(mine, opp, upcoming, oppMeta)`
5. After upcoming match is composed, API re-runs `generateTeamInsights(analytics)` so cross-map insights ("Their best map is your worst") can fire
6. API returns `{ tournament, analytics, teamLogos }`

### How to add a new insight

Edit `generateTeamInsights` in `web/lib/valorantTeamAnalytics.ts`. Each insight is a tagged JSON object:
```ts
{ id, kind: "strength" | "weakness" | "trend" | "neutral", headline, detail }
```

Gate each rule on a data-availability threshold (e.g. `if (a.rounds.pistol.played >= 4)`) so insights don't fire on weak data. No UI work needed — `InsightCard` in the page already styles all four `kind` values.

### Upgrading rule-based advice to LLM narrative

The current advice is rule-based for cost + speed (no per-page-view API call). To layer LLM-generated prose on top:

1. Add `ANTHROPIC_API_KEY` to Vercel env
2. In `team-analytics/route.ts`, after `computeTeamAnalytics`, optionally call Claude with the structured stats and ask for a 2-paragraph "Coach's narrative" + a 1-paragraph "How to prep for upcoming match"
3. Cache the response per `(teamId, latestMatchCompletedAt)` so we only re-call when new match data arrives. Store in `valorantTournaments/{id}/teamNarratives/{teamId}` with `generatedAt` + `matchSignature`
4. The page renders `analytics.narrative.coachNote` / `analytics.narrative.matchPrep` if present

Structured insights stay regardless — LLM is an additive layer, not a replacement.

### Pre-match drills fallback

When `upcoming === null` (team has no scheduled opponent), the page renders `PreMatchTipsPanel` instead of `UpcomingMatchPanel`. This panel generates drills directly from the team's own data:
- "Scrim {weakestMap}" if they have a losing map
- "Lock in your pistol exec" if pistol win rate < 50%
- "Trade-ready setups" if opening duels < 45%
- "Close out, do not coast" if first half is positive but second half collapses
- "Stabilize {playerName}" if ACS variance > 60

Captains always see prep-relevant content, even between rounds.

---

## Test tournament visibility model

Some tournaments are visible only to specific users (for testing without polluting the public list):

```ts
{
  isTestTournament: true,
  visibleToUids: ["discord_xxx", "phone_yyy"],
}
```

The tournament list endpoint (`web/app/api/tournaments/list/route.ts`) filters: a tournament shows up if it's NOT `isTestTournament` OR the requesting user's UID is in `visibleToUids`. Use this pattern when testing changes against real Firestore data without confusing other users.

Also: `discordChannelId` on a tournament routes per-tournament bot Discord messages to that channel instead of a global default.

---

## Dota match resolution paths

Three ways a Dota match can have its result captured:

1. **Auto via POSTGAME SO** (primary, current). Bot watches `CSODOTALobby.state === 3` (POSTGAME) and emits `matchComplete` event with `match_outcome` (1=Radiant win, 2=Dire win). Match-orchestrator maps team1/team2 → radiant/dire from member overlap, writes `status: "completed"` + `winner` + `dotaMatchId` to Firestore, posts result embed to tournament Discord channel.

2. **Manual via admin "🏆 Team X wins" button**. Backend: `web/app/api/admin/dota-manual-result/route.ts`. Recomputes standings inline.

3. **Match-reset via admin panel**. Backend: `web/app/api/admin/dota-match-reset/route.ts`. Modes: `soft` (clear scores, keep lobby) or `hard` (full reset including bot lobby).

**Per-player stats** require a `leagueid` registered at Steam dev portal (https://www.dota2.com/eventregistration). Without it, OpenDota/Stratz indexing won't pick up practice lobby matches.

**Landmine**: cleanup scripts that match Dota matchIds too broadly can wipe completed match data. The script `_cleanWrongMatchIds.ts` once wiped `status` + `winner` + `completedAt` on Domin8 r1-match-1/r1-match-2 because it matched on too-loose criteria. Always dry-run + narrow the query.

---

## Admin Dota ops flow

For operating a Dota tournament from the admin panel:

1. **set-lobby**: Creates the bot lobby with the right config. Posts lobby info to Discord. Creates waiting-room VC. Auto-invites Shrey Jain (steam32=`129122102`) per lobby admin policy.
2. **start**: Promotes the lobby to "match in progress". Creates team-named VCs (`🟢 TeamName1` / `🔴 TeamName2`). Evacuates stragglers from old VCs to "Dota 2 General" VC (`1475549366600073321`). Auto-fires `botLobbyCommands launch` so the lobby actually starts.
3. **cleanup-vcs**: After match ends. Enqueues `evacuate_vc` Discord commands to move all VC members back to "Dota 2 General". Waits ~3s. Then deletes the per-match VCs.

The "soft reset" endpoint only clears scores. The "hard reset" also destroys the bot lobby. Use soft for "wrong winner stamped"; hard for "match ID got polluted, restart from scratch".

`evacuate_vc` is a `botDiscordCommands` action — the bot's Discord.js client moves members, since the web side uses REST and REST has no bulk voice-state read.

---

## Dota leaderboard Impact score

The Dota tournament leaderboard uses a role-fair MVP formula instead of raw KDA, because carry roles inflate KDA artificially.

```
carryComponent  = (kills * 3) + (lastHits / 25) + (gpm / 75) + (heroDamage / 1500) + (towerDamage / 800)
supportComponent = (assists * 2.5) + (sentriesPlanted * 1.5) + (observersPlanted * 1.2) + (heroHealing / 800) + (stunDuration / 5)
Impact = max(carryComponent, supportComponent) + (win ? 10 : 0) - (deaths * 1.5)
```

This way support players who rack up assists + ward economy can score competitively with farming carries. Applied in `web/lib/dotaScoring.ts` (or similar).

**For active tournaments where Dota match data is unreliable** (e.g. per-player stats not coming through), the leaderboard tab is hidden via a `hideLeaderboard: true` flag on the tournament doc.

---

## YouTube/video tooling gotcha

`yt-dlp --download-sections` is unreliable for long YouTube VODs. For tournament clip extraction:

```bash
# Wrong (often fails or produces empty file)
yt-dlp --download-sections "*MM:SS-MM:SS" <url>

# Right (two-step: get stream URL, then ffmpeg seek-and-cut)
URL=$(yt-dlp -g <youtube-url>)
ffmpeg -ss MM:SS -to MM:SS -i "$URL" -c copy out.mp4
```

This came up during tournament-MVP-reel generation. `yt-dlp -g` returns the direct HLS/DASH stream URL; ffmpeg then handles the seek properly.

---

## Recent incident log (last 60 days)

| Date | Incident | Root cause | Fix |
|---|---|---|---|
| May 24 | Firestore write quota blown (~57K writes/day) | Bot heartbeat at 1.5s tick, unconditional write | Diff-suppression with 5-min liveness floor |
| May 22 | Valorant bracket showed wrong seeds | Three different tiebreaker sorts | Unified to `points → roundDiff → mapDiff → wins` |
| May 20 | Vercel auto-deploy silently failing | Firebase Admin SDK eager init crashing build workers | Lazy Proxy in `firebaseAdmin.ts` |
| May 18 | Two Vercel projects | Wrong `vercel --prod` without `vercel link` | Removed `web`, kept `iesports` |
| May 16 | Dota match results wouldn't fetch | Valve denying `requestMatchDetails` (result=15) | POSTGAME SO direct parsing |
| May 14 | Live lobby members always showing 0 | Proto schema had members at field 2, real proto = 120 | Updated schema |
| Earlier | Domin8 r1 match data wiped | Over-aggressive cleanup script | Restore from preserved scores |
| Earlier | iesportsbot stuck in "Back to Lobby" | Phantom lobby state on Valve side | Steam sign-out + DestroyLobby on first welcome |

---

## How to safely run a database-mutating script

Pattern every ad-hoc script should follow:

```ts
const APPLY = process.argv.includes("--apply");
const TID = "league-of-rising-stars-ascension";

// Safety: hard-code which collection + which tournament, never glob
const ref = db.collection("valorantTournaments").doc(TID);

// 1. Always dry-run first
console.log(`Mode: ${APPLY ? "APPLY" : "DRY-RUN"}`);

// 2. Iterate, print what would change
for (const item of items) {
  console.log(`  Would update: ${item.id}`);
  if (APPLY) await item.ref.set({ ... }, { merge: true });
}

console.log(APPLY ? "Applied." : "Dry-run only. Re-run with --apply.");
```

Run dry-run first. Visually inspect the output. ONLY then run with `--apply`.

For scripts that touch active tournaments, add an additional guard:
```ts
if (!TID.startsWith("test-") && !TID.includes("test") && !APPLY) {
  console.log("⚠️  This will touch a production tournament. Re-run with --apply to confirm.");
}
```

---

## How to interpret a Firestore write spike

If the Firebase usage dashboard shows a sudden write spike:

1. Check `bot-lobby.ts` first. The heartbeat is the #1 historical source of write floods.
2. Compute the back-of-envelope: `86400 / intervalSeconds = writes/day`. If a new periodic task was added at 1s intervals = 86,400 writes/day.
3. Check `match-orchestrator.ts` for any `setInterval` or polling loops
4. Check `bot/src/services/dota-results.ts` for the `windowPaddingHrs` value (default 24, was 6 — the longer window means more queue scans)
5. Check whether `recomputeDotaStandings` is being called more than once per match completion

The diagnostic script: `web/scripts/ad-hoc/_perTeamValueAnalysis.ts` shows what each team's current state is, useful for sanity-checking analytics changes.

---

## Quick reference: package.json / npm scripts

In `web/`:
```bash
npm run dev          # local dev server (Codespace forwards the port)
npm run build        # production build (Next.js compile, useful pre-PR sanity check)
npm run lint         # ESLint
npx tsc --noEmit     # type check without emitting files
```

The codebase uses `tsx` to run TypeScript scripts directly:
```bash
npx tsx scripts/dev-tools/listAllDotaTournaments.ts
```

---

## When in doubt

- Read `web/CLAUDE.md` for tech stack + conventions
- Read `ONBOARDING.md` (sister-specific intro + workflow)
- Read `docs/SAFETY_RULES.md` (strict do/don't)
- Ask Sarthak

The goal is to ship safe, useful changes. Speed is secondary to correctness.

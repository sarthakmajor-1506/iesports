# CS2 Event Runbook

> Written the morning after the Royal Sports League (31 Jul 2026), from what
> actually broke. Everything here was observed on a live event, not inferred.
> Read this before the next one.
>
> Companion docs: `CS2_TOURNAMENT_CONTEXT.md` (architecture, env vars, two-server
> setup), `CS2_LIVE_PIPELINE_PLAN.md` (how the pipeline was built).

---

## The one-line summary of that night

Twelve group matches were played and **not one result arrived automatically**.
All were entered by hand. The cause was not the webhook, which works: it was a
server silently refusing every match load, a plugin overriding our settings, and
three bugs of our own that made the symptoms unreadable.

Time was lost mostly to **misleading signals**, not hard problems. Optimise for
signals first.

---

## Pre-flight — the day before, not 30 minutes before

```bash
cd bot && npx tsx scripts/pingCS2Servers.ts
```
Checks connect, auth, and that MatchZy is actually loaded on every configured
server. A box that answers `status` without MatchZy accepts
`matchzy_loadmatch_url` and does nothing at all.

Then, in order:

1. **Play one real test match with two humans.** You cannot test this alone —
   MatchZy will not take a match live with an empty side, and `css_forcestart`
   skips the ready-up, not the empty-side check. A solo "force start" produces
   silence and proves nothing.
2. **Check the MatchZy version on every server** (`css_plugins list`). Versions
   must match. See "live.cfg" below for why this matters more than it looks.
3. **Finish the rosters.** Every player who will play must be registered with a
   linked Steam64 and on the right team. Run
   `web/scripts/setRoyalLeagueRosters.ts` (dry run) and resolve every ambiguity
   before the night, not during it.
4. **Confirm the Discord channel** the results will post to actually exists.
5. **Seed a test tournament** with two matches at MR2:
   `npx tsx scripts/dev-tools/seedCS2TestMatch.ts --p1=<uid> --p2=<uid> --rounds=2 --apply`
   Two matches, one per area, so both servers get exercised.

---

## Failure catalogue

Each entry: what you see → what it actually is → what to do.

### "The server keeps fetching the config but no results arrive"

**MatchZy is refusing the load.** It downloads the config *before* deciding it
cannot use it, so `cs2MatchConfigRequests` fills up and looks healthy. The RCON
reply says:

```
[MatchZy] [LoadMatchDataCommand] A match is already setup with id: -1,
cannot load a new match!
```

**Fix: End Match, then Load Match.** Always in that order, every time.

**How to confirm a load actually took:** the server switches to the planned map.
If the map doesn't change, the load was refused. (The bot now surfaces this as a
red error in the panel's command log rather than a green "done" — but that
depends on the Railway deploy being current.)

### "Round limit is wrong — it says first to 13 when we set MR16"

**MatchZy's `live.cfg` runs when the match goes live and overwrites the cvars we
sent in the match config.** On 0.8.5 the config cvars are applied *before*
`live.cfg`; on newer builds (0.8.68) they are re-applied one second *after* it
and stick. Same applies to `mp_freezetime` and `mp_friendlyfire`.

**Fix, in order of permanence:**
1. Edit `MatchZy/live.cfg` on the server (needs file access — this is the real
   reason to own the box).
2. Push the values from the admin panel's **Live Match Rules** *after* the match
   goes live. Every match, every time, on the old build.
3. Upgrade MatchZy so config cvars hold.

### "Everyone is getting kicked / only 2 players can connect"

**The whitelist.** `matchzy_whitelist_enabled_default true` restricts
connections to the Steam64s on that match's roster. With incomplete rosters,
that is nearly everyone — including players mid-game.

The match config now sends `false` unless the tournament sets
`enforceWhitelist: true`. Turn it back on only once rosters are verified; it is
real protection, it just needs correct data.

**`css_whitelist` is a TOGGLE, not a setter.** `css_whitelist 0` *flips* the
state — it turned the whitelist back ON while we were trying to turn it off.
Run it bare and read the reply (`Whitelist is now Disabled!`), or set the cvar.

### "Admin can't do .stay / .switch after the knife round"

**Not possible over RCON, by design.** MatchZy's `OnTeamStay` / `OnTeamSwitch`
both open with:

```csharp
if (player == null || !isSideSelectionPhase) return;
```

An RCON command has no calling player, so `css_stay` is a **silent no-op**. Only
the knife-winning team's players can end a knife round by typing it in chat. Any
player on that team can — no admin permission needed.

**Admin-side alternative:** decide sides *before* the load. The Load Match block
has a per-map side picker (`knife` / `team1_ct` / `team1_t`); the latter two skip
the knife entirely. Use it when a team is short or a slot is running late.

### "The site shows 0-0 for a live match"

Two of our own bugs, both fixed — but know the shape in case it recurs:

1. The match card's live branch rendered `team1Score`/`team2Score`, which are the
   **series** (maps) score. In a BO1 that's 0-0 until the match settles. Round
   score lives in `game1.team1RoundsWon`.
2. `/api/tournaments/detail` was CDN-cached `s-maxage=90, swr=600` — up to ten
   minutes stale. Now 5s whenever any match is live.

**A stale page is indistinguishable from a dead pipeline.** That's what sent the
investigation after the webhook for hours.

### "Did the result get recorded?"

Check the raw event log — every event is written to `cs2MatchzyEvents` *before*
any parsing, so if it isn't there, it never arrived:

```
cs2MatchzyEvents        every event received, raw
cs2MatchConfigRequests  every config fetch (proves MatchZy reached us)
cs2MatchzyIndex         matchzyMatchId → {tournamentId, matchId}
cs2ServerCommands       every RCON command + status/result/error
cs2ServerControl/state, /state2   live per-server state
```

The event sequence for a healthy match is `series_start` → `going_live` →
`round_end` ×N → `map_result` → `series_end`. Anything less and the match will
never settle on its own.

**The fallback always works:** admin panel → Tournament Ops → match → MANUAL
RESULT. It runs the identical settle cascade as the webhook (standings, bracket
seeding, Discord). A broken server never blocks the site.

---

## Verified facts about MatchZy / CS2 servers

- `matchid` must fit a **signed 32-bit int**. Epoch *seconds* fit; `Date.now()`
  milliseconds overflow, and MatchZy reports it only as "Match load failed!".
- `map_sides` must have **exactly one entry per map** in `maplist`, or the whole
  config is rejected.
- `spectators.players` is `{steam64: name}` — the only way for an admin, caster
  or watching player to join a whitelisted server.
- **CounterStrikeSharp cvars (`matchzy_*`) do not echo over RCON**; Valve cvars
  (`mp_*`) do. So you can read back `mp_maxrounds` to verify, but not
  `matchzy_remote_log_url`.
- CS2 `status` has no `map :` line — the map appears only in the SourceTV block
  as `Map "de_dust2"`.
- Both servers can post to the same webhook safely: events resolve through
  `cs2MatchzyIndex`, and ids are allocated uniquely per load.
- GOTV: server 1 on 27043, server 2 on 27022 (`tv_port`). A delayed stream, but
  it costs no player slot — the answer for spectators when the whitelist is on.
- Server 2 sent `player_death` / `player_hurt` / `round_start` events. Per-player
  stats are achievable when a server behaves.

---

## Format rules encoded in the platform

- **BO1 throughout**, length comes from the round limit: league MR16 (first to
  9), play-offs MR24 (first to 13).
- **Draws are real** — MR16 with no overtime makes 8-8 reachable. 3/1/0 points.
  Group stage only; a drawn play-off is rejected at the settle layer because
  nobody could advance.
- Three places must agree on best-of or the server and scoreboard drift apart:
  the tournament doc, the match doc's `maxRounds`, and both
  `api/cs2/match-config` and `lib/settleCS2Match` which read them.
- Semifinals seed **per group** as each group finishes, each slot guarded
  individually. (It was previously all-or-nothing with a single "already seeded"
  guard — filling one group first would have stranded the other on TBD forever.)
- Crossover: SF1 = A#1 vs B#2, SF2 = B#1 vs A#2.
- Tiebreakers: points → roundDiff → mapDiff → wins. **Two teams can still tie on
  all four** — it happened. Agree a rule (head-to-head, then a decider round)
  *before* the event.

---

## Scripts

**Web** (`cd web`)

| Script | Purpose |
|---|---|
| `scripts/setRoyalLeagueFormat.ts` | Force BO1 / MR16 / MR24 onto the live docs |
| `scripts/setRoyalLeagueRosters.ts` | Rebuild rosters from the WhatsApp lists; never guesses |
| `scripts/setCS2Spectators.ts` | Add/remove spectators (uid or bare Steam64) |
| `scripts/resetCS2Match.ts` | Clear a match stuck "live" with no series_end |
| `scripts/seedCS2Semifinals.ts` | Seed SF slots from whichever group has finished |
| `scripts/dev-tools/seedCS2TestMatch.ts` | Two MR2 smoke-test matches, one per area |

**Bot** (`cd bot`)

| Script | Purpose |
|---|---|
| `scripts/pingCS2Servers.ts` | Pre-flight: connect, auth, MatchZy loaded |
| `scripts/loadCS2Match.ts` | Break-glass RCON load when the bot can't reach a server |
| `scripts/createCS2TournamentChannel.ts` | Private Discord channel + route results to it |
| `scripts/cleanupVoiceChannels.ts` | Delete match voice channels after an event |

All are dry-run by default and need `--apply`.

---

## Discord

- CS2 results default to `RESULTS_CHANNEL_ID` — the **Valorant** channel. Set
  `discordChannelId` on the tournament to route them properly, or every
  announcement fails with `Unknown Channel (10003)` and nobody notices.
- The match-lobby flow creates a voice channel per team per match and never
  cleans up: one night left **42**. Sweep with `cleanupVoiceChannels.ts`.

---

## Own the server

The single biggest lever. On a friend's box you cannot edit `live.cfg`, upgrade
MatchZy, read the console, or restart — and every one of those was needed.

- Managed CS2 hosting in Mumbai runs ~₹300/month per server (two servers ≈ ₹600)
  with a file manager, console and version choice.
- A cloud VPS destroyed after each event is cheaper still (~₹250/month including
  a stored image) if provisioning is automated.
- Specs: 4 GB RAM and 2 fast cores per instance for 10 players, ~40 GB disk.

**Whatever you pick, put the server configs in this repo** — `live.cfg`,
`warmup.cfg`, `admins.json`, MatchZy version pinned. Setting `mp_maxrounds`,
`mp_freezetime` and `mp_friendlyfire` in `live.cfg` eliminates three of the
failures above outright.

---

## Rules of thumb

1. **Every silent success is a lie waiting to happen.** RCON succeeding is not
   the server obeying. Check the observable effect: did the map change, did the
   event arrive, did the cvar read back.
2. **Never trust a green tick from a fire-and-forget path.** The load-refused bug
   existed because a command returning exit-zero was reported as done.
3. **Prove each half separately.** Our webhook was provable in 30 seconds by
   POSTing a real payload at production. Doing that early would have saved hours
   of suspecting it.
4. **A stale cache looks exactly like a broken pipeline.** Anything rendering
   live data needs a cache measured in seconds.
5. **Rosters are infrastructure.** Half the night's chaos traces back to
   incomplete rosters meeting an enabled whitelist.

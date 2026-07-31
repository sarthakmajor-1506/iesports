# dev-tools/

Generic, reusable CLI utilities for debugging + ops. Survive across
tournaments and don't reference specific match/team/tournament IDs.

Run any of these with `npx tsx scripts/dev-tools/<name>.ts` from the
`web/` directory.

| Script | What it does |
|---|---|
| `botState.ts` | Dumps live `botLobbyControl/state` + recent `botLobbyCommands` + active `botQueues` |
| `currentMatchIds.ts` | Cross-tournament audit of which match docs hold which `dotaMatchId` |
| `dumpDotaLb.ts` | Dump leaderboard subcollection for a Dota tournament |
| `launchBotLobby.ts` | Fire a `launch` GC action via `botLobbyCommands` and report bot state after |
| `listAllDotaTournaments.ts` | Tournament inventory with status, dates, `discordChannelId` |
| `listCS2Tournaments.ts` | Same for CS2 tournaments |
| `listArchivedRegistrants.ts` | Read-only dump of a tournament's `archivedRegistrants` (people signed up before a registry wipe) with phone/Discord, for re-invite outreach. `--pending`, `--csv` |
| `pollOpenDota.ts` | Submit OpenDota parse jobs + poll for indexing (debugging match data availability) |
| `recomputeDotaStandings.ts` | CLI backstop for full standings rebuild (auto-recompute is wired into `lib/recomputeDotaStandings.ts` for runtime) |
| `resetAndRestartBot.ts` | Hard reset: destroy active lobby + close all stale queues + reinit bot state |
| `seedCS2TestMatch.ts --p1=<uid> --p2=<uid> [--tid=]` | Creates a throwaway 1v1 CS2 tournament + 2 one-player teams + 1 pending match, for smoke-testing the RCON/MatchZy pipeline without touching real tournament data |
| `softResetMatch.ts <tid> <mid>` | Soft reset one match's admin-side doc — bot lobby + VCs untouched |
| `testCreateLobby.ts` | End-to-end smoke test: enqueue a `create` botLobbyCommand and poll for result |
| `testGCFetch.ts` | Diagnose `requestMatchDetails` behavior — submits a known-good historical matchId to see if GC is responsive |
| `tryStratz.ts` | Probe STRATZ API for match availability (used to evaluate them as a fallback to GC) |
| `tryWebAPI.ts` | Probe Steam Web API `GetMatchDetails` access for a list of match IDs |
| `watchMatchId.ts` | Poll bot state + match doc fields every 4s to watch dotaMatchId capture in real time |
| `watchMatchLaunch.ts` | Watch lobby state transitions through UI → SERVERSETUP → RUN → POSTGAME |

All scripts require `web/.env.local` with Firebase Admin credentials.

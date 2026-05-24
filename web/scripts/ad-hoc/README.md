# ad-hoc/

One-off scripts written during live tournament incidents. Each is tied to
a specific tournament, match, or player and won't be useful as-is for
future ops.

**Kept (not deleted)** because:
- They document the exact incident response that was taken
- Re-reading them is faster than reconstructing from git log when a
  similar incident happens
- Some have unique data (player IDs, match IDs) worth referencing

**Don't reuse blindly.** Several contain hard-coded tournament/match IDs.
The `dev-tools/` versions are the generic equivalents you actually want
in most cases.

| Script | Incident |
|---|---|
| `_addTestMatches.ts` | Added 5 fresh matches to the Dota internal test tournament for re-testing the bot lobby flow |
| `_checkDiagnosticJob.ts` | Inspected a stuck `dotaResultJobs` doc during bot GC debugging |
| `_cleanWrongMatchIds.ts` | ⚠️ **LANDMINE** — over-aggressive, wiped `winner`/`status`/`completedAt` along with the intended `dotaMatchId`. See `_restoreDomin8Matches.ts` for the fix-up. Do NOT reuse without rewriting. |
| `_destroyAndCheck.ts` | Sent a `destroy` botLobbyCommand and verified state during R2M2 reset |
| `_dumpAllDomin8Matches.ts` | One-time audit of all Domin8 match states |
| `_dumpDomin8Standings.ts` | One-time audit of all Domin8 standings rows |
| `_findDota10kPrize.ts` | Found the Domin8 tournament that had a ₹10k prize pool (which user wanted zeroed) |
| `_findKilluminati.ts`, `_findKilluminati2.ts` | Locate Money/Kiluminati's user doc for the test tournament swap |
| `_findMajorAndMajorO.ts` | Locate Major's primary + secondary Steam accounts for the swap |
| `_findShrey.ts`, `_findMajorShrey.ts` | Locate Shrey (multiple users with that name) |
| `_inspectCS2Prelim.ts` | Inspect the CS2 Prelim tournament before shifting its dates |
| `_inspectDomin8R1M4.ts` | Audit the Domin8 r1-match-4 doc after auto-resolve fired |
| `_quickResetR1M1.ts` | Quick reset of Domin8 r1-match-1 mid-debugging |
| `_reattachMatchId.ts` | Re-stamp `dotaMatchId` on test r1-match-1 after an over-aggressive cleanup wiped it |
| `_resetAllTestMatches.ts` | Reset all 5 test matches at once |
| `_resetR2M2.ts` | Reset Domin8 r2-match-2 after iesportsbot dropped its lobby |
| `_restartTest.ts` | Restart test tournament cycle (destroy + reset r1-match-1) |
| `_restoreDomin8Matches.ts` | Re-stamp `status:completed` + `winner` on Domin8 r1-match-1 and r1-match-2 after `_cleanWrongMatchIds.ts` wiped them |
| `_swapBsingerForMoney.ts` | Replace Bsinger with Money on team-2 of the test tournament |
| `_testAccountSwaps.ts` | Combined Major→Major-O Steam swap + Vanshaj→Bsinger team swap |
| `_zeroDotaPrize.ts` | Set Domin8 tournament `prizePool` to 0 per request |

Other one-offs without `_` prefix (kept at `web/scripts/` root) document
earlier incidents from before this naming convention was used.

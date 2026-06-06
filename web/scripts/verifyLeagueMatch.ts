/**
 * Verify a Dota match is publicly fetchable via the league-tagged paths.
 *
 * The whole point of tagging bot lobbies with leagueid 19822 ("Domin8 League")
 * is to flip them from private practice lobbies (GC-only) into public league
 * matches that the Steam Web API + OpenDota will serve — which unlocks
 * per-player stats without the GC. This script checks both for a given match.
 *
 *   npx tsx scripts/verifyLeagueMatch.ts <dotaMatchId>
 *
 * Reads STEAM_API_KEY from web/.env.local.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

const matchId = process.argv[2];
if (!matchId) { console.error("usage: npx tsx scripts/verifyLeagueMatch.ts <dotaMatchId>"); process.exit(1); }
const KEY = process.env.STEAM_API_KEY || "";

async function steamWebApi() {
  console.log(`\n=== Steam Web API: GetMatchDetails(match_id=${matchId}) ===`);
  if (!KEY) { console.log("  ✗ no STEAM_API_KEY in .env.local — skipping"); return; }
  const url = `https://api.steampowered.com/IDOTA2Match_570/GetMatchDetails/v1/?key=${KEY}&match_id=${matchId}`;
  try {
    const r = await fetch(url);
    const j: any = await r.json();
    const res = j?.result;
    if (!res || res.error) { console.log(`  ✗ NOT available via Web API: ${res?.error || r.status} (still a private practice lobby)`); return; }
    console.log(`  ✓ AVAILABLE. leagueid=${res.leagueid}  duration=${Math.round((res.duration||0)/60)}m  radiant_win=${res.radiant_win}`);
    console.log(`  match was tagged to league: ${res.leagueid === 19822 ? "19822 ✓ (Domin8 League)" : res.leagueid || "0 (NOT league-tagged!)"}`);
    console.log("  per-player stats:");
    for (const p of (res.players || [])) {
      console.log(`    acct=${p.account_id ?? "anon"} hero=${p.hero_id} ${p.kills}/${p.deaths}/${p.assists} lh=${p.last_hits} gpm=${p.gold_per_min} xpm=${p.xp_per_min}`);
    }
  } catch (e: any) { console.log(`  ✗ request failed: ${e?.message || e}`); }
}

async function openDota() {
  console.log(`\n=== OpenDota: /api/matches/${matchId} ===`);
  try {
    const r = await fetch(`https://api.opendota.com/api/matches/${matchId}`);
    const j: any = await r.json();
    if (!j || j.error || !j.players) { console.log(`  ✗ not indexed yet by OpenDota (${j?.error || "no players"}) — can lag minutes/hours`); return; }
    console.log(`  ✓ indexed. leagueid=${j.leagueid}  duration=${Math.round((j.duration||0)/60)}m  radiant_win=${j.radiant_win}`);
    for (const p of j.players) console.log(`    ${p.personaname || p.account_id || "anon"} hero=${p.hero_id} ${p.kills}/${p.deaths}/${p.assists}`);
  } catch (e: any) { console.log(`  ✗ request failed: ${e?.message || e}`); }
}

(async () => {
  await steamWebApi();
  await openDota();
  console.log("\nNote: league matches can take a few minutes to appear after the game ends. Re-run if empty.");
  process.exit(0);
})();

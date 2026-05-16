/**
 * Find Domin8 Match 1's Dota match via caterpillar's OpenDota recent
 * matches, pull full details, and (with --apply) write all 10 players'
 * stats + result into tournaments/.../matches/r1-match-1.
 *
 * Winner (tournament): Toxic but Talented (team-2), per admin.
 * Read-only by default; --apply to write.
 */
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as dotenv from "dotenv"; import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });
if (!getApps().length) initializeApp({ credential: cert({
  projectId: process.env.FIREBASE_PROJECT_ID!, clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n") }) });

const TID = "domin8-ultimate-tilt-proof-tournament";
const CATERPILLAR_DISCORD = "364743440715612160"; // Kunal Saluja @caterpillar_
const APPLY = process.argv.includes("--apply");
const OD = "https://api.opendota.com/api";
const STEAM64_BASE = BigInt("76561197960265728");
const to32 = (id64?: string|null) => { try { return id64 ? (BigInt(id64)-STEAM64_BASE).toString() : null; } catch { return null; } };
const sleep = (ms:number)=>new Promise(r=>setTimeout(r,ms));

async function resolveMembers(db:FirebaseFirestore.Firestore, teamId:string, teamName:string) {
  const t = (await db.collection("tournaments").doc(TID).collection("teams").doc(teamId).get()).data();
  const out:any[] = [];
  for (const m of (t?.members||[]) as any[]) {
    let steamId:string|null = null, steamName:string|null = m.steamName||null, discordId:string = m.discordId||"";
    try { const u=(await db.collection("users").doc(m.uid).get()).data()||{}; steamId=u.steamId||null; steamName=steamName||u.steamName||null; discordId=discordId||u.discordId||""; } catch {}
    if (!steamId && typeof m.uid==="string" && m.uid.startsWith("steam_")) steamId=m.uid.slice(6);
    out.push({ uid:m.uid, name:m.fullName||steamName||m.uid, discordId, steam32:to32(steamId), teamId, teamName });
  }
  return out;
}

async function main() {
  const db = getFirestore();
  const team1 = await resolveMembers(db, "team-1", "10k ke Pohe");
  const team2 = await resolveMembers(db, "team-2", "Toxic but Talented");
  const roster = [...team1, ...team2];
  const rosterBy32 = new Map(roster.filter(p=>p.steam32).map(p=>[p.steam32, p]));
  const cat = roster.find(p=>p.discordId===CATERPILLAR_DISCORD);
  if (!cat?.steam32) { console.error("❌ caterpillar steam32 not resolvable"); process.exit(1); }
  console.log(`caterpillar = ${cat.name} steam32=${cat.steam32}`);

  const explicitId = (process.argv.find(a=>a.startsWith("--matchid="))||"").split("=")[1];
  let det:any;

  if (explicitId) {
    det = await (await fetch(`${OD}/matches/${explicitId}`)).json();
    if (!det?.match_id) { console.error(`❌ OpenDota has no match ${explicitId}`); process.exit(1); }
    const overlap = (det.players||[]).filter((p:any)=>rosterBy32.has(String(p.account_id))).length;
    console.log(`Explicit match ${explicitId}: rosterOverlap=${overlap}/10`);
    if (overlap < 6) console.log(`⚠️  Low overlap (${overlap}/10) — verify this is the right match.`);
  } else {
    // Scan ALL roster players' recent matches; find a match_id shared by many.
    const seen = new Map<string,{count:number; start:number}>();
    for (const rp of roster.filter(p=>p.steam32)) {
      try {
        const rms = await (await fetch(`${OD}/players/${rp.steam32}/recentMatches`)).json() as any[];
        await sleep(1100);
        for (const rm of (Array.isArray(rms)?rms.slice(0,10):[])) {
          const e = seen.get(String(rm.match_id)) || {count:0,start:rm.start_time};
          e.count++; seen.set(String(rm.match_id), e);
        }
      } catch {}
    }
    const ranked = [...seen.entries()].sort((a,b)=>b[1].count-a[1].count);
    console.log("Top shared matches across roster:");
    ranked.slice(0,5).forEach(([mid,e])=>console.log(`  ${mid}  inNplayers=${e.count}  start=${new Date(e.start*1000).toISOString()}`));
    const top = ranked[0];
    if (!top || top[1].count < 6) {
      console.error(`❌ No match shared by ≥6 roster players in any of their public OpenDota histories.`);
      console.error(`   The game likely has private match history / isn't indexed. Re-run with --matchid=<dota_match_id>.`);
      process.exit(1);
    }
    det = await (await fetch(`${OD}/matches/${top[0]}`)).json();
  }
  const matchId = String(det.match_id);
  const radiantWin = !!det.radiant_win;
  // Which side was each tournament team on (majority of resolved members)
  const sideCount = { team1:{r:0,d:0}, team2:{r:0,d:0} } as any;
  for (const p of det.players||[]) {
    const rp = rosterBy32.get(String(p.account_id)); if (!rp) continue;
    const isR = p.player_slot < 128;
    if (rp.teamId==="team-1") isR?sideCount.team1.r++:sideCount.team1.d++;
    else isR?sideCount.team2.r++:sideCount.team2.d++;
  }
  const team1Side = sideCount.team1.r>=sideCount.team1.d ? "radiant":"dire";
  const team2Side = team1Side==="radiant" ? "dire":"radiant";
  const odWinnerTeam = (radiantWin ? (team1Side==="radiant"?"team1":"team2") : (team1Side==="radiant"?"team2":"team1"));

  // hero id → name
  const heroes = await (await fetch(`${OD}/heroes`)).json() as any[];
  const heroName: Record<number,string> = {}; heroes.forEach(h=>heroName[h.id]=h.localized_name);

  const playerStats = roster.map(rp => {
    const p = (det.players||[]).find((x:any)=>String(x.account_id)===rp.steam32);
    return {
      uid: rp.uid, name: rp.name, teamId: rp.teamId, teamName: rp.teamName,
      side: p ? (p.player_slot<128?"radiant":"dire") : (rp.teamId==="team-1"?team1Side:team2Side),
      found: !!p,
      hero: p ? (heroName[p.hero_id]||`hero_${p.hero_id}`) : null,
      kills: p?.kills ?? null, deaths: p?.deaths ?? null, assists: p?.assists ?? null,
      gpm: p?.gold_per_min ?? null, xpm: p?.xp_per_min ?? null,
      lastHits: p?.last_hits ?? null, denies: p?.denies ?? null,
      netWorth: p?.net_worth ?? null, heroDamage: p?.hero_damage ?? null,
      towerDamage: p?.tower_damage ?? null, heroHealing: p?.hero_healing ?? null,
      level: p?.level ?? null,
      won: p ? ((p.player_slot<128) === radiantWin) : (rp.teamId==="team-2"),
    };
  });

  console.log(`\n=== Dota match ${matchId} ===`);
  console.log(`duration=${Math.round(det.duration/60)}m radiantWin=${radiantWin}  team1(10k ke Pohe)=${team1Side} team2(Toxic but Talented)=${team2Side}`);
  console.log(`OpenDota says winner = ${odWinnerTeam==="team2"?"Toxic but Talented":"10k ke Pohe"}  | admin said = Toxic but Talented (team-2)`);
  if (odWinnerTeam!=="team2") console.log(`⚠️  MISMATCH: OpenDota result differs from the admin-provided winner. Review before trusting.`);
  console.table(playerStats.map(s=>({name:s.name,team:s.teamName,side:s.side,hero:s.hero,K:s.kills,D:s.deaths,A:s.assists,gpm:s.gpm,nw:s.netWorth,won:s.won})));

  if (!APPLY) { console.log(`\n🟡 Read-only. Re-run with --apply to write to r1-match-1.`); return; }

  const mRef = db.collection("tournaments").doc(TID).collection("matches").doc("r1-match-1");
  const nowIso = new Date().toISOString();
  await mRef.set({
    status: "completed",
    team1Score: 0, team2Score: 1, winner: "team2",   // Toxic but Talented (admin-confirmed)
    completedAt: nowIso,
    dotaMatchId: matchId,
    result: {
      source: "opendota", dotaMatchId: matchId, radiantWin,
      durationSeconds: det.duration, team1Side, team2Side,
      openDotaWinnerTeam: odWinnerTeam, fetchedAt: nowIso,
    },
    games: { game1: { dotaMatchId: matchId, winner: "team2", durationSeconds: det.duration, completedAt: nowIso, status: "completed" } },
    playerStats,
  }, { merge: true });
  console.log(`\n✅ Wrote result + ${playerStats.length} player stats into r1-match-1 (winner: Toxic but Talented).`);
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)});

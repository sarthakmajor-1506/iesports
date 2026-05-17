/**
 * Generalized: find a tournament match's Dota game via an anchor player's
 * OpenDota recent matches, pull full details, derive the winner from
 * OpenDota (radiant_win + side mapping), and (with --apply) write the
 * result + all players' stats into the match doc.
 *
 * Usage:
 *   npx tsx scripts/fetchDotaMatchResult.ts --match=r1-match-2 --anchor=827178822847430677 [--winner=team1|team2] [--matchid=<dota>] [--apply]
 *   ( --anchor is the player's discordId or discordUsername; --winner overrides
 *     the OpenDota-derived winner if you need to force it )
 */
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as dotenv from "dotenv"; import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });
if (!getApps().length) initializeApp({ credential: cert({
  projectId: process.env.FIREBASE_PROJECT_ID!, clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n") }) });

const TID = "domin8-ultimate-tilt-proof-tournament";
const arg = (k:string) => (process.argv.find(a=>a.startsWith(`--${k}=`))||"").split("=")[1];
const MATCH = arg("match") || "r1-match-2";
const ANCHOR = arg("anchor") || "";
const FORCE_WINNER = arg("winner");          // optional "team1"|"team2"
const EXPLICIT = arg("matchid");             // optional dota match id
const APPLY = process.argv.includes("--apply");
const OD = "https://api.opendota.com/api";
const STEAM64_BASE = BigInt("76561197960265728");
const to32 = (id64?:string|null) => { try { return id64 ? (BigInt(id64)-STEAM64_BASE).toString() : null; } catch { return null; } };
const sleep = (ms:number)=>new Promise(r=>setTimeout(r,ms));

async function resolveMembers(db:FirebaseFirestore.Firestore, teamId:string) {
  const t = (await db.collection("tournaments").doc(TID).collection("teams").doc(teamId).get()).data();
  const out:any[] = [];
  for (const m of (t?.members||[]) as any[]) {
    let steamId:string|null=null, steamName:string|null=m.steamName||null, discordId:string=m.discordId||"", discordUsername:string=m.discordUsername||"";
    try { const u=(await db.collection("users").doc(m.uid).get()).data()||{}; steamId=u.steamId||null; steamName=steamName||u.steamName||null; discordId=discordId||u.discordId||""; discordUsername=discordUsername||u.discordUsername||""; } catch {}
    if (!steamId && typeof m.uid==="string" && m.uid.startsWith("steam_")) steamId=m.uid.slice(6);
    out.push({ uid:m.uid, name:m.fullName||steamName||m.uid, discordId, discordUsername, steam32:to32(steamId), teamId, teamName:t?.teamName });
  }
  return out;
}

async function main() {
  const db = getFirestore();
  const mRef = db.collection("tournaments").doc(TID).collection("matches").doc(MATCH);
  const md = (await mRef.get()).data();
  if (!md) { console.error(`❌ match ${MATCH} not found`); process.exit(1); }
  console.log(`Match ${MATCH}: ${md.team1Name}(${md.team1Id}) vs ${md.team2Name}(${md.team2Id})  status=${md.status}`);

  const t1 = await resolveMembers(db, md.team1Id);
  const t2 = await resolveMembers(db, md.team2Id);
  const roster = [...t1, ...t2];
  const by32 = new Map(roster.filter(p=>p.steam32).map(p=>[p.steam32,p]));
  const anchor = roster.find(p => p.discordId===ANCHOR || (p.discordUsername||"").toLowerCase()===ANCHOR.toLowerCase() || (p.name||"").toLowerCase().includes(ANCHOR.toLowerCase()));
  if (!anchor?.steam32 && !EXPLICIT) { console.error(`❌ anchor "${ANCHOR}" not resolvable to a steam id in this match's rosters`); process.exit(1); }
  if (anchor) console.log(`anchor = ${anchor.name} (${anchor.teamName}) steam32=${anchor.steam32}`);

  let det:any;
  if (EXPLICIT) {
    det = await (await fetch(`${OD}/matches/${EXPLICIT}`)).json();
    if (!det?.match_id) { console.error(`❌ no OpenDota match ${EXPLICIT}`); process.exit(1); }
  } else {
    const recent = await (await fetch(`${OD}/players/${anchor!.steam32}/recentMatches`)).json() as any[];
    if (!Array.isArray(recent)||!recent.length) { console.error(`❌ no public recent matches for anchor (profile private?)`); process.exit(1); }
    let best:any=null, bestOv=-1;
    for (const rm of recent.slice(0,8)) {
      const d = await (await fetch(`${OD}/matches/${rm.match_id}`)).json();
      await sleep(1100);
      const ov = (d.players||[]).filter((p:any)=>by32.has(String(p.account_id))).length;
      console.log(`  match ${rm.match_id} start=${new Date(rm.start_time*1000).toISOString()} overlap=${ov}/${roster.length}`);
      if (ov>bestOv) { bestOv=ov; best=d; }
    }
    if (bestOv < 6) { console.error(`❌ best overlap ${bestOv}/${roster.length} — not confidently this match. Re-run with --matchid=<id>.`); process.exit(1); }
    det = best;
  }

  const matchId = String(det.match_id);
  const radiantWin = !!det.radiant_win;
  const sc:any = { [md.team1Id]:{r:0,d:0}, [md.team2Id]:{r:0,d:0} };
  for (const p of det.players||[]) { const rp=by32.get(String(p.account_id)); if(!rp) continue; const isR=p.player_slot<128; (isR?sc[rp.teamId].r++:sc[rp.teamId].d++); }
  const team1Side = sc[md.team1Id].r >= sc[md.team1Id].d ? "radiant":"dire";
  const team2Side = team1Side==="radiant" ? "dire":"radiant";
  let winner = (radiantWin ? (team1Side==="radiant"?"team1":"team2") : (team1Side==="radiant"?"team2":"team1"));
  if (FORCE_WINNER==="team1"||FORCE_WINNER==="team2") { if (FORCE_WINNER!==winner) console.log(`⚠️  Overriding OpenDota winner (${winner}) with --winner=${FORCE_WINNER}`); winner=FORCE_WINNER; }

  const heroes = await (await fetch(`${OD}/heroes`)).json() as any[];
  const heroName:Record<number,string> = {}; heroes.forEach(h=>heroName[h.id]=h.localized_name);

  const playerStats = roster.map(rp => {
    const p = (det.players||[]).find((x:any)=>String(x.account_id)===rp.steam32);
    return { uid:rp.uid, name:rp.name, teamId:rp.teamId, teamName:rp.teamName,
      side: p?(p.player_slot<128?"radiant":"dire"):(rp.teamId===md.team1Id?team1Side:team2Side),
      found:!!p, hero:p?(heroName[p.hero_id]||`hero_${p.hero_id}`):null,
      kills:p?.kills??null, deaths:p?.deaths??null, assists:p?.assists??null,
      gpm:p?.gold_per_min??null, xpm:p?.xp_per_min??null, lastHits:p?.last_hits??null,
      denies:p?.denies??null, netWorth:p?.net_worth??null, heroDamage:p?.hero_damage??null,
      towerDamage:p?.tower_damage??null, heroHealing:p?.hero_healing??null, level:p?.level??null,
      won: p ? ((p.player_slot<128)===radiantWin) : (rp.teamId===(winner==="team1"?md.team1Id:md.team2Id)) };
  });

  console.log(`\n=== Dota match ${matchId} ===`);
  console.log(`duration=${Math.round(det.duration/60)}m radiantWin=${radiantWin} | ${md.team1Name}=${team1Side} ${md.team2Name}=${team2Side}`);
  console.log(`WINNER → ${winner==="team1"?md.team1Name:md.team2Name}${FORCE_WINNER?" (forced)":" (from OpenDota)"}`);
  console.table(playerStats.map(s=>({name:s.name,team:s.teamName,side:s.side,hero:s.hero,K:s.kills,D:s.deaths,A:s.assists,gpm:s.gpm,nw:s.netWorth,won:s.won})));

  if (!APPLY) { console.log(`\n🟡 Read-only. Re-run with --apply to write to ${MATCH}.`); return; }
  const nowIso = new Date().toISOString();
  await mRef.set({
    status:"completed",
    team1Score: winner==="team1"?1:0, team2Score: winner==="team2"?1:0, winner,
    completedAt: nowIso, dotaMatchId: matchId,
    result:{ source:"opendota", dotaMatchId:matchId, radiantWin, durationSeconds:det.duration, team1Side, team2Side, winnerTeam:winner, fetchedAt:nowIso },
    games:{ game1:{ dotaMatchId:matchId, winner, durationSeconds:det.duration, completedAt:nowIso, status:"completed" } },
    playerStats,
  }, { merge:true });
  console.log(`\n✅ Wrote result + ${playerStats.length} player stats into ${MATCH} (winner: ${winner==="team1"?md.team1Name:md.team2Name}).`);

  // Mirror to WhatsApp (best-effort) — whatsapp/ service delivers it.
  try {
    const winName = winner==="team1"?md.team1Name:md.team2Name;
    const loseName = winner==="team1"?md.team2Name:md.team1Name;
    await db.collection("whatsappOutbox").add({
      text:`🏆 *IEsports — Result*\n${md.team1Name} 🆚 ${md.team2Name}\nWinner: *${winName}* (def. ${loseName})\nScore: ${winner==="team1"?1:0}–${winner==="team2"?1:0} · Dota match ${matchId}`,
      status:"pending", source:"fetchDotaMatchResult",
      dedupeKey:`dota-${TID}-${MATCH}-${matchId}`, createdAt:new Date().toISOString(),
    });
    console.log("📲 WhatsApp result message queued.");
  } catch(e:any){ console.warn("WA enqueue failed:", e?.message||e); }
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)});

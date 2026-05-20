/**
 * Find the 2 Henrik match IDs for round3-match5 (Radiant vs Baby Boomers).
 * Strategy: use Sheeshu's puuid (he played both as Orcus's sub), pull last 20
 * matches, find the 2 most-recent customs where ≥4 Baby Boomers + ≥4 Radiant
 * roster (with Sheeshu in place of Orcus) appear together.
 */
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
if (!getApps().length) initializeApp({ credential: cert({ projectId: process.env.FIREBASE_PROJECT_ID, clientEmail: process.env.FIREBASE_CLIENT_EMAIL, privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n") }) });
const db = getFirestore();

const TID = "league-of-rising-stars-ascension";
const RADIANT = "team-10";
const BABY = "team-3";
const ORCUS_UID = "discord_741592452485480488";
const SHEESHU_UID = "discord_867791085644283934";

async function rosterPuuids(teamId: string, swap?: { fromUid: string; toUid: string }): Promise<{ puuids: Set<string>; debug: string[] }> {
  const t = (await db.collection("valorantTournaments").doc(TID).collection("teams").doc(teamId).get()).data() as any;
  const members = t.members || [];
  const out = new Set<string>();
  const dbg: string[] = [];
  for (const m of members) {
    const memUid = typeof m === "string" ? m : (m.uid || m.id);
    const useUid = swap && memUid === swap.fromUid ? swap.toUid : memUid;
    let puuid = m.riotPuuid;
    if (swap && memUid === swap.fromUid) puuid = null;
    if (!puuid) {
      const u = (await db.collection("users").doc(useUid).get()).data() as any;
      puuid = u?.riotPuuid;
    }
    if (puuid) out.add(puuid);
    dbg.push(`  · uid=${useUid}  puuid=${puuid || "MISSING"}${swap && memUid === swap.fromUid ? "  (sub)" : ""}`);
  }
  return { puuids: out, debug: dbg };
}

async function run() {
  const henrikKey = process.env.HENRIK_API_KEY;
  if (!henrikKey) throw new Error("HENRIK_API_KEY missing");

  const radiant = await rosterPuuids(RADIANT, { fromUid: ORCUS_UID, toUid: SHEESHU_UID });
  const baby = await rosterPuuids(BABY);

  console.log("Radiant Reapers (with Sheeshu sub for Orcus):");
  radiant.debug.forEach(d => console.log(d));
  console.log("\nBaby Boomers:");
  baby.debug.forEach(d => console.log(d));

  // Pull Sheeshu's recent match history
  const sheeshu = (await db.collection("users").doc(SHEESHU_UID).get()).data() as any;
  const seedPuuid = sheeshu.riotPuuid;
  console.log(`\nQuerying Henrik for puuid=${seedPuuid} (Sheeshu)...\n`);

  const url = `https://api.henrikdev.xyz/valorant/v4/by-puuid/matches/ap/pc/${seedPuuid}?size=20`;
  const res = await fetch(url, { headers: { Authorization: henrikKey } });
  if (!res.ok) throw new Error(`Henrik v4 status ${res.status}: ${await res.text()}`);
  const j = await res.json();
  const data = j.data || [];
  console.log(`Got ${data.length} matches in Sheeshu's history.\n`);

  for (const md of data) {
    const startedAt = md?.metadata?.started_at || md?.metadata?.game_start;
    const matchId = md?.metadata?.match_id || md?.metadata?.matchid;
    const map = md?.metadata?.map?.name || md?.metadata?.map || "?";
    const mode = md?.metadata?.queue?.name || md?.metadata?.mode || "?";
    const players: any[] = md?.players?.all_players || md?.players || [];
    let r = 0, b = 0;
    for (const p of players) {
      if (radiant.puuids.has(p?.puuid)) r++;
      if (baby.puuids.has(p?.puuid)) b++;
    }
    const flag = r >= 4 && b >= 4 ? "  ✅ MATCH" : "";
    console.log(`  ${startedAt}  ${map}  ${mode}  Radiant=${r}/5  Baby=${b}/5  matchId=${matchId}${flag}`);
  }
  process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });

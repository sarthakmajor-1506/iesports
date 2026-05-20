/**
 * Find every match doc in Ascension where Orcus or Sheeshu's UID appears,
 * and dump the team rosters for Radiant Reapers + Choot K Chooze regardless
 * of whether they're matched up yet.
 */
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}
const db = getFirestore();
const TID = "league-of-rising-stars-ascension";
const ORCUS = "discord_741592452485480488";
const SHEESHU = "discord_867791085644283934";

async function run() {
  const tRef = db.collection("valorantTournaments").doc(TID);

  // 1. Find Orcus's team(s) via soloPlayers (he registered there)
  console.log("─── Orcus + Sheeshu solo registration ───");
  for (const uid of [ORCUS, SHEESHU]) {
    const sp = await tRef.collection("soloPlayers").doc(uid).get();
    if (sp.exists) {
      const d = sp.data() || {};
      console.log(`  ${uid}  teamId=${d.teamId || "?"}  teamName=${d.teamName || "?"}  bracket=${d.bracket || "?"}  riot=${d.riotGameName || "?"}`);
    } else {
      console.log(`  ${uid}  NOT in soloPlayers`);
    }
  }
  console.log();

  // 2. List ALL valorantTeams for this tournament
  console.log("─── Teams in tournament ───");
  const teamsSnap = await db.collection("valorantTeams")
    .where("tournamentId", "==", TID)
    .get();
  console.log(`  ${teamsSnap.size} team(s) total`);
  let radiantId: string | null = null, chootId: string | null = null;
  for (const t of teamsSnap.docs) {
    const d = t.data();
    const name = d.name || d.teamName || "";
    if (/radiant.*reaper/i.test(name)) radiantId = t.id;
    if (/choot.*chooze/i.test(name)) chootId = t.id;
  }
  console.log(`  radiantId=${radiantId}  chootId=${chootId}\n`);

  // 3. Dump rosters for those two teams
  for (const tid of [radiantId, chootId].filter(Boolean) as string[]) {
    const t = (await db.collection("valorantTeams").doc(tid).get()).data() || {};
    console.log(`──── ${t.name || t.teamName} (${tid}) ────`);
    const members = t.members || t.players || [];
    for (const mem of members) {
      const memUid = typeof mem === "string" ? mem : (mem.uid || mem.id);
      const u = (await db.collection("users").doc(memUid).get()).data() || {};
      const display = u.fullName || u.discordUsername || u.steamName || u.riotGameName || memUid;
      const flag = memUid === ORCUS ? "  ← ORCUS" : memUid === SHEESHU ? "  ← SHEESHU" : "";
      console.log(`  · ${display}  uid=${memUid}  riot=${u.riotGameName || "-"}#${u.riotTagLine || "-"}  puuid=${u.riotPuuid || "?"}${flag}`);
    }
    console.log();
  }

  // 4. Find ANY match where Orcus's team appears, even with TBD opponent
  if (radiantId || chootId) {
    console.log("─── Matches involving Radiant or Choot ───");
    const matchesSnap = await tRef.collection("matches").get();
    for (const m of matchesSnap.docs) {
      const d = m.data() as any;
      const t1 = d.team1Id, t2 = d.team2Id;
      if ([t1, t2].some(x => x === radiantId || x === chootId)) {
        console.log(`  [${m.id}]  ${d.team1Name} (${t1})  vs  ${d.team2Name} (${t2})  status=${d.status}  scores=${d.team1Score ?? "?"}-${d.team2Score ?? "?"}  riotMatchIds=${JSON.stringify(d.riotMatchIds || [])}`);
      }
    }
  }

  process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });

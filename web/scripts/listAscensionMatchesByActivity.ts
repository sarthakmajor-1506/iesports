import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
if (!getApps().length) initializeApp({ credential: cert({ projectId: process.env.FIREBASE_PROJECT_ID, clientEmail: process.env.FIREBASE_CLIENT_EMAIL, privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n") }) });
const db = getFirestore();
const TID = "league-of-rising-stars-ascension";

async function run() {
  const tRef = db.collection("valorantTournaments").doc(TID);

  // Dump every match — id, team names + IDs, status, when started
  const matchesSnap = await tRef.collection("matches").get();
  const rows = matchesSnap.docs.map(d => {
    const x = d.data() as any;
    return {
      id: d.id,
      t1: x.team1Name,
      t1id: x.team1Id,
      t2: x.team2Name,
      t2id: x.team2Id,
      status: x.status || "(none)",
      score: `${x.team1Score ?? "-"}-${x.team2Score ?? "-"}`,
      lobbySetAt: x.lobbySetAt || x.startedAt || x.completedAt || x.createdAt,
      hasG1: !!x.game1,
      hasG2: !!x.game2,
    };
  });
  rows.sort((a, b) => String(b.lobbySetAt).localeCompare(String(a.lobbySetAt)));

  console.log("All matches sorted by most recent activity:\n");
  for (const r of rows) {
    console.log(`  [${r.id}]  ${r.t1}(${r.t1id}) vs ${r.t2}(${r.t2id})  status=${r.status}  score=${r.score}  g1=${r.hasG1} g2=${r.hasG2}  ts=${r.lobbySetAt}`);
  }

  // Also list Radiant Reapers' (team-10) and Choot's team docs
  console.log("\n──── Teams subcollection ────");
  const teamsSnap = await tRef.collection("teams").get();
  for (const t of teamsSnap.docs) {
    const d = t.data();
    if (/radiant|choot/i.test(d.name || d.teamName || "")) {
      console.log(`  [${t.id}]  ${d.name || d.teamName}`);
      const members = d.members || d.players || [];
      for (const m of members) {
        const memUid = typeof m === "string" ? m : (m.uid || m.id);
        const u = (await db.collection("users").doc(memUid).get()).data() || {};
        const name = u.fullName || u.discordUsername || u.steamName || u.riotGameName || memUid;
        console.log(`    · ${name}  uid=${memUid}  riot=${u.riotGameName || "-"}#${u.riotTagLine || "-"}`);
      }
    }
  }

  process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });

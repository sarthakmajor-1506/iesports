import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as dotenv from "dotenv"; import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });
if (!getApps().length) initializeApp({ credential: cert({
  projectId: process.env.FIREBASE_PROJECT_ID!, clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n") }) });
const TID = "domin8-ultimate-tilt-proof-tournament";
const QPREFIX = `tournament_${TID}_r1-match-1`;
(async () => {
  const db = getFirestore();
  console.log("=== current match r1-match-1 ===");
  const m = (await db.collection("tournaments").doc(TID).collection("matches").doc("r1-match-1").get()).data();
  console.log(JSON.stringify({ team1Name:m?.team1Name, team2Name:m?.team2Name, status:m?.status, team1Score:m?.team1Score, team2Score:m?.team2Score, bestOf:m?.bestOf, games:m?.games, dotaMatchId:m?.dotaMatchId, winner:m?.winner }, null, 2));

  console.log("\n=== botQueues for this match ===");
  const qs = await db.collection("botQueues").get();
  qs.forEach(q => { if (q.id.startsWith(QPREFIX)) console.log(`  ${q.id}: status=${q.data().status}`); });

  console.log("\n=== botLobbies (recent, all) ===");
  const lobs = await db.collection("botLobbies").orderBy("createdAt","desc").limit(8).get();
  lobs.forEach(d => { const x=d.data();
    console.log(`  ${d.id}: queueId=${x.queueId} status=${x.status} dotaMatchId=${x.dotaMatchId} winner=${x.winner} created=${x.createdAt} completed=${x.completedAt}`);
    if (String(x.queueId||"").startsWith(QPREFIX)) {
      console.log(`     ↳ MATCHES THIS GAME. mvp=${JSON.stringify(x.mvp)} duration=${x.duration} radiant=${(x.radiant||[]).map((p:any)=>p.steamName||p.username).join(",")} dire=${(x.dire||[]).map((p:any)=>p.steamName||p.username).join(",")}`);
      if (x.playerStats) console.log(`     playerStats: ${JSON.stringify(x.playerStats).slice(0,500)}`);
    }
  });
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)});

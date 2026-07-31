import { initializeApp, cert, getApps, getApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as dotenv from "dotenv"; import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });
if (!getApps().length) initializeApp({ credential: cert({
  projectId: process.env.FIREBASE_PROJECT_ID!, clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\n/g, "\n") })});
const db = getFirestore(getApp());
const TID = "cs2-royal-sports-league";
(async () => {
  const tref = db.collection("cs2Tournaments").doc(TID);
  const sp = await tref.collection("soloPlayers").get();
  const users = await db.collection("users").get();
  const umap = new Map(users.docs.map(d => [d.id, d.data() as any]));

  console.log(`=== REGISTERED (soloPlayers): ${sp.size} ===`);
  const rows = sp.docs.map(d => {
    const p: any = d.data(); const u: any = umap.get(d.id) || {};
    return { uid: d.id, steam: p.steamName || u.steamName || "", discord: u.discordUsername || "", full: u.fullName || "", steamId: p.steamId || u.steamId || "" };
  }).sort((a,b) => (a.full||a.discord||a.steam).localeCompare(b.full||b.discord||b.steam));
  rows.forEach(r => console.log(`  ${r.uid.padEnd(30)} full="${r.full}" discord="${r.discord}" steam="${r.steam}" ${r.steamId ? "" : "!!NO-STEAM"}`));

  const teams = await tref.collection("teams").get();
  console.log(`\n=== CURRENT TEAMS ===`);
  teams.docs.sort((a,b)=>a.id.localeCompare(b.id)).forEach(d => {
    const t: any = d.data();
    console.log(`${d.id} ${t.slot||""} ${t.teamName} (group ${t.groupId}) — ${t.members?.length||0} members`);
    (t.members||[]).forEach((m: any) => {
      const u: any = umap.get(m.uid) || {};
      console.log(`    ${m.uid.padEnd(30)} steam="${m.steamName}" full="${u.fullName||""}" discord="${u.discordUsername||""}"`);
    });
  });
  process.exit(0);
})();

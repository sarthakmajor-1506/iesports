/**
 * Find any matches between Radiant Reapers and Choot K Chooze in Ascension,
 * and dump their roster + match state so we can plan the sub fix.
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

function isRadiant(s: string) { return /radiant.*reaper/i.test(s || ""); }
function isChoot(s: string)   { return /choot.*chooze/i.test(s || ""); }

async function run() {
  const tRef = db.collection("valorantTournaments").doc(TID);
  const matchesSnap = await tRef.collection("matches").get();

  const matches = matchesSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

  const hits = matches.filter(m => {
    const a = m.team1Name || m.team1?.name || "";
    const b = m.team2Name || m.team2?.name || "";
    return (isRadiant(a) && isChoot(b)) || (isRadiant(b) && isChoot(a));
  });

  console.log(`Found ${hits.length} match(es) between Radiant Reapers and Choot K Chooze:\n`);
  for (const m of hits) {
    console.log(`──── ${m.id} ────`);
    console.log(`status: ${m.status}  isBracket: ${m.isBracket}  bestOf: ${m.bestOf || m.bracketBestOf}`);
    console.log(`team1: ${m.team1Name} (${m.team1Id})`);
    console.log(`team2: ${m.team2Name} (${m.team2Id})`);
    console.log(`scores: ${m.team1Score ?? "?"} - ${m.team2Score ?? "?"}`);
    console.log(`scheduledFor: ${m.scheduledFor || m.scheduledAt || "?"}`);
    console.log(`riotMatchIds: ${JSON.stringify(m.riotMatchIds || m.matchIds || [])}`);
    if (m.games) console.log(`games keys: ${Object.keys(m.games).join(", ")}`);
    if (m.game1) console.log(`game1: ${JSON.stringify({ map: m.game1.map, score1: m.game1.team1Score, score2: m.game1.team2Score, status: m.game1.status }, null, 0)}`);
    if (m.game2) console.log(`game2: ${JSON.stringify({ map: m.game2.map, score1: m.game2.team1Score, score2: m.game2.team2Score, status: m.game2.status }, null, 0)}`);
    if (m.substitutions) console.log(`substitutions: ${JSON.stringify(m.substitutions)}`);
    console.log();
  }

  // Look up the two team rosters
  const teamIds = new Set<string>();
  hits.forEach(m => { if (m.team1Id) teamIds.add(m.team1Id); if (m.team2Id) teamIds.add(m.team2Id); });
  for (const tid of teamIds) {
    const teamSnap = await db.collection("valorantTeams").doc(tid).get();
    if (!teamSnap.exists) {
      console.log(`team ${tid} NOT FOUND in valorantTeams`);
      continue;
    }
    const t = teamSnap.data() || {};
    console.log(`──── team ${tid} (${t.name || t.teamName}) ────`);
    const members = t.members || t.players || [];
    for (const mem of members) {
      const memUid = mem.uid || mem.id || mem;
      const userSnap = await db.collection("users").doc(memUid).get();
      const u = userSnap.data() || {};
      const display = u.fullName || u.discordUsername || u.steamName || u.riotGameName || memUid;
      const riot = u.riotGameName ? `${u.riotGameName}#${u.riotTagLine}` : "(no riot)";
      console.log(`  · ${display}  uid=${memUid}  riot=${riot}  puuid=${u.riotPuuid || "?"}`);
    }
    console.log();
  }

  // Search for Orcus and Sheeshu specifically (by riot name or display name)
  console.log("──── searching for Orcus / Sheeshu in users ────");
  const usersSnap = await db.collection("users")
    .where("riotGameName", ">=", "")
    .limit(2000)
    .get();
  for (const u of usersSnap.docs) {
    const d = u.data();
    const name = (d.riotGameName || "") + " " + (d.fullName || "") + " " + (d.discordUsername || "") + " " + (d.steamName || "");
    if (/orcus/i.test(name) || /sheesh/i.test(name)) {
      console.log(`  uid=${u.id}  riot=${d.riotGameName || "-"}#${d.tagLine || d.riotTagLine || "-"}  full=${d.fullName || "-"}  discord=${d.discordUsername || "-"}  puuid=${d.riotPuuid || "-"}`);
    }
  }

  process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });

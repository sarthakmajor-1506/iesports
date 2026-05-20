/**
 * Who voted on every "warning" entry in the Ascension Wall of Shame?
 *
 * Walks `valorantTournaments/league-of-rising-stars-ascension/wallOfShame`,
 * filters entries where type === "warning", then for each warning loads the
 * `votes` subcollection and tallies which uids voted across all of them.
 *
 * Run: npx tsx scripts/inspectAscensionWarningVoters.ts
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

async function run() {
  const wallSnap = await db
    .collection("valorantTournaments")
    .doc(TID)
    .collection("wallOfShame")
    .get();

  const warnings = wallSnap.docs.filter(d => {
    const data = d.data();
    return data.type === "warning" && data.archived !== true;
  });

  console.log(`Found ${warnings.length} active warning entries:\n`);
  warnings.forEach((w, i) => {
    const d = w.data();
    console.log(`  ${i + 1}. [${w.id}] ${d.playerName} — ${d.reason} (🍅 ${d.tomatoCount || 0} / 🏃 ${d.bailCount || 0})`);
  });
  console.log();

  // uid -> { tomatoOn: Set<entryId>, bailOn: Set<entryId> }
  const voters: Record<string, { tomato: string[]; bail: string[] }> = {};

  for (const w of warnings) {
    const votesSnap = await w.ref.collection("votes").get();
    for (const v of votesSnap.docs) {
      const uid = v.id;
      const kind = v.data().kind;
      if (!voters[uid]) voters[uid] = { tomato: [], bail: [] };
      if (kind === "tomato") voters[uid].tomato.push(w.id);
      else if (kind === "bail") voters[uid].bail.push(w.id);
    }
  }

  // Resolve uid -> display name (from users collection)
  const uids = Object.keys(voters);
  const userDocs = await Promise.all(uids.map(u => db.collection("users").doc(u).get()));
  const nameOf: Record<string, string> = {};
  userDocs.forEach(snap => {
    if (snap.exists) {
      const u = snap.data() || {};
      nameOf[snap.id] = u.fullName || u.discordUsername || u.steamName || u.riotGameName || snap.id;
    } else {
      nameOf[snap.id] = snap.id;
    }
  });

  // Map entryId -> shamed player's name for readability.
  const targetOf: Record<string, string> = {};
  warnings.forEach(w => {
    targetOf[w.id] = (w.data().playerName || w.id).trim();
  });

  const all = uids
    .map(uid => ({ uid, total: voters[uid].tomato.length + voters[uid].bail.length }))
    .sort((a, b) => b.total - a.total);

  console.log(`=== Per-voter breakdown (${all.length} voter(s)) ===\n`);
  for (const { uid, total } of all) {
    const v = voters[uid];
    console.log(`${nameOf[uid]}  (${total}/${warnings.length} votes)`);
    if (v.tomato.length) {
      console.log(`  🍅 threw at: ${v.tomato.map(id => targetOf[id]).join(", ")}`);
    }
    if (v.bail.length) {
      console.log(`  🏃 bailed on: ${v.bail.map(id => targetOf[id]).join(", ")}`);
    }
    console.log();
  }

  process.exit(0);
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});

import { config } from "dotenv";
config({ path: "/Users/sjain/Documents/iesports/iesports/web/.env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) initializeApp({ credential: cert({
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
})});
const db = getFirestore();
const TID = "dota-test-major-shrey";

async function deleteCollection(colRef: FirebaseFirestore.CollectionReference) {
  const snap = await colRef.get();
  if (snap.empty) return 0;
  let batch = db.batch();
  let count = 0;
  for (const doc of snap.docs) {
    batch.delete(doc.ref);
    count++;
    if (count % 450 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  await batch.commit();
  return count;
}

(async () => {
  const tref = db.collection("tournaments").doc(TID);
  const t = await tref.get();
  if (!t.exists) {
    console.log("Tournament not found, nothing to delete.");
    process.exit(0);
  }
  console.log(`Deleting tournament: ${(t.data() as any).name}`);

  for (const sub of ["teams", "matches", "standings", "soloPlayers", "brackets"]) {
    const n = await deleteCollection(tref.collection(sub));
    if (n > 0) console.log(`  deleted ${n} docs from ${sub}`);
  }

  await tref.delete();
  console.log("Tournament doc deleted.");
})();

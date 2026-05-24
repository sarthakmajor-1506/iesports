import { config } from "dotenv";
config({ path: "/Users/sjain/Documents/iesports/iesports/web/.env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  initializeApp({ credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  })});
}
const db = getFirestore();
(async () => {
  // 1) Major's current user doc
  const majorUid = "discord_1302366375263735808";
  const majorDoc = await db.collection("users").doc(majorUid).get();
  console.log("=== Major's current user doc ===");
  console.log(JSON.stringify(majorDoc.data(), null, 2));

  // 2) Search all users for anything matching "Major O" / "MajorO" / "Major_O"
  console.log("\n=== Search for Major O variants ===");
  const allSnap = await db.collection("users").get();
  let found = 0;
  for (const d of allSnap.docs) {
    const u: any = d.data();
    const blob = JSON.stringify(u).toLowerCase();
    if (blob.includes("major o") || blob.includes("majoro") || blob.includes("major_o") || blob.includes("major.o")) {
      console.log(`\nUID: ${d.id}`);
      console.log(`  fullName: ${u.fullName}`);
      console.log(`  steamName: ${u.steamName}`);
      console.log(`  steamId: ${u.steamId}`);
      console.log(`  discordUsername: ${u.discordUsername}`);
      console.log(`  discordId: ${u.discordId}`);
      found++;
    }
  }
  if (!found) console.log("(no matches found across all users)");
  console.log(`\nTotal users scanned: ${allSnap.size}`);
})().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

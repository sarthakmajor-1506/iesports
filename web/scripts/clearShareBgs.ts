import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
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

async function clearShareBgs() {
  const db = getFirestore();

  // List all valorant tournaments to find the right one
  const all = await db.collection("valorantTournaments").get();
  console.log(`Total valorant tournaments: ${all.size}\n`);

  for (const d of all.docs) {
    const data = d.data();
    const name = data.name || "(no name)";
    const hasBgs = data.shareImages && (data.shareImages.defaultBg || data.shareImages.overviewBg || data.shareImages.registerBg);
    console.log(`  ${d.id} → "${name}"${hasBgs ? " [HAS BG IMAGES]" : ""}`);
    if (data.shareImages) {
      console.log(`    shareImages: ${JSON.stringify(data.shareImages)}`);
    }
  }

  // Find and clear the Ascension tournament
  for (const d of all.docs) {
    const data = d.data();
    const name = (data.name || "").toLowerCase();
    if (name.includes("ascension")) {
      console.log(`\n🎯 Clearing bg fields for: "${data.name}" (${d.id})`);
      await d.ref.update({
        "shareImages.defaultBg": FieldValue.delete(),
        "shareImages.overviewBg": FieldValue.delete(),
        "shareImages.registerBg": FieldValue.delete(),
        "shareImages.teamsBg": FieldValue.delete(),
        "shareImages.scheduleBg": FieldValue.delete(),
        "shareImages.formatBg": FieldValue.delete(),
      });
      console.log(`✅ Done — all bg fields cleared`);
    }
  }

  process.exit(0);
}

clearShareBgs().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

const db = getFirestore();
db.collection("discordVoicePanels").doc("main").get().then((snap) => {
  if (!snap.exists) {
    console.log("❌ No `discordVoicePanels/main` doc — Voice Panel is in SETUP state.");
    console.log("   → Click 'Create Channel' to flip to LIVE state.");
  } else {
    console.log("✅ Panel doc exists:");
    console.log(JSON.stringify(snap.data(), null, 2));
  }
  process.exit(0);
});

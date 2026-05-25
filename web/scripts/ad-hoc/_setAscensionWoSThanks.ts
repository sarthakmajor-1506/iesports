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
  await db.collection("valorantTournaments").doc("league-of-rising-stars-ascension").set({
    wallOfShameMode: "thanks",
    wallOfShameThanksMessage:
      "Massive thank you to everyone who showed up on time this week, supported tournament staff, " +
      "helped fellow players, and kept the community vibe positive.\n\n" +
      "It's because of you that we can run these tournaments smoothly. We see you, we appreciate you " +
      "— and the Wall is quiet this week because you've earned it.\n\n" +
      "See you in the next match. 🎯",
  }, { merge: true });
  console.log("✓ Ascension.wallOfShameMode = 'thanks' (last week's shame entries hidden, thank-you panel shown)");
})().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

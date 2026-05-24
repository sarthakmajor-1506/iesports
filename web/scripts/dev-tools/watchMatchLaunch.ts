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
const TID = "dota-test-major-shrey";
const stateNames: Record<number, string> = {
  [-1]: "NONE", 0: "UI", 1: "READYUP", 2: "SERVERSETUP",
  3: "RUN", 4: "POSTGAME", 5: "NOTREADY", 6: "SERVERASSIGN",
};
(async () => {
  let last = "";
  for (let i = 0; i < 30; i++) {
    const s = (await db.collection("botLobbyControl").doc("state").get()).data() as any;
    const m = (await db.collection("tournaments").doc(TID).collection("matches").doc("r1-match-1").get()).data() as any;
    const cur = `[${new Date().toISOString().slice(11, 19)}] lobbyState=${s.lobbyState}(${stateNames[s.lobbyState]||"?"})  members=${s.memberCount}  lobbyMatchId=${s.lobbyMatchId || "—"}  match.dotaMatchId=${m?.dotaMatchId || "—"}  match.status=${m?.status}`;
    if (cur !== last) { console.log(cur); last = cur; }
    if (s.lobbyState === 3 && s.lobbyMatchId) { console.log("\n✅ Match launched and dotaMatchId captured!"); return; }
    if (s.lobbyState === 4) { console.log("\n🏁 Match finished (POSTGAME)"); return; }
    await new Promise(r => setTimeout(r, 4000));
  }
  console.log("\n(2 min watch ended — match may still be in progress)");
})().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

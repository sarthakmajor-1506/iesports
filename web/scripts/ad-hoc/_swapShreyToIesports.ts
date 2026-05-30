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
const MAJOR_UID = "discord_1302366375263735808";
const IESPORTS_UID = "discord_1475547333595758592";
const APPLY = process.argv.includes("--apply");

(async () => {
  console.log(`Mode: ${APPLY ? "APPLY" : "DRY-RUN"}\n`);
  const tref = db.collection("tournaments").doc(TID);
  const iesUserSnap = await db.collection("users").doc(IESPORTS_UID).get();
  if (!iesUserSnap.exists) { console.log("iesportofficial user missing"); process.exit(1); }
  const u = iesUserSnap.data() as any;
  const displayName = u.discordUsername || "iesportofficial";

  const newMember = {
    uid: IESPORTS_UID,
    fullName: u.fullName || displayName,
    steamId: u.steamId || "",
    steamName: u.steamName || "",
    steamAvatar: u.steamAvatar || "",
    discordId: u.discordId || IESPORTS_UID.replace("discord_", ""),
    discordUsername: u.discordUsername || displayName,
    dotaRankTier: u.dotaRankTier || 0,
    dotaBracket: u.dotaBracket || "herald_guardian",
    dotaMMR: 0,
    iesportsTier: 0,
    iesportsRank: "herald_guardian",
    iesportsRating: 0,
    skillLevel: 0,
    assignedRole: "mid",
    assignedRoleLabel: "Mid",
    rolePreferences: ["mid"],
  };

  console.log("New team-2 member (iesportofficial):");
  console.log(`  uid=${newMember.uid} fullName=${newMember.fullName} discordId=${newMember.discordId}`);

  const matches = await tref.collection("matches").get();
  console.log(`\nReset ${matches.size} matches (team2Name -> ${displayName}, status pending, clear lobby/veto):`);
  matches.docs.forEach(d => console.log(`  ${d.id}`));

  if (APPLY) {
    await tref.set({
      name: `Dota Internal Test: Major vs ${displayName}`,
      visibleToUids: [MAJOR_UID, IESPORTS_UID],
    }, { merge: true });
    await tref.collection("teams").doc("team-2").set({
      teamName: displayName,
      members: [newMember],
    }, { merge: true });
    for (const md of matches.docs) {
      await md.ref.set({
        status: "pending",
        team2Name: displayName,
        lobbyName: null, lobbyPassword: null, lobbySetAt: null,
        botQueueId: null, lobbyMode: null, lobbyStatus: null,
        waitingRoomVcId: null, team1VcId: null, team2VcId: null,
        team1Score: 0, team2Score: 0, winner: null,
        dotaMatchId: null, completedAt: null,
        vetoState: null, vcStatus: null,
        discordOpsMessageIds: [], resultMessageId: null,
        lastSetLobbyDiag: null,
      }, { merge: true });
    }
    // Also wipe any stuck botQueues from previous tests
    const queues = await db.collection("botQueues").where("tournamentId", "==", TID).get();
    for (const q of queues.docs) {
      await q.ref.set({ status: "cancelled", cancelledAt: new Date().toISOString(), cancelledReason: "swap-shrey-to-iesports" }, { merge: true });
    }
    console.log(`\n✅ Applied. Team-2 is now ${displayName}, ${matches.size} matches reset, ${queues.size} stale queues cancelled.`);
  } else {
    console.log("\nDry-run only. Re-run with --apply.");
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });

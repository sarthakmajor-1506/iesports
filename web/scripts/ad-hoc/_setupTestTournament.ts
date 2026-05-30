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
const APPLY = process.argv.includes("--apply");
const MAJOR_UID = "discord_1302366375263735808";
const SHREY_UID = "steam_76561198089387830";

function memberFromUser(uid: string, ud: any, role: "mid"): any {
  return {
    uid,
    fullName: ud.fullName || ud.steamName || ud.discordUsername || "",
    steamId: ud.steamId || "",
    steamName: ud.steamName || "",
    steamAvatar: ud.steamAvatar || "",
    discordId: ud.discordId || (uid.startsWith("discord_") ? uid.replace("discord_", "") : ""),
    discordUsername: ud.discordUsername || "",
    dotaRankTier: ud.dotaRankTier || 0,
    dotaBracket: ud.dotaBracket || "herald_guardian",
    dotaMMR: ud.dotaMMR || 0,
    iesportsTier: ud.iesportsTier || ud.dotaRankTier || 0,
    iesportsRank: ud.iesportsRank || ud.dotaBracket || "herald_guardian",
    iesportsRating: ud.iesportsRating || 0,
    skillLevel: 0,
    assignedRole: role,
    assignedRoleLabel: "Mid",
    rolePreferences: [role],
  };
}

(async () => {
  console.log(`Mode: ${APPLY ? "APPLY" : "DRY-RUN"}\n`);
  const tref = db.collection("tournaments").doc(TID);

  // Pull fresh user data
  const majorSnap = await db.collection("users").doc(MAJOR_UID).get();
  const shreySnap = await db.collection("users").doc(SHREY_UID).get();
  if (!majorSnap.exists) { console.log("Major user doc missing"); process.exit(1); }
  if (!shreySnap.exists) { console.log("Shrey user doc missing"); process.exit(1); }
  const majorMember = memberFromUser(MAJOR_UID, majorSnap.data(), "mid");
  const shreyMember = memberFromUser(SHREY_UID, shreySnap.data(), "mid");
  const shreyName = (shreySnap.data() as any).fullName || (shreySnap.data() as any).steamName || "Shrey Jain";

  console.log("Major member:");
  console.log(`  uid=${majorMember.uid} steamName=${majorMember.steamName} steamId=${majorMember.steamId} discordId=${majorMember.discordId}`);
  console.log("Shrey member:");
  console.log(`  uid=${shreyMember.uid} steamName=${shreyMember.steamName} steamId=${shreyMember.steamId} discordId=${shreyMember.discordId}`);

  // Tournament doc updates
  const tournamentUpdates: any = {
    name: "Dota Internal Test: Major vs Shrey",  // no em-dash
    visibleToUids: [MAJOR_UID, SHREY_UID],
  };
  console.log("\nTournament updates:");
  console.log(`  ${JSON.stringify(tournamentUpdates, null, 2)}`);

  // Team-1 (Major) refresh
  console.log("\nTeam-1 (Major) members refresh");
  // Team-2 (was Money, now Shrey)
  console.log("Team-2 rename Money -> Shrey Jain, replace member");

  // Matches: reset all to pending, clear lobby/vetoState/result fields
  const matches = await tref.collection("matches").get();
  console.log(`\nReset ${matches.size} matches:`);
  const matchReset: any = {
    status: "pending",
    team2Name: shreyName,
    lobbyName: null,
    lobbyPassword: null,
    lobbySetAt: null,
    botQueueId: null,
    lobbyMode: null,
    lobbyStatus: null,
    waitingRoomVcId: null,
    team1VcId: null,
    team2VcId: null,
    team1Score: 0,
    team2Score: 0,
    winner: null,
    dotaMatchId: null,
    completedAt: null,
    vetoState: null,
    vcStatus: null,
    discordOpsMessageIds: null,
    resultMessageId: null,
  };
  matches.docs.forEach(d => console.log(`  ${d.id}: ${(d.data() as any).status} → pending (clears lobby+veto)`));

  if (APPLY) {
    await tref.set(tournamentUpdates, { merge: true });
    await tref.collection("teams").doc("team-1").set({
      teamName: "Major",
      members: [majorMember],
    }, { merge: true });
    await tref.collection("teams").doc("team-2").set({
      teamName: shreyName,
      members: [shreyMember],
    }, { merge: true });
    for (const md of matches.docs) {
      await md.ref.set(matchReset, { merge: true });
    }
    console.log("\n✅ Applied. Test tournament is now Major vs Shrey, all matches reset to pending.");
  } else {
    console.log("\nDry-run only. Re-run with --apply.");
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });

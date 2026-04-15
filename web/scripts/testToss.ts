/**
 * Test script for Toss + Map Veto flow.
 * Run from /web: npx tsx scripts/testToss.ts
 */
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

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

const DISCORD_API = "https://discord.com/api/v10";
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN!;

async function discordFetch(endpoint: string, body: any) {
  return fetch(`${DISCORD_API}${endpoint}`, {
    method: "POST",
    headers: { Authorization: `Bot ${BOT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function main() {
  const channelId = "1491455654370742324";
  const captain1Discord = "1302366375263735808";
  const captain2Discord = "1475547333595758592";
  const tournamentId = "test_veto_tournament";
  const matchId = "test_veto_match";
  const bo = 3;

  // Look up user display names from Firestore
  const [user1Doc, user2Doc] = await Promise.all([
    db.collection("users").doc(`discord_${captain1Discord}`).get(),
    db.collection("users").doc(`discord_${captain2Discord}`).get(),
  ]);

  const user1 = user1Doc.data();
  const user2 = user2Doc.data();
  const team1Name = user1?.riotGameName || user1?.discordUsername || "Team Alpha";
  const team2Name = user2?.riotGameName || user2?.discordUsername || "Team Beta";

  console.log(`Team 1: ${team1Name} (captain: ${captain1Discord})`);
  console.log(`Team 2: ${team2Name} (captain: ${captain2Discord})`);

  // Ensure user docs have discordId
  await Promise.all([
    db.collection("users").doc(`discord_${captain1Discord}`).set({ discordId: captain1Discord }, { merge: true }),
    db.collection("users").doc(`discord_${captain2Discord}`).set({ discordId: captain2Discord }, { merge: true }),
  ]);

  // Create test tournament
  const tRef = db.collection("valorantTournaments").doc(tournamentId);
  await tRef.set({ name: "Test Veto Tournament", status: "active" }, { merge: true });

  // Create test teams (subcollection)
  await Promise.all([
    tRef.collection("teams").doc("team1").set({
      captainUid: `discord_${captain1Discord}`,
      members: [{ uid: `discord_${captain1Discord}`, riotGameName: team1Name }],
    }),
    tRef.collection("teams").doc("team2").set({
      captainUid: `discord_${captain2Discord}`,
      members: [{ uid: `discord_${captain2Discord}`, riotGameName: team2Name }],
    }),
  ]);

  // Create test match
  const matchRef = tRef.collection("matches").doc(matchId);
  await matchRef.set({
    team1Id: "team1",
    team2Id: "team2",
    team1Name,
    team2Name,
    bo,
    status: "upcoming",
  });

  // Random toss
  const tossWinner: "team1" | "team2" = Math.random() < 0.5 ? "team1" : "team2";
  const winnerName = tossWinner === "team1" ? team1Name : team2Name;
  const winnerCaptainId = tossWinner === "team1" ? captain1Discord : captain2Discord;

  console.log(`\n🎲 Toss winner: ${winnerName} (${tossWinner})`);

  // Post toss message to Discord
  const VALORANT_MAPS = ["Abyss", "Ascent", "Bind", "Haven", "Icebox", "Lotus", "Split"];

  const res = await discordFetch(`/channels/${channelId}/messages`, {
    content: `<@${winnerCaptainId}> your team won the toss! Pick your advantage below.`,
    embeds: [{
      title: "🎲 COIN TOSS",
      description: [
        `**${team1Name}** vs **${team2Name}**\n`,
        `🏆 **${winnerName}** wins the toss!\n`,
        `Choose your advantage:`,
        `**🎯 Ban First** — Your team bans a map first`,
        `**🗺️ Pick Side on Decider** — Other team bans first, you pick side on the final map`,
      ].join("\n"),
      color: 0xff4655,
      footer: { text: `BO${bo} · Only ${winnerName} captain can choose` },
    }],
    components: [{
      type: 1,
      components: [
        {
          type: 2, style: 1,
          label: "Ban First",
          emoji: { name: "🎯" },
          custom_id: `toss_choice:${tournamentId}:${matchId}:ban_first`,
        },
        {
          type: 2, style: 2,
          label: "Pick Side on Decider",
          emoji: { name: "🗺️" },
          custom_id: `toss_choice:${tournamentId}:${matchId}:side_first`,
        },
      ],
    }],
  });

  if (!res.ok) {
    console.error("❌ Discord API error:", await res.text());
    process.exit(1);
  }

  const msg = await res.json();
  console.log(`✅ Toss message posted! Message ID: ${msg.id}`);

  // Write vetoState to match doc
  await matchRef.update({
    vetoState: {
      status: "toss_choice",
      bo,
      tossWinner,
      banFirst: null,
      sidePickOnDecider: null,
      currentStep: 0,
      actions: [],
      remainingMaps: [...VALORANT_MAPS],
      team1Name,
      team2Name,
      team1CaptainDiscordId: captain1Discord,
      team2CaptainDiscordId: captain2Discord,
      channelId,
      messageId: msg.id,
    },
  });

  console.log("✅ Veto state written to Firestore");
  console.log("\n👉 Go to Discord and click the buttons to test the full flow!");
  console.log("   Make sure the bot is running (cd bot && npx ts-node src/index.ts)");
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });

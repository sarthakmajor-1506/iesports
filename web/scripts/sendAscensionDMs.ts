/**
 * One-time script: Send registration DM to all players registered for
 * LEAGUE OF RISING STARS - ASCENSION
 *
 * Usage: npx tsx scripts/sendAscensionDMs.ts
 */
import * as admin from "firebase-admin";
import { config } from "dotenv";
config({ path: ".env.local" });

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}
const db = admin.firestore();

const DISCORD_API = "https://discord.com/api/v10";
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || "";
const TOURNAMENT_ID = "league-of-rising-stars-ascension";

async function sendDM(discordId: string, content: string): Promise<boolean> {
  // Open DM channel
  const dmRes = await fetch(`${DISCORD_API}/users/@me/channels`, {
    method: "POST",
    headers: { "Authorization": `Bot ${BOT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ recipient_id: discordId }),
  });
  if (!dmRes.ok) return false;
  const dmChannel = await dmRes.json();

  const msgRes = await fetch(`${DISCORD_API}/channels/${dmChannel.id}/messages`, {
    method: "POST",
    headers: { "Authorization": `Bot ${BOT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  return msgRes.ok;
}

async function main() {
  // Get tournament data
  const tDoc = await db.collection("valorantTournaments").doc(TOURNAMENT_ID).get();
  const tData = tDoc.data();
  if (!tData) { console.log("Tournament not found"); return; }

  console.log(`Tournament: ${tData.name}`);
  console.log(`Prize Pool: ₹${tData.prizePool}`);
  console.log(`Format: ${tData.format}`);
  console.log(`Start: ${tData.startDate}`);
  console.log(`Registration Deadline: ${tData.registrationDeadline}`);

  // Get all registered players
  const playersSnap = await db.collection("valorantTournaments").doc(TOURNAMENT_ID).collection("soloPlayers").get();
  console.log(`\nRegistered players: ${playersSnap.size}`);

  const startFormatted = (() => {
    try {
      return new Date(tData.startDate).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
    } catch { return tData.startDate; }
  })();

  const deadlineFormatted = (() => {
    try {
      return new Date(tData.registrationDeadline).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
    } catch { return ""; }
  })();

  const deadlineStr = deadlineFormatted ? `\n> Registration closes: **${deadlineFormatted}**` : "";

  const formatLabel = tData.format === "shuffle" ? "Shuffle" : tData.format === "auction" ? "Auction" : "Standard";

  const nextSteps = tData.format === "shuffle"
    ? `Once registration closes, teams will be **shuffled** — balanced squads based on rank. You don't need to find a team. We handle it.`
    : tData.format === "auction"
    ? `Captains will **auction-draft** players after registration closes. Show up, get picked, and prove your worth.`
    : `Make sure your team is ready before the tournament starts. Coordinate with your squad.`;

  let sent = 0;
  let failed = 0;
  let noDiscord = 0;

  for (const pDoc of playersSnap.docs) {
    const p = pDoc.data();
    const uid = pDoc.id;

    // Get Discord ID
    let discordId = "";
    if (uid.startsWith("discord_")) {
      discordId = uid.replace("discord_", "");
    } else {
      const userDoc = await db.collection("users").doc(uid).get();
      discordId = userDoc.data()?.discordId || "";
    }

    if (!discordId) {
      console.log(`  SKIP (no discord): ${p.riotGameName || uid}`);
      noDiscord++;
      continue;
    }

    const playerName = p.riotGameName || "Player";
    const rank = p.iesportsRank || p.riotRank || "Unranked";

    const message = [
      `# You're in. Game on.\n`,
      `**${playerName}**, you're officially registered for **${tData.name}**.\n`,
      `> Rank: **${rank}**`,
      `> Format: **${formatLabel}**`,
      `> Prize Pool: **₹${tData.prizePool}**`,
      `> Tournament starts: **${startFormatted}**${deadlineStr}\n`,
      `**What happens next?**`,
      `${nextSteps}\n`,
      `**About the Leaderboard**`,
      `Every match counts. Your kills, deaths, ACS — all tracked automatically. Top performers on the leaderboard win **bonus prizes** on top of the tournament prize pool. Play every round like it matters.\n`,
      `Stay sharp. Stay online. When it's game time, we expect you to show up ready.\n`,
      `📎 **Tournament details:** https://iesports.in/valorant/tournament/${TOURNAMENT_ID}`,
      `\nSee you on the leaderboard.`,
      `**— IEsports**`,
    ].join("\n");

    const ok = await sendDM(discordId, message);
    if (ok) {
      sent++;
      console.log(`  SENT: ${playerName} (${discordId})`);
    } else {
      failed++;
      console.log(`  FAIL: ${playerName} (${discordId})`);
    }

    // Rate limit: Discord allows ~50 DMs/sec but be safe
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\nDone! Sent: ${sent} | Failed: ${failed} | No Discord: ${noDiscord}`);
}

main().catch(console.error);

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
const TID = "domin8-ultimate-tilt-proof-tournament";
const APPLY = process.argv.includes("--apply");
(async () => {
  console.log(`Mode: ${APPLY ? "APPLY" : "DRY-RUN"}\n`);
  const tDoc = await db.collection("tournaments").doc(TID).get();
  const channelId = (tDoc.data() as any).discordChannelId;
  console.log(`Tournament channel: ${channelId}`);

  // Scan completed Dota matches with a resultMessageId and side data, check
  // each for the inverted label pattern.
  const matches = await db.collection("tournaments").doc(TID).collection("matches").get();
  const candidates: any[] = [];
  for (const md of matches.docs) {
    const m = md.data() as any;
    if (m.status !== "completed") continue;
    if (!m.resultMessageId) continue;
    if (!m.result) continue;
    const { team1Side, team2Side, radiantWin } = m.result;
    if (!team1Side || !team2Side || radiantWin === undefined) continue;
    candidates.push({ id: md.id, m });
  }
  console.log(`Found ${candidates.length} completed Dota matches with a result message\n`);

  for (const c of candidates) {
    const m = c.m;
    const { team1Side, team2Side, radiantWin } = m.result;
    const winner: "team1" | "team2" = m.winner;
    // Compute the BUGGY label that was likely sent (the inverted derivation)
    const buggyWinnerSide = team1Side === (radiantWin ? "radiant" : "dire") ? "radiant" : "dire";
    // Compute the CORRECT label
    const correctWinnerSide = winner === "team1" ? team1Side : team2Side;
    const wasWrong = buggyWinnerSide !== correctWinnerSide;
    console.log(`  ${c.id}: ${m.team1Name} vs ${m.team2Name}`);
    console.log(`    team1=${team1Side}, team2=${team2Side}, radiantWin=${radiantWin}, winner=${winner}`);
    console.log(`    buggy label: winner=${buggyWinnerSide} | correct: winner=${correctWinnerSide} | ${wasWrong ? "🔴 WRONG" : "✓ OK"}`);
    if (!wasWrong) continue;

    const winnerName = winner === "team1" ? m.team1Name : m.team2Name;
    const loserName  = winner === "team1" ? m.team2Name : m.team1Name;
    const winnerSideLabel = correctWinnerSide;
    const loserSideLabel = winnerSideLabel === "radiant" ? "dire" : "radiant";
    const sideEmoji = winnerSideLabel === "radiant" ? "🟢" : "🔴";
    const sideLabel = winnerSideLabel === "radiant" ? "Radiant" : "Dire";

    const newPayload = {
      embeds: [{
        title: `🏆 Match Complete — ${winnerName} wins!`,
        description: [
          `${sideEmoji} **${winnerName}** (${sideLabel}) defeated **${loserName}** (${loserSideLabel === "radiant" ? "Radiant" : "Dire"})`,
          ``,
          `**Dota match ID:** [\`${m.dotaMatchId}\`](https://www.dotabuff.com/matches/${m.dotaMatchId})`,
          `**Tournament:** ${m.team1Name} vs ${m.team2Name}`,
          ``,
          `Full per-player stats: https://www.dotabuff.com/matches/${m.dotaMatchId}`,
        ].join("\n"),
        color: 0x16a34a,
        footer: { text: "iesports Tournament • auto-resolved from lobby (corrected)" },
        timestamp: m.completedAt || new Date().toISOString(),
      }],
    };

    if (APPLY) {
      const tok = process.env.DISCORD_BOT_TOKEN;
      const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${m.resultMessageId}`, {
        method: "PATCH",
        headers: { Authorization: `Bot ${tok}`, "Content-Type": "application/json" },
        body: JSON.stringify(newPayload),
      });
      console.log(`    → PATCH HTTP ${res.status} ${res.ok ? "✓ fixed" : `: ${await res.text()}`}`);
    }
  }
  console.log(APPLY ? "\nApplied." : "\nDry-run only.");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });

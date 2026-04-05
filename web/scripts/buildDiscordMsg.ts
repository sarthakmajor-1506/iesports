import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { initializeApp, cert, getApps, getApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}
const db = getFirestore(getApp());

async function main() {
  const sendIt = process.argv.includes("--send");
  const tRef = db.collection("valorantTournaments").doc("league-of-rising-stars-prelims");
  const tDoc = await tRef.get();
  const t = tDoc.data()!;

  // Grand final
  const gfDoc = await tRef.collection("matches").doc("grand-final").get();
  const gf = gfDoc.data()!;
  const winnerId = gf.team1Score > gf.team2Score ? gf.team1Id : gf.team2Id;
  const winnerName = gf.team1Score > gf.team2Score ? gf.team1Name : gf.team2Name;

  // Teams — get winner members
  const teamsSnap = await tRef.collection("teams").get();
  const winnerTeam = teamsSnap.docs.find(d => d.id === winnerId);
  const winnerMembers = winnerTeam?.data()?.members || [];

  // Build discord ID map
  const discordIdMap: Record<string, string> = {};
  const playersSnap = await tRef.collection("soloPlayers").get();
  const steamUids: string[] = [];
  for (const pDoc of playersSnap.docs) {
    const uid = pDoc.id;
    if (uid.startsWith("discord_")) {
      discordIdMap[uid] = uid.replace("discord_", "");
    } else if (uid.startsWith("steam_")) {
      steamUids.push(uid);
    }
  }
  for (const sUid of steamUids) {
    const userDoc = await db.collection("users").doc(sUid).get();
    if (userDoc.exists && userDoc.data()?.discordId) {
      discordIdMap[sUid] = userDoc.data()!.discordId;
    }
  }

  // All player tags
  const allTags = playersSnap.docs
    .map(d => discordIdMap[d.id])
    .filter(Boolean)
    .map(id => `<@${id}>`);

  // Winner member tags
  const winnerTags = winnerMembers
    .map((m: any) => {
      const did = discordIdMap[m.uid];
      return did ? `<@${did}> ${m.riotGameName}` : m.riotGameName;
    })
    .join(" · ");

  // Game summaries
  const gameSummaries: string[] = [];
  for (let g = 1; g <= 5; g++) {
    const gData = gf[`game${g}`] || gf.games?.[`game${g}`];
    if (!gData) continue;
    const gMap = gData.mapName || "Unknown";
    const gWinner = gf[`game${g}Winner`] || gData.winner;
    const gWinnerName = gWinner === "team1" ? gf.team1Name : gf.team2Name;
    const t1R = gData.team1RoundsWon ?? 0;
    const t2R = gData.team2RoundsWon ?? 0;
    gameSummaries.push(`🗺️ Game ${g} — ${gMap}: ${gWinnerName} wins **${Math.max(t1R, t2R)}-${Math.min(t1R, t2R)}**`);
  }

  // Leaderboard top 3
  const lbSnap = await tRef.collection("leaderboard").get();
  const lb = lbSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
  lb.sort((a, b) => (b.kd || 0) - (a.kd || 0));
  const top3 = lb.slice(0, 3);
  const medals = ["🥇", "🥈", "🥉"];
  const lbLines = top3.map((p, i) => {
    const pTag = discordIdMap[p.uid] ? `<@${discordIdMap[p.uid]}>` : "";
    return `${medals[i]} ${pTag} **${p.name}** — K/D: **${p.kd}** | ACS: ${p.acs} | ${p.totalKills}K/${p.totalDeaths}D/${p.totalAssists}A | ${p.matchesPlayed} maps`;
  });

  const msg1 = [
    `🏆 **LEAGUE OF RISING STARS — PRELIMS** 🏆\n`,
    allTags.join(" ") + "\n",
    `We want to make our LAN tournaments more fun and engaging — and you ${allTags.length} made this prelim something special. Thank you for showing up and trusting a brand new platform. This can't be expressed in words. 🙏\n`,
    `Special thanks to Domin8 and Shrey bhaiya for making this possible, our OG streamer Shubh and team for the incredible energy, Vanshaj for always holding it down, and our photographers Isha and Mini for always showing up. 💛\n`,
    `> *"Legends stay legends."*\n`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`,
    `🥇 **TOURNAMENT CHAMPIONS — ${winnerName}** 🥇`,
    `💰 **Winnings: ₹${t.prizePool || "3,000"}**\n`,
    winnerTags,
  ].join("\n");

  const msg2 = [
    `⚔️ **GRAND FINAL** — ${gf.team1Name} vs ${gf.team2Name}\n`,
    gameSummaries.join("\n"),
    `\n**Series: ${gf.team1Score}-${gf.team2Score}**\n`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`,
    `📊 **TOP 3 — TOURNAMENT LEADERBOARD** (by K/D)\n`,
    lbLines.join("\n") + "\n",
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`,
    `📎 Full match details & stats → https://iesports.in/valorant/tournament/league-of-rising-stars-prelims\n`,
    `Thanks for trusting the process. You guys are the best. 🫡`,
    `This is just the beginning.\n`,
    `— IEsports`,
  ].join("\n");

  const message = msg1 + "\n" + msg2;

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  DISCORD MESSAGE PREVIEW");
  console.log("═══════════════════════════════════════════════════════════\n");
  console.log(message);
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log(`  Message length: ${message.length} chars`);
  console.log(`  Winner: ${winnerName}`);
  console.log(`  Grand Final: ${gf.team1Name} ${gf.team1Score}-${gf.team2Score} ${gf.team2Name}`);
  console.log(`  Players tagged: ${allTags.length}`);
  console.log("═══════════════════════════════════════════════════════════\n");

  if (!sendIt) {
    console.log("💡 To send, run: npx tsx scripts/buildDiscordMsg.ts --send");
    return;
  }

  // Send to Discord
  const channelId = process.env.Valorant_lobby || process.env.LOBBY_CONTROL_CHANNEL_ID || process.env.RESULTS_CHANNEL_ID;
  const botToken = process.env.DISCORD_BOT_TOKEN;

  if (!channelId || !botToken) {
    console.log("❌ Missing DISCORD_BOT_TOKEN or Valorant_lobby env var");
    return;
  }

  console.log(`📨 Sending to channel: ${channelId}...`);

  const sendMsg = async (content: string, label: string) => {
    const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: "POST",
      headers: {
        "Authorization": `Bot ${botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content }),
    });
    if (res.ok) {
      const data = await res.json();
      console.log(`✅ ${label} sent! ID: ${data.id}`);
    } else {
      const errText = await res.text();
      console.log(`❌ ${label} failed: ${res.status} ${errText}`);
    }
  };

  await sendMsg(msg1, "Message 1 (intro + champions)");
  await sendMsg(msg2, "Message 2 (grand final + leaderboard)");
}

main().catch(console.error);

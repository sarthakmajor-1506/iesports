/**
 * Per-player DM for LEAGUE OF RISING STARS - ASCENSION.
 *
 * Sends every registered player their team, full match schedule, and a
 * polite "report 15 min early" ask. Dry-run by default — prints 3 sample
 * DMs and a total count. Pass `--send` to actually deliver.
 *
 * Usage:
 *   npx tsx scripts/dmAscensionFixtures.ts            # dry-run, 3 samples
 *   npx tsx scripts/dmAscensionFixtures.ts --send     # send to everyone
 *   npx tsx scripts/dmAscensionFixtures.ts --uid=<id> # dry-run, show just that uid
 *   npx tsx scripts/dmAscensionFixtures.ts --send --uid=<id>  # send to just one uid (smoke test)
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

const args = process.argv.slice(2);
const shouldSend = args.includes("--send");
const uidArg = args.find((a) => a.startsWith("--uid="))?.slice(6);
const SAMPLE_COUNT = 3;

async function sendDM(discordId: string, content: string): Promise<{ ok: boolean; error?: string }> {
  const dmRes = await fetch(`${DISCORD_API}/users/@me/channels`, {
    method: "POST",
    headers: { Authorization: `Bot ${BOT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ recipient_id: discordId }),
  });
  if (!dmRes.ok) return { ok: false, error: `open dm ${dmRes.status}: ${await dmRes.text()}` };
  const dm = await dmRes.json();
  const msg = await fetch(`${DISCORD_API}/channels/${dm.id}/messages`, {
    method: "POST",
    headers: { Authorization: `Bot ${BOT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!msg.ok) return { ok: false, error: `send ${msg.status}: ${await msg.text()}` };
  return { ok: true };
}

const fmtIST = (iso: string) => {
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      weekday: "short", day: "numeric", month: "short",
      hour: "numeric", minute: "2-digit", hour12: true,
    });
  } catch {
    return iso;
  }
};

type Match = {
  id: string;
  team1Id: string; team2Id: string;
  team1Name: string; team2Name: string;
  scheduledTime?: string;
  matchDay?: number; matchIndex?: number;
  bestOf?: number; bo?: number;
  isBracket?: boolean; bracketLabel?: string;
};

function buildDM(riotName: string, teamName: string, teamId: string, matches: Match[]): string {
  const mine = matches
    .filter((m) => m.team1Id === teamId || m.team2Id === teamId)
    .sort((a, b) => new Date(a.scheduledTime || 0).getTime() - new Date(b.scheduledTime || 0).getTime());

  const scheduleLines: string[] = mine.length
    ? mine.map((m) => {
        const opponentName = m.team1Id === teamId ? m.team2Name : m.team1Name;
        const label = m.isBracket
          ? `**${m.bracketLabel || "Bracket"}**`
          : `**Round ${m.matchDay ?? "?"} · Match ${m.matchIndex ?? "?"}**`;
        const when = m.scheduledTime ? fmtIST(m.scheduledTime) + " IST" : "time TBA";
        const bo = m.bestOf ?? m.bo;
        const boStr = bo ? ` · BO${bo}` : "";
        return `• ${label} — vs **${opponentName}** — ${when}${boStr}`;
      })
    : ["*Your schedule drops shortly — we'll DM you the moment it's live.*"];

  const firstMatch = mine.find((m) => !!m.scheduledTime);
  const firstOpponent = firstMatch
    ? (firstMatch.team1Id === teamId ? firstMatch.team2Name : firstMatch.team1Name)
    : null;
  const firstTime = firstMatch?.scheduledTime ? new Date(firstMatch.scheduledTime) : null;
  const dropInBy = firstTime
    ? new Date(firstTime.getTime() - 15 * 60 * 1000).toLocaleTimeString("en-IN", {
        timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true,
      }) + " IST"
    : null;

  const hypeLine = firstOpponent && firstTime
    ? `It's match day. **${teamName}** takes the server tonight — first up, **${firstOpponent}** at **${fmtIST(firstMatch!.scheduledTime!)} IST**. Bracket's live, nerves are real, and the lobby's waiting on you.`
    : `It's match day. **${teamName}** is locked in and the bracket's live. Time to prove it.`;

  const reportLine = dropInBy
    ? `Be online in the iesports Discord by **${dropInBy}** — 15 minutes before first map. Lobby setup, Riot ID hiccups, Discord issues — we sort them in that window so you roll straight into round 1.`
    : `Be online in the iesports Discord **15 minutes before your first match** so we can sort any lobby / Riot ID / Discord issues before the clock runs.`;

  return [
    `Hey **${riotName}** 👋`,
    ``,
    hypeLine,
    ``,
    `**📅 Your Schedule**`,
    ...scheduleLines,
    ``,
    `**⏰ Drop in 15 minutes early**`,
    reportLine,
    `If you're late, your squad plays short — don't put them in that spot.`,
    ``,
    `**✅ Quick pre-game checks:**`,
    `• In the iesports Discord, lobby channel visible`,
    `• Valorant client updated + logged in + ready to accept the invite`,
    `• Pinged your teammates (they've got this same DM) and synced on a quick plan`,
    ``,
    `You're going to have a great time tonight. Play clean, communicate, and leave it all on the map. See you on the server 🫡`,
    ``,
    `— **IEsports**`,
    `📎 Bracket + fixtures: https://iesports.in/valorant/tournament/${TOURNAMENT_ID}`,
  ].join("\n");
}

async function main() {
  if (!BOT_TOKEN) {
    console.error("❌ DISCORD_BOT_TOKEN missing in .env.local");
    process.exit(1);
  }

  const tref = db.collection("valorantTournaments").doc(TOURNAMENT_ID);
  const [teamsSnap, matchesSnap] = await Promise.all([
    tref.collection("teams").get(),
    tref.collection("matches").get(),
  ]);

  const matches: Match[] = matchesSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  type Target = { uid: string; riotName: string; teamId: string; teamName: string; discordId: string };
  const targets: Target[] = [];

  for (const t of teamsSnap.docs) {
    const td = t.data();
    const teamName: string = td.teamName || t.id;
    const members: any[] = td.members || [];
    for (const m of members) {
      const uid: string | undefined = m?.uid;
      if (!uid) continue;
      if (uidArg && uid !== uidArg) continue;
      const riotName: string = m.riotGameName || uid;

      let discordId = "";
      if (uid.startsWith("discord_")) discordId = uid.replace("discord_", "");
      else {
        const udoc = await db.collection("users").doc(uid).get();
        discordId = udoc.data()?.discordId || "";
      }
      if (!discordId) { console.warn(`⚠ no discordId for ${uid} (${riotName}) — skipping`); continue; }

      targets.push({ uid, riotName, teamId: t.id, teamName, discordId });
    }
  }

  console.log(`Loaded ${teamsSnap.size} teams, ${matches.length} matches, ${targets.length} target players.\n`);

  // Show samples first
  const samples = targets.slice(0, SAMPLE_COUNT);
  samples.forEach((t, i) => {
    console.log(`━━━━━━━━━━ SAMPLE ${i + 1} / ${samples.length} ━━━━━━━━━━`);
    console.log(`To: ${t.riotName} (${t.uid}) → <@${t.discordId}>`);
    console.log(`Team: ${t.teamName}`);
    console.log("─".repeat(60));
    console.log(buildDM(t.riotName, t.teamName, t.teamId, matches));
    console.log("");
  });

  if (!shouldSend) {
    console.log(`\n🟡 DRY RUN — no DMs sent. To actually send to all ${targets.length} players:`);
    console.log(`   npx tsx scripts/dmAscensionFixtures.ts --send`);
    console.log(`Or send to one user for a live smoke test:`);
    console.log(`   npx tsx scripts/dmAscensionFixtures.ts --send --uid=<uid>`);
    process.exit(0);
  }

  console.log(`\n🚀 Sending to ${targets.length} player(s)…\n`);
  let sent = 0, failed = 0;
  for (const t of targets) {
    const body = buildDM(t.riotName, t.teamName, t.teamId, matches);
    const res = await sendDM(t.discordId, body);
    if (res.ok) { sent++; console.log(`✓ ${t.riotName} (${t.teamName})`); }
    else { failed++; console.log(`✗ ${t.riotName} (${t.teamName}) — ${res.error}`); }
    // Gentle rate limit: 5 DMs/sec max
    await new Promise((r) => setTimeout(r, 220));
  }
  console.log(`\nDone: ${sent} sent · ${failed} failed.`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });

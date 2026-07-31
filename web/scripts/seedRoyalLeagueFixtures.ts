/**
 * Seed the Royal Sports League group stage + play-offs from the published
 * fixture sheet: 8 teams, 2 groups of 4, MR16 groups into MR24 play-offs.
 *
 * Slots and kick-off times come straight off the fixture sheet, including the
 * two-area layout — each 20-minute slot runs two matches at once, tagged
 * area 1 / area 2. With a single game server those two cannot both run over
 * RCON at the same time, so the area tag is recorded now and the admin panel
 * can route them once a second server exists.
 *
 * Rosters are explicit uids, never name lookups. Several first names in the
 * WhatsApp lists map to more than one registered player (two Namans, two
 * Rishabhs) and several have no account at all. Guessing would silently
 * produce a player who cannot join a whitelisted server, which surfaces only
 * when nine people are already waiting. Unresolved slots are left empty and
 * reported instead.
 *
 * Dry run by default:
 *   npx tsx scripts/seedRoyalLeagueFixtures.ts
 *   npx tsx scripts/seedRoyalLeagueFixtures.ts --apply
 */
import { initializeApp, cert, getApps, getApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });
if (!getApps().length) {
  initializeApp({ credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID!,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  })});
}
const db = getFirestore(getApp());
const APPLY = process.argv.includes("--apply");
const TID = "cs2-royal-sports-league";

interface TeamSpec { name: string; group: "A" | "B"; uids: string[]; gaps: string[] }

const TEAMS: Record<string, TeamSpec> = {
  A1: { name: "Utsav Ultimates", group: "A",
        uids: ["discord_1532717410258522194"],
        gaps: ["Raunak (no account)", "Rajat (account, no Steam linked)", "Abhay (no account)", "Rishabh (ambiguous)"] },
  A2: { name: "Surana Strikers", group: "A",
        uids: ["discord_1532655839838601238", "discord_1177684084114329640", "discord_1532660143404351771"],
        gaps: ["Naman (Kala or Soni?)", "Rishab (Agrawal or Betala?)"] },
  A3: { name: "Nawabzade", group: "A", uids: [], gaps: ["entire roster not supplied"] },
  A4: { name: "HM Gladiators", group: "A",
        uids: ["discord_1532561200477503698", "discord_501100082435719180"],
        gaps: ["Punit (no account)", "Rushabh (no account)", "Rishabh Patni (ambiguous)"] },
  B1: { name: "BKT Titans", group: "B",
        uids: ["discord_1532712189654204476", "discord_1532709546936635494",
               "discord_1532722683970588709", "discord_1532698987793092695"],
        gaps: ["Ishu (no account)"] },
  B2: { name: "Gokhru Smashers", group: "B", uids: [], gaps: ["entire roster not supplied"] },
  B3: { name: "Oscar", group: "B",
        uids: ["discord_1532709237191344356", "discord_932266473244741632",
               "discord_1532634757207294066", "discord_1532478324054556725"],
        gaps: ["Naman (Kala or Soni?)"] },
  B4: { name: "Fanboy", group: "B",
        uids: ["discord_1099612546295676989", "discord_1532588548664987760",
               "discord_1532698393871384699", "discord_964999057741344888"],
        gaps: ["Ankish (no account)"] },
};

const IST = "+05:30";
const at = (hhmm: string, day = "2026-07-31") => `${day}T${hhmm}:00${IST}`;

/** [slotA, slotB, kickoff, matchDay] — two areas per slot, per the fixture sheet. */
const GROUP_FIXTURES: Array<[string, string, string, number]> = [
  ["A1", "A2", at("21:00"), 1], ["A3", "A4", at("21:00"), 1],
  ["A1", "A3", at("21:20"), 2], ["A2", "A4", at("21:20"), 2],
  ["A1", "A4", at("21:40"), 3], ["A2", "A3", at("21:40"), 3],
  ["B1", "B2", at("22:00"), 1], ["B3", "B4", at("22:00"), 1],
  ["B1", "B3", at("22:20"), 2], ["B2", "B4", at("22:20"), 2],
  ["B1", "B4", at("22:40"), 3], ["B2", "B3", at("22:40"), 3],
];

// Ids match the ones lib/settleCS2Match.ts auto-seeds from group standings:
// SF1 = Group A #1 vs Group B #2, SF2 = Group B #1 vs Group A #2, which is
// exactly the crossover the fixture sheet specifies.
const PLAYOFFS = [
  { id: "cs2-sf1",   label: "SF1",   when: at("23:10"), note: "Group A #1 vs Group B #2", area: 1 },
  { id: "cs2-sf2",   label: "SF2",   when: at("23:10"), note: "Group B #1 vs Group A #2", area: 2 },
  { id: "cs2-final", label: "FINAL", when: at("00:00", "2026-08-01"), note: "Winner SF1 vs Winner SF2", area: 1 },
];

async function main() {
  const tref = db.collection("cs2Tournaments").doc(TID);
  const sp = await tref.collection("soloPlayers").get();
  const reg = new Map(sp.docs.map(d => [d.id, d.data() as any]));

  console.log("=== TEAMS ===");
  const teamDocs: any[] = [];
  const slots = Object.keys(TEAMS);
  for (const slot of slots) {
    const t = TEAMS[slot];
    const members = t.uids.map(uid => {
      const p = reg.get(uid);
      if (!p) { console.log(`   !! ${slot}: uid ${uid} is not registered for this tournament`); return null; }
      return { uid, steamName: p.steamName || "", steamAvatar: p.steamAvatar || "", skillLevel: 1, cs2RankTier: 0 };
    }).filter(Boolean) as any[];
    console.log(`${slot}  ${t.name.padEnd(18)} group ${t.group}   ${members.length}/5 players`);
    members.forEach(m => console.log(`       ${m.steamName}`));
    t.gaps.forEach(g => console.log(`       MISSING: ${g}`));
    teamDocs.push({
      id: slot.toLowerCase(), slot, tournamentId: TID, teamIndex: slots.indexOf(slot),
      teamName: t.name, groupId: t.group, captainUid: members[0]?.uid || "",
      avgSkillLevel: 1, members,
    });
  }

  const nameOf = new Map(slots.map(s => [s, TEAMS[s].name]));
  console.log("\n=== GROUP FIXTURES (two areas run concurrently) ===");
  const matchDocs: any[] = [];
  let idx = 0;
  for (const [a, b, when, day] of GROUP_FIXTURES) {
    idx++;
    const area = idx % 2 === 1 ? 1 : 2;
    const id = `rsl-${a.toLowerCase()}-v-${b.toLowerCase()}`;
    console.log(`   ${when.slice(11, 16)}  area${area}   ${String(nameOf.get(a)).padEnd(18)} vs ${nameOf.get(b)}`);
    matchDocs.push({
      id, tournamentId: TID, groupId: TEAMS[a].group,
      team1Id: a.toLowerCase(), team1Name: nameOf.get(a),
      team2Id: b.toLowerCase(), team2Name: nameOf.get(b),
      team1Score: 0, team2Score: 0, matchDay: day, matchIndex: idx, area,
      isBracket: false, status: "pending", scheduledTime: when, maxRounds: 16,
    });
  }

  console.log("\n=== PLAY-OFFS (auto-seeded from group standings) ===");
  PLAYOFFS.forEach((p, i) => {
    console.log(`   ${p.when.slice(11, 16)}  ${p.label.padEnd(6)} ${p.note}`);
    matchDocs.push({
      id: p.id, tournamentId: TID,
      bracketType: p.id === "cs2-final" ? "grand_final" : "winners", bracketLabel: p.label,
      team1Id: "TBD", team1Name: "TBD", team2Id: "TBD", team2Name: "TBD",
      team1Score: 0, team2Score: 0,
      matchDay: p.id === "cs2-final" ? 5 : 4, matchIndex: 100 + i, area: p.area,
      isBracket: true, status: "pending", scheduledTime: p.when, maxRounds: 24,
    });
  });

  const filled = teamDocs.reduce((n, t) => n + t.members.length, 0);
  console.log(`\nrostered ${filled}/40 players   ${teamDocs.length} teams   ${matchDocs.length} matches`);

  if (!APPLY) { console.log("\nDRY RUN — nothing written. Re-run with --apply."); return; }

  const nowIso = new Date().toISOString();
  const batch = db.batch();
  for (const t of teamDocs) batch.set(tref.collection("teams").doc(t.id), { ...t, createdAt: nowIso }, { merge: true });
  for (const m of matchDocs) batch.set(tref.collection("matches").doc(m.id), m, { merge: true });
  batch.set(tref, {
    teamsGenerated: true, teamCount: 8, groupCount: 2,
    groupMaxRounds: 16, bracketMaxRounds: 24,
    status: "active", teamsGeneratedAt: nowIso,
  }, { merge: true });
  await batch.commit();
  console.log("\nWritten.");
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

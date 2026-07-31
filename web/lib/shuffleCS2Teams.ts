import type { Firestore } from "firebase-admin/firestore";

/**
 * CS2 solo-pool -> teams shuffle. Mirrors /api/dota/shuffle-teams's shape and
 * conventions exactly (seeded RNG so a previewed dry-run can be re-published
 * byte-for-byte, dryRun default true, deleteExisting wipes matches/standings/
 * leaderboard for a clean reshuffle) so the CS2 registration -> team-formation
 * pipeline works the same way Dota's does end to end.
 *
 * The one real difference: CS2 has no role system (safe_lane/mid/etc — see
 * docs/CS2_TOURNAMENT_CONTEXT.md, CS2 tiers are purely Steam-link trust, no
 * MMR/rank API), so there's no bipartite role-coverage matching here — just
 * a seeded snake draft by `skillLevel`. And CS2's fixed 2-groups-of-4 format
 * (unlike Dota's Swiss pairings) needs its own schedule, so this also splits
 * the generated teams into groups and generates the round-robin + play-off
 * placeholder matches, which Dota's shuffle route leaves to a separate step.
 */

type SoloPlayer = {
  uid: string;
  steamName?: string;
  steamAvatar?: string;
  skillLevel?: number;
  cs2RankTier?: number;
  discordId?: string;
  registeredAt?: string;
};

export type CS2ShuffledTeam = {
  id: string;
  tournamentId: string;
  teamIndex: number;
  teamName: string;
  groupId: string;
  captainUid: string;
  avgSkillLevel: number;
  members: Array<{
    uid: string; steamName: string; steamAvatar: string;
    skillLevel: number; cs2RankTier: number;
  }>;
};

export interface CS2ShuffleOptions {
  groupCount?: number;      // default 2 — must evenly divide teamCount into groups of 4 for schedule generation
  dryRun?: boolean;         // default true — preview only, no writes
  deleteExisting?: boolean; // default false — on commit, wipe prior teams/matches/standings first
  seed?: number;            // reuse a previewed seed so a re-publish matches the preview exactly
}

export interface CS2ShuffleResult {
  success: true;
  dryRun: boolean;
  seed: number;
  totalPlayers: number;
  teamCount: number;
  groupCount: number;
  teams: CS2ShuffledTeam[];
  matchesGenerated: number;
  warning?: string;
}

// Seeded PRNG (mulberry32) — same one /api/dota/shuffle-teams and
// /api/valorant/shuffle-teams use, so a preview's seed reproduces the exact
// same shuffle when passed back in on commit.
function makeRng(seed: number) {
  let s = seed >>> 0;
  return function rng(): number {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleArray<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Standard 4-team round-robin schedule (indices into a group's 4 teams).
// Each team plays the other 3 exactly once across 3 rounds.
const ROUND_ROBIN_4: [number, number][][] = [
  [[0, 3], [1, 2]],
  [[0, 2], [3, 1]],
  [[0, 1], [2, 3]],
];

function groupLabel(i: number): string {
  return String.fromCharCode(65 + i); // A, B, C...
}

export async function shuffleCS2Teams(
  db: Firestore,
  tournamentId: string,
  opts: CS2ShuffleOptions = {},
): Promise<CS2ShuffleResult> {
  const groupCount = opts.groupCount && opts.groupCount > 0 ? opts.groupCount : 2;
  const dryRun = opts.dryRun ?? true;
  const seed = (typeof opts.seed === "number" && Number.isFinite(opts.seed))
    ? Math.floor(opts.seed) >>> 0
    : (Math.floor(Math.random() * 0x100000000) >>> 0);
  const rng = makeRng(seed);

  const tref = db.collection("cs2Tournaments").doc(tournamentId);
  const tSnap = await tref.get();
  if (!tSnap.exists) throw new Error(`Tournament ${tournamentId} not found`);
  const tournament: any = tSnap.data();
  const playersPerTeam = tournament.playersPerTeam || 5;

  const soloSnap = await tref.collection("soloPlayers").get();
  const players: SoloPlayer[] = soloSnap.docs.map(d => ({ uid: d.id, ...(d.data() as any) }));

  if (players.length < playersPerTeam) {
    throw new Error(`Need at least ${playersPerTeam} registered players to shuffle (got ${players.length})`);
  }

  const teamCount = Math.floor(players.length / playersPerTeam);

  // Seeded shuffle first (so ties in skillLevel — the common case today,
  // since CS2 has no automated skill signal yet — don't just reflect
  // registration order), then a stable sort by skillLevel desc, then a
  // snake draft (1..N, N..1, ...) across teams.
  const pool = shuffleArray(players, rng).sort((a, b) => (b.skillLevel || 1) - (a.skillLevel || 1));
  const drafted = pool.slice(0, teamCount * playersPerTeam);
  const leftover = pool.slice(teamCount * playersPerTeam);

  const teamMembers: SoloPlayer[][] = Array.from({ length: teamCount }, () => []);
  let dir = 1, t = 0;
  for (const p of drafted) {
    teamMembers[t].push(p);
    if (dir === 1) {
      if (t === teamCount - 1) dir = -1; else t++;
    } else {
      if (t === 0) dir = 1; else t--;
    }
  }

  const teamsRaw = teamMembers.map((members, i) => {
    const sorted = [...members].sort((a, b) => (b.skillLevel || 1) - (a.skillLevel || 1));
    const avgSkillLevel = members.reduce((s, m) => s + (m.skillLevel || 1), 0) / members.length;
    return { teamIndex: i, sorted, members, avgSkillLevel };
  });

  // Assign groups by alternating across skill-sorted teams for balance
  // (top-seeded teams spread across groups rather than clustered in one).
  const bySkill = [...teamsRaw].sort((a, b) => b.avgSkillLevel - a.avgSkillLevel);
  const groupOf = new Map<number, string>();
  bySkill.forEach((team, i) => groupOf.set(team.teamIndex, groupLabel(i % groupCount)));

  const teams: CS2ShuffledTeam[] = teamsRaw.map(({ teamIndex, sorted, avgSkillLevel }) => ({
    id: `${tournamentId}-team-${teamIndex + 1}`,
    tournamentId,
    teamIndex,
    teamName: `TEAM ${teamIndex + 1}`,
    groupId: groupOf.get(teamIndex)!,
    captainUid: sorted[0]?.uid || "",
    avgSkillLevel: Math.round(avgSkillLevel * 10) / 10,
    members: sorted.map(m => ({
      uid: m.uid,
      steamName: m.steamName || "",
      steamAvatar: m.steamAvatar || "",
      skillLevel: m.skillLevel || 1,
      cs2RankTier: m.cs2RankTier || 0,
    })),
  }));

  // ── Group-stage schedule + play-off placeholders ────────────────────────
  // Only meaningful when groups are exactly 4 teams (the round-robin table
  // below is hardcoded for that) — larger/uneven groups still get teams
  // formed above, just no auto-generated schedule (flagged via `warning`).
  const teamsPerGroup = teamCount / groupCount;
  const canGenerateSchedule = Number.isInteger(teamsPerGroup) && teamsPerGroup === 4;
  const matchDocs: any[] = [];

  if (canGenerateSchedule) {
    let matchIndex = 0;
    for (let g = 0; g < groupCount; g++) {
      const label = groupLabel(g);
      const groupTeams = teams.filter(tm => tm.groupId === label);
      ROUND_ROBIN_4.forEach((round, roundIdx) => {
        round.forEach(([i, j]) => {
          matchIndex++;
          matchDocs.push({
            id: `${tournamentId}-g${label.toLowerCase()}-r${roundIdx + 1}-m${matchIndex}`,
            tournamentId,
            groupId: label,
            team1Id: groupTeams[i].id, team1Name: groupTeams[i].teamName,
            team2Id: groupTeams[j].id, team2Name: groupTeams[j].teamName,
            team1Score: 0, team2Score: 0,
            matchDay: roundIdx + 1,
            matchIndex,
            isBracket: false,
            status: "pending",
          });
        });
      });
    }
    // Play-off placeholders — fixed ids, matched by
    // api/admin/cs2-manual-result's maybeSeedCS2Semifinals/Final. Best-of is
    // read from the tournament doc's bracketBestOf/grandFinalBestOf at
    // render time, not stored per-match.
    matchDocs.push(
      { id: "cs2-sf1", tournamentId, bracketType: "winners", bracketLabel: "SF1", matchIndex: matchIndex + 1, team1Id: "TBD", team2Id: "TBD", team1Name: "TBD", team2Name: "TBD", team1Score: 0, team2Score: 0, matchDay: 4, isBracket: true, status: "pending" },
      { id: "cs2-sf2", tournamentId, bracketType: "winners", bracketLabel: "SF2", matchIndex: matchIndex + 2, team1Id: "TBD", team2Id: "TBD", team1Name: "TBD", team2Name: "TBD", team1Score: 0, team2Score: 0, matchDay: 4, isBracket: true, status: "pending" },
      { id: "cs2-final", tournamentId, bracketType: "grand_final", bracketLabel: "FINAL", matchIndex: matchIndex + 3, team1Id: "TBD", team2Id: "TBD", team1Name: "TBD", team2Name: "TBD", team1Score: 0, team2Score: 0, matchDay: 5, isBracket: true, status: "pending" },
    );
  }

  const warning = leftover.length > 0
    ? `${leftover.length} registrant(s) left over (not a multiple of ${playersPerTeam}) — unassigned, still registered.`
    : !canGenerateSchedule
    ? `${teamCount} teams / ${groupCount} groups doesn't divide into groups of 4 — teams were formed but no schedule was generated.`
    : undefined;

  if (dryRun) {
    return {
      success: true, dryRun: true, seed,
      totalPlayers: players.length, teamCount, groupCount,
      teams, matchesGenerated: matchDocs.length, warning,
    };
  }

  const teamsCol = tref.collection("teams");
  if (opts.deleteExisting) {
    const delBatch = db.batch();
    const existingTeams = await teamsCol.get();
    existingTeams.docs.forEach(d => delBatch.delete(d.ref));
    for (const sub of ["matches", "standings", "leaderboard"]) {
      const ss = await tref.collection(sub).get();
      ss.docs.forEach(d => delBatch.delete(d.ref));
    }
    await delBatch.commit();
  }

  const writeBatch = db.batch();
  const nowIso = new Date().toISOString();
  for (const team of teams) writeBatch.set(teamsCol.doc(team.id), { ...team, createdAt: nowIso });
  for (const m of matchDocs) writeBatch.set(tref.collection("matches").doc(m.id), m);
  writeBatch.set(tref, {
    teamsGenerated: true,
    teamCount, groupCount,
    teamsGeneratedAt: nowIso,
    teamsShuffleSeed: seed,
  }, { merge: true });
  await writeBatch.commit();

  return {
    success: true, dryRun: false, seed,
    totalPlayers: players.length, teamCount, groupCount,
    teams, matchesGenerated: matchDocs.length, warning,
  };
}

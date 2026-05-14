import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { isNotAdmin } from "@/lib/checkAdmin";
import { DOTA_ROLES, type DotaRole } from "@/lib/types";

/**
 * POST /api/dota/shuffle-teams
 *
 * Role-aware MMR-balanced shuffle for Dota 2 tournaments.
 *
 * Body:
 *   adminKey          — ADMIN_SECRET or Firebase ID token
 *   tournamentId      — the Dota 2 tournament id
 *   teamCount?        — number of teams (default: floor(N/5))
 *   dryRun?           — true (default): return preview only, no writes
 *   deleteExisting?   — false (default): on commit, wipe previously generated
 *                       shuffle teams for this tournament before writing
 *
 * Response (mirrors /api/valorant/shuffle-teams so the same admin UI works):
 *   { success, dryRun, totalPlayers, teamCount, teams[], balance }
 *
 * Algorithm:
 *   1. Count how many players prefer each of the 5 positions.
 *   2. Sort positions by rarity ascending (rarest first) so scarce roles
 *      get priority on assignment.
 *   3. Snake-draft each position: take all eligible/unassigned players,
 *      sort by MMR desc, walk the snake order (1..M, M..1, …) placing one
 *      per team. This balances stars across teams while respecting roles.
 *   4. Any leftover players fill open slots — preferring teams that still
 *      need one of the player's preferred roles.
 *   5. Balance pass: try 1-for-1 swaps that preserve role coverage and
 *      reduce the team-avg MMR spread.
 */

const POSITIONS: DotaRole[] = ["safe_lane", "mid", "off_lane", "soft_support", "hard_support"];
const ROLE_LABEL: Record<DotaRole, string> = Object.fromEntries(
  DOTA_ROLES.map(r => [r.slug, r.label])
) as Record<DotaRole, string>;

const DOTA_MEDALS = ["Unranked", "Herald", "Guardian", "Crusader", "Archon", "Legend", "Ancient", "Divine", "Immortal"];
function dotaRankName(tier: number): string {
  if (!tier || tier <= 0) return "Unranked";
  const medal = Math.floor(tier / 10);
  const stars = tier % 10;
  if (medal < 1 || medal > 8) return "Unranked";
  return `${DOTA_MEDALS[medal]}${stars > 0 ? ` ${stars}` : ""}`;
}

type Player = {
  id: string;
  uid: string;
  fullName?: string;
  steamName?: string;
  steamAvatar?: string;
  dotaMMR?: number;
  dotaRankTier?: number;
  dotaBracket?: string;
  rolePreferences?: DotaRole[];
  discordId?: string;
  discordUsername?: string;
  registeredAt?: string;
};

type AssignedMember = Player & { assignedRole: DotaRole | "flex" };

type TeamSlot = {
  members: AssignedMember[];
  coverage: Partial<Record<DotaRole, boolean>>;
};

// Player skill score. Rank tier is the primary signal (0-80, where each
// medal step is 10: Herald 1 = 11, Divine 4 = 74, Immortal = 80). MMR
// (when OpenDota actually returns it — rare) is a small tiebreaker.
function memberScore(m: { dotaRankTier?: number; dotaMMR?: number }): number {
  return (m.dotaRankTier || 0) * 100 + Math.min(m.dotaMMR || 0, 99);
}

function teamTotalScore(t: TeamSlot): number {
  return t.members.reduce((a, m) => a + memberScore(m), 0);
}

function teamAvgTier(t: TeamSlot): number {
  if (t.members.length === 0) return 0;
  return t.members.reduce((a, m) => a + (m.dotaRankTier || 0), 0) / t.members.length;
}

// How many of the 5 canonical positions are missing across all teams
// (summed). Smaller = better role coverage.
function totalMissingRoles(teams: TeamSlot[]): number {
  let sum = 0;
  for (const t of teams) {
    for (const r of POSITIONS) if (!t.coverage[r]) sum++;
  }
  return sum;
}

// Cost of one team having a missing role, expressed in tier-points so it
// composes with the tier-spread metric. A swap that fills a position is
// worth roughly 6 tier points of imbalance — strong enough that the
// refiner prefers full coverage but doesn't go nuts if some role is
// genuinely unfillable (e.g. only 2 players prefer Hard Support).
const COVERAGE_PENALTY = 6;

// Combined "badness" metric — what the algorithm minimises. Tier spread
// + a heavy multiplier on missing roles. Used by the refinement step to
// decide whether a swap is an improvement.
function spread(teams: TeamSlot[]): number {
  if (teams.length === 0) return 0;
  const avgs = teams.map(teamAvgTier);
  const tierSpread = Math.max(...avgs) - Math.min(...avgs);
  return tierSpread + COVERAGE_PENALTY * totalMissingRoles(teams);
}

// Seeded PRNG (mulberry32) so the algorithm is deterministic per seed
// but produces different layouts when the caller supplies a new seed.
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

function stdDev(nums: number[]): number {
  if (nums.length === 0) return 0;
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  const variance = nums.reduce((a, b) => a + (b - mean) ** 2, 0) / nums.length;
  return Math.sqrt(variance);
}

// Can two players swap teams while preserving role coverage? Each needs
// to be able to play the other's currently-assigned role (or that role
// is "flex" which anyone can fill).
function canSwap(pa: AssignedMember, pb: AssignedMember): boolean {
  const paOk = pb.assignedRole === "flex" || (pa.rolePreferences || []).includes(pb.assignedRole as DotaRole);
  const pbOk = pa.assignedRole === "flex" || (pb.rolePreferences || []).includes(pa.assignedRole as DotaRole);
  return paOk && pbOk;
}

function shuffleByRolesAndRating(players: Player[], numTeams: number, seed: number): TeamSlot[] {
  const rng = makeRng(seed);
  const teams: TeamSlot[] = Array.from({ length: numTeams }, () => ({ members: [], coverage: {} }));

  // PHASE 1 — Bipartite matching for HARD role coverage.
  //
  // Treat (team, role) as 20 slots (4 teams × 5 roles). Each player has
  // edges to the slots they can fill (role ∈ rolePreferences). Find the
  // maximum matching via DFS augmenting paths — if a perfect matching
  // exists in the bipartite graph (i.e. Hall's condition holds), every
  // team gets exactly one player at every position.
  //
  // Why this is necessary: a position-first or player-first greedy can
  // consume multi-role players for early positions and leave a later
  // position without enough candidates (e.g. all the off-laners got
  // grabbed for safe/mid first). Matching considers all assignments
  // simultaneously and uses augmenting paths to repair conflicts.
  //
  // Players are processed in tier desc (with seeded RNG tiebreaks) so
  // the top players hit augmenting first, biasing the matching toward
  // giving them their natural slot. Tier BALANCE is then optimised in
  // phase 2 by swaps that preserve coverage.
  const slots: { team: number; role: DotaRole }[] = [];
  for (let t = 0; t < numTeams; t++) {
    for (const r of POSITIONS) slots.push({ team: t, role: r });
  }
  const edges: number[][] = players.map(p => {
    const prefs = (p.rolePreferences || []) as DotaRole[];
    const list: number[] = [];
    for (let s = 0; s < slots.length; s++) if (prefs.includes(slots[s].role)) list.push(s);
    // Randomise edge order so each seed explores a different matching
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  });
  const slotToPlayer = new Array<number>(slots.length).fill(-1);
  const playerToSlot = new Array<number>(players.length).fill(-1);

  function tryAugment(pIdx: number, visited: boolean[]): boolean {
    for (const sIdx of edges[pIdx]) {
      if (visited[sIdx]) continue;
      visited[sIdx] = true;
      if (slotToPlayer[sIdx] === -1 || tryAugment(slotToPlayer[sIdx], visited)) {
        slotToPlayer[sIdx] = pIdx;
        playerToSlot[pIdx] = sIdx;
        return true;
      }
    }
    return false;
  }

  const order = players.map((_, i) => i).sort((a, b) => {
    const s = memberScore(players[b]) - memberScore(players[a]);
    if (s !== 0) return s;
    return rng() - 0.5;
  });
  for (const pIdx of order) {
    tryAugment(pIdx, new Array<boolean>(slots.length).fill(false));
  }

  // Materialise teams from the matching
  for (let pIdx = 0; pIdx < players.length; pIdx++) {
    const sIdx = playerToSlot[pIdx];
    if (sIdx < 0) continue;
    const slot = slots[sIdx];
    teams[slot.team].members.push({ ...players[pIdx], assignedRole: slot.role });
    teams[slot.team].coverage[slot.role] = true;
  }

  // Unmatched players (no role they prefer is unfilled) fall in as flex
  // on the weakest team that still has an open seat. This only triggers
  // when the bipartite matching can't perfect — usually one position is
  // grossly oversubscribed so a player with that single pref has no
  // free slot.
  for (let pIdx = 0; pIdx < players.length; pIdx++) {
    if (playerToSlot[pIdx] !== -1) continue;
    const openTeams = teams.filter(t => t.members.length < 5);
    if (openTeams.length === 0) break;
    const openSorted = openTeams.sort((a, b) => {
      const s = teamTotalScore(a) - teamTotalScore(b);
      if (s !== 0) return s;
      return rng() - 0.5;
    });
    const prefs = (players[pIdx].rolePreferences || []) as DotaRole[];
    const role: DotaRole | "flex" = (prefs[0] as DotaRole) || "flex";
    openSorted[0].members.push({ ...players[pIdx], assignedRole: role });
  }

  // PHASE 2 — Steepest-descent swap refinement.
  //
  // Scan every legal pair-swap. Pick the swap that REDUCES the combined
  // spread metric (tier spread + coverage-penalty × missing roles) the
  // most. Apply it; loop. Stops when no swap improves. Coverage-aware
  // because the metric heavily penalises missing roles, so swaps that
  // happen to fill an uncovered position are favoured even if they
  // slightly worsen tier spread.
  for (let iter = 0; iter < 300; iter++) {
    const before = spread(teams);
    let bestSwap: { i: number; j: number; a: number; b: number; after: number } | null = null;

    for (let i = 0; i < teams.length; i++) {
      for (let j = i + 1; j < teams.length; j++) {
        for (let a = 0; a < teams[i].members.length; a++) {
          for (let b = 0; b < teams[j].members.length; b++) {
            const pa = teams[i].members[a];
            const pb = teams[j].members[b];
            if (!canSwap(pa, pb)) continue;

            // Simulate swap (assignedRole stays with the slot, not the
            // player, so coverage flags are unchanged across swap).
            teams[i].members[a] = { ...pb, assignedRole: pa.assignedRole };
            teams[j].members[b] = { ...pa, assignedRole: pb.assignedRole };
            const after = spread(teams);
            // Revert
            teams[i].members[a] = pa;
            teams[j].members[b] = pb;

            if (after < before - 0.01) {
              if (!bestSwap || after < bestSwap.after) {
                bestSwap = { i, j, a, b, after };
              }
            }
          }
        }
      }
    }

    if (!bestSwap) break;

    const { i, j, a, b } = bestSwap;
    const pa = teams[i].members[a];
    const pb = teams[j].members[b];
    teams[i].members[a] = { ...pb, assignedRole: pa.assignedRole };
    teams[j].members[b] = { ...pa, assignedRole: pb.assignedRole };
  }

  return teams;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      adminKey,
      tournamentId,
      teamCount,
      dryRun = true,
      deleteExisting = false,
      seed: seedInput,
    } = body as {
      adminKey?: string;
      tournamentId?: string;
      teamCount?: number;
      dryRun?: boolean;
      deleteExisting?: boolean;
      seed?: number;
    };

    // If caller supplies a seed (e.g. the admin re-publishing a preview),
    // use it verbatim so the published teams match the preview byte-for-byte.
    // Otherwise generate a fresh 32-bit seed so each preview click gives
    // a different (but well-balanced) shuffle.
    const seed = (typeof seedInput === "number" && Number.isFinite(seedInput))
      ? Math.floor(seedInput) >>> 0
      : (Math.floor(Math.random() * 0x100000000) >>> 0);

    if (!adminKey) return NextResponse.json({ error: "Missing admin key" }, { status: 400 });
    if (await isNotAdmin(adminKey)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!tournamentId) return NextResponse.json({ error: "Missing tournamentId" }, { status: 400 });

    // 1. Tournament must exist in the Dota 2 collection.
    const tRef = adminDb.collection("tournaments").doc(tournamentId);
    const tSnap = await tRef.get();
    if (!tSnap.exists) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }
    const tournamentData = tSnap.data() || {};

    // 2. Pull registered players.
    const playersSnap = await tRef.collection("players").get();
    const players: Player[] = playersSnap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Player, "id">) }));
    if (players.length < 5) {
      return NextResponse.json({
        error: `Need at least 5 registered players to shuffle (got ${players.length})`,
      }, { status: 400 });
    }

    // 3. Decide team count.
    const requestedN = teamCount && teamCount > 0 ? teamCount : Math.floor(players.length / 5);
    const numTeams = Math.max(1, Math.min(requestedN, Math.floor(players.length / 5)));
    if (numTeams < 1) {
      return NextResponse.json({ error: "Not enough players for at least one team" }, { status: 400 });
    }

    // 4. Run the algorithm.
    const teamSlots = shuffleByRolesAndRating(players, numTeams, seed);

    // 5. Build the response in the shape the admin UI already consumes.
    //    Admin renders Valorant-style fields (riotTier/riotRank/riotAvatar/
    //    iesportsRating/avgSkillLevel), so we surface Dota equivalents under
    //    those same names. Each member is duplicated under both name sets so
    //    the tournament-detail UI (which reads dota*) and the admin Preview
    //    UI (which reads riot*) both work without conditionals.
    const responseTeams = teamSlots.map((t, i) => {
      const totalMMR = t.members.reduce((a, m) => a + (m.dotaMMR || 0), 0);
      const avgMMR = t.members.length > 0 ? Math.round(totalMMR / t.members.length) : 0;
      const totalTier = t.members.reduce((a, m) => a + (m.dotaRankTier || 0), 0);
      const avgTier = t.members.length > 0 ? Math.round((totalTier / t.members.length) * 10) / 10 : 0;
      // Sort members by MMR desc (per spec) — tiebreak by rank-tier desc,
      // then by name so the order is deterministic across previews.
      const sorted = [...t.members].sort((a, b) => {
        const m = (b.dotaMMR || 0) - (a.dotaMMR || 0);
        if (m !== 0) return m;
        const r = (b.dotaRankTier || 0) - (a.dotaRankTier || 0);
        if (r !== 0) return r;
        return String(a.steamName || "").localeCompare(String(b.steamName || ""));
      });
      // Captain: highest-MMR member of the team.
      const captainMember = sorted[0];
      // Bracket: most common bracket among members.
      const bracketCounts: Record<string, number> = {};
      for (const m of t.members) {
        const b = m.dotaBracket || "herald_guardian";
        bracketCounts[b] = (bracketCounts[b] || 0) + 1;
      }
      const topBracket = Object.entries(bracketCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "herald_guardian";

      return {
        id: `team-${i + 1}`,
        tournamentId,
        teamIndex: i + 1,
        teamName: `TEAM ${i + 1}`,
        captainUid: captainMember?.uid || "",
        bracket: topBracket,
        avgMMR,
        totalMMR,
        avgRankTier: avgTier,
        avgSkillLevel: avgMMR,        // admin UI compat (reads avgSkillLevel)
        roleCoverage: {
          safe_lane:    !!t.coverage.safe_lane,
          mid:          !!t.coverage.mid,
          off_lane:     !!t.coverage.off_lane,
          soft_support: !!t.coverage.soft_support,
          hard_support: !!t.coverage.hard_support,
        },
        members: sorted.map(m => {
          const rankName = dotaRankName(m.dotaRankTier || 0);
          return {
            uid: m.uid,
            fullName: m.fullName || "",
            steamName: m.steamName || "",
            steamAvatar: m.steamAvatar || "",
            dotaMMR: m.dotaMMR || 0,
            dotaRankTier: m.dotaRankTier || 0,
            dotaBracket: m.dotaBracket || "herald_guardian",
            rolePreferences: m.rolePreferences || [],
            assignedRole: m.assignedRole,
            assignedRoleLabel: POSITIONS.includes(m.assignedRole as DotaRole)
              ? ROLE_LABEL[m.assignedRole as DotaRole]
              : "Flex",
            discordId: m.discordId || "",
            discordUsername: m.discordUsername || "",
            // ── Valorant-compat aliases so the admin Preview UI shows ranks
            //    + MMR without any game branching.
            riotGameName: m.steamName || m.fullName || "Player",  // primary display name
            riotTagLine: "",
            riotAvatar: m.steamAvatar || "",
            riotRank: rankName,
            riotTier: m.dotaRankTier || 0,
            iesportsRank: rankName,
            iesportsTier: m.dotaRankTier || 0,
            iesportsRating: m.dotaMMR || 0,
            skillLevel: m.dotaMMR || 0,
          };
        }),
      };
    });

    // Balance metrics (based on rank-tier averages — what admins see in the
    // preview, and what the algorithm itself optimises).
    const tierAvgs = teamSlots.map(teamAvgTier);
    const balance = {
      spread: Math.round((Math.max(...tierAvgs) - Math.min(...tierAvgs)) * 10) / 10,
      stdDev: Math.round(stdDev(tierAvgs) * 10) / 10,
      mean: Math.round((tierAvgs.reduce((a, b) => a + b, 0) / tierAvgs.length) * 10) / 10,
    };

    if (dryRun) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        seed,
        totalPlayers: players.length,
        teamCount: numTeams,
        teams: responseTeams,
        balance,
        note: `${players.filter(p => !p.rolePreferences || p.rolePreferences.length === 0).length} player(s) have not picked roles yet — they were assigned as flex.`,
      });
    }

    // 6. Commit: write to BOTH `tournaments/{id}/teams/{teamId}` subcollection
    //    (what the tournament-detail UI reads) AND, optionally, mirror to the
    //    global `teams/` collection if desired later. We keep it tight here.
    const teamsCol = tRef.collection("teams");

    if (deleteExisting) {
      const existing = await teamsCol.get();
      const delBatch = adminDb.batch();
      existing.docs.forEach(d => delBatch.delete(d.ref));
      // Tournament-wipe also clears matches/standings/leaderboard for shuffle reset.
      const sub = ["matches", "standings", "leaderboard"];
      for (const sc of sub) {
        const ss = await tRef.collection(sc).get();
        ss.docs.forEach(d => delBatch.delete(d.ref));
      }
      await delBatch.commit();
    }

    const writeBatch = adminDb.batch();
    for (const team of responseTeams) {
      const ref = teamsCol.doc(team.id);
      writeBatch.set(ref, {
        ...team,
        createdAt: new Date().toISOString(),
      });
    }
    writeBatch.update(tRef, {
      teamsGenerated: true,
      teamCount: numTeams,
      teamsGeneratedAt: new Date().toISOString(),
      teamsShuffleSeed: seed,
    });
    void tournamentData;
    await writeBatch.commit();

    return NextResponse.json({
      success: true,
      dryRun: false,
      seed,
      totalPlayers: players.length,
      teamCount: numTeams,
      teams: responseTeams,
      balance,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

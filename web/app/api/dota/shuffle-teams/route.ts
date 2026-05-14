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

// Snake-draft picking order, e.g. for M=4: 0,1,2,3,3,2,1,0,0,1,2,3,...
function snakeOrder(M: number, length: number): number[] {
  const out: number[] = [];
  let dir = 1;
  let pos = 0;
  while (out.length < length) {
    out.push(pos);
    if (dir === 1 && pos === M - 1) {
      dir = -1;
    } else if (dir === -1 && pos === 0) {
      dir = 1;
    } else {
      pos += dir;
    }
  }
  return out;
}

function avgMMR(t: TeamSlot): number {
  if (t.members.length === 0) return 0;
  return t.members.reduce((a, m) => a + (m.dotaMMR || 0), 0) / t.members.length;
}

function spread(teams: TeamSlot[]): number {
  if (teams.length === 0) return 0;
  const avgs = teams.map(avgMMR);
  return Math.max(...avgs) - Math.min(...avgs);
}

function stdDev(nums: number[]): number {
  if (nums.length === 0) return 0;
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  const variance = nums.reduce((a, b) => a + (b - mean) ** 2, 0) / nums.length;
  return Math.sqrt(variance);
}

function shuffleByRolesAndMMR(players: Player[], numTeams: number): TeamSlot[] {
  const teams: TeamSlot[] = Array.from({ length: numTeams }, () => ({ members: [], coverage: {} }));
  const assigned = new Set<string>();

  // 1. Count role interest
  const roleCount: Record<DotaRole, number> = {
    safe_lane: 0, mid: 0, off_lane: 0, soft_support: 0, hard_support: 0,
  };
  for (const p of players) {
    for (const r of (p.rolePreferences || [])) {
      if (POSITIONS.includes(r as DotaRole)) roleCount[r as DotaRole]++;
    }
  }

  // 2. Sort positions by rarity ascending (rarest first)
  const orderedRoles: DotaRole[] = [...POSITIONS].sort((a, b) => roleCount[a] - roleCount[b]);

  // 3. For each role, snake-draft the top eligible players to teams.
  for (const role of orderedRoles) {
    const candidates = players
      .filter(p => !assigned.has(p.uid) && (p.rolePreferences || []).includes(role))
      .sort((a, b) => (b.dotaMMR || 0) - (a.dotaMMR || 0));

    if (candidates.length === 0) continue;

    // Snake-draft order, skipping teams that already have this role filled
    const order = snakeOrder(numTeams, Math.max(numTeams * 3, candidates.length));
    let oi = 0;
    for (const p of candidates) {
      while (oi < order.length && (teams[order[oi]].coverage[role] || teams[order[oi]].members.length >= 5)) {
        oi++;
      }
      if (oi >= order.length) break; // can't place; remaining candidates fall to phase 4
      const ti = order[oi];
      teams[ti].members.push({ ...p, assignedRole: role });
      teams[ti].coverage[role] = true;
      assigned.add(p.uid);
      oi++;
    }
  }

  // 4. Fill leftover slots: pick teams with open seats, preferring those
  //    that still need one of the player's preferred roles.
  const remaining = players
    .filter(p => !assigned.has(p.uid))
    .sort((a, b) => (b.dotaMMR || 0) - (a.dotaMMR || 0));

  for (const p of remaining) {
    const openTeams = teams
      .map((t, i) => ({ i, t }))
      .filter(x => x.t.members.length < 5);
    if (openTeams.length === 0) break;

    const playerRoles = (p.rolePreferences || []) as DotaRole[];
    // Prefer a team where they fill an uncovered preferred role
    let best = openTeams.find(x => playerRoles.some(r => !x.t.coverage[r]));
    // Otherwise prefer the smallest team (least filled)
    if (!best) best = openTeams.sort((a, b) => a.t.members.length - b.t.members.length)[0];

    const fillRole: DotaRole | "flex" =
      (playerRoles.find(r => !best!.t.coverage[r]) as DotaRole | undefined) ||
      (playerRoles[0] as DotaRole | undefined) ||
      "flex";
    best.t.members.push({ ...p, assignedRole: fillRole });
    if (POSITIONS.includes(fillRole as DotaRole)) best.t.coverage[fillRole as DotaRole] = true;
    assigned.add(p.uid);
  }

  // 5. Balance pass: try 1-for-1 swaps that preserve role coverage and
  //    reduce the team-avg MMR spread. Bounded iterations so we never
  //    burn time on degenerate inputs.
  for (let iter = 0; iter < 200; iter++) {
    let improved = false;
    const before = spread(teams);
    outer:
    for (let i = 0; i < teams.length; i++) {
      for (let j = i + 1; j < teams.length; j++) {
        for (let a = 0; a < teams[i].members.length; a++) {
          for (let b = 0; b < teams[j].members.length; b++) {
            const pa = teams[i].members[a];
            const pb = teams[j].members[b];
            const paRole = pa.assignedRole;
            const pbRole = pb.assignedRole;
            // Can each play the other's assigned role? (or "flex" — anything goes)
            const paOk = pbRole === "flex" || (pa.rolePreferences || []).includes(pbRole as DotaRole);
            const pbOk = paRole === "flex" || (pb.rolePreferences || []).includes(paRole as DotaRole);
            if (!paOk || !pbOk) continue;

            teams[i].members[a] = { ...pb, assignedRole: paRole };
            teams[j].members[b] = { ...pa, assignedRole: pbRole };
            const after = spread(teams);
            if (after < before - 1) {
              improved = true;
              break outer;
            }
            // Revert
            teams[i].members[a] = pa;
            teams[j].members[b] = pb;
          }
        }
      }
    }
    if (!improved) break;
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
    } = body as {
      adminKey?: string;
      tournamentId?: string;
      teamCount?: number;
      dryRun?: boolean;
      deleteExisting?: boolean;
    };

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
    const teamSlots = shuffleByRolesAndMMR(players, numTeams);

    // 5. Build the response in the shape the admin UI already consumes.
    const responseTeams = teamSlots.map((t, i) => {
      const avgs = t.members.reduce((a, m) => a + (m.dotaMMR || 0), 0);
      // Sort members by canonical position order (Pos 1 → Pos 5) for readable preview.
      const sorted = [...t.members].sort((a, b) => {
        const ai = POSITIONS.indexOf(a.assignedRole as DotaRole);
        const bi = POSITIONS.indexOf(b.assignedRole as DotaRole);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      });
      // Captain: highest-MMR member of the team.
      const captainMember = [...t.members].sort((a, b) => (b.dotaMMR || 0) - (a.dotaMMR || 0))[0];
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
        avgMMR: t.members.length > 0 ? Math.round(avgs / t.members.length) : 0,
        totalMMR: avgs,
        avgSkillLevel: t.members.length > 0 ? Math.round(avgs / t.members.length) : 0,  // UI compat key
        roleCoverage: {
          safe_lane:    !!t.coverage.safe_lane,
          mid:          !!t.coverage.mid,
          off_lane:     !!t.coverage.off_lane,
          soft_support: !!t.coverage.soft_support,
          hard_support: !!t.coverage.hard_support,
        },
        members: sorted.map(m => ({
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
        })),
      };
    });

    // Balance metrics.
    const avgs = teamSlots.map(avgMMR);
    const balance = {
      spread: Math.max(...avgs) - Math.min(...avgs),
      stdDev: stdDev(avgs),
      mean: avgs.reduce((a, b) => a + b, 0) / avgs.length,
    };

    if (dryRun) {
      return NextResponse.json({
        success: true,
        dryRun: true,
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
    });
    void tournamentData;
    await writeBatch.commit();

    return NextResponse.json({
      success: true,
      dryRun: false,
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

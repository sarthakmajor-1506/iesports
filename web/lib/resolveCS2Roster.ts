import type { Firestore } from "firebase-admin/firestore";

/**
 * Shared roster-resolution logic between the match-config endpoint MatchZy
 * fetches (web/app/api/cs2/match-config/[matchId]/route.ts) and the admin
 * panel's "Validate Rosters" action (web/app/api/admin/cs2-server route,
 * action:"validate_roster"). One implementation so a roster that validates
 * clean in the panel can never fail differently when MatchZy actually loads
 * the match.
 *
 * CS2Team.members[] carries no steamId (see lib/types.ts) — resolve each
 * member's Steam64 from soloPlayers/{uid}.steamId, falling back to
 * users/{uid}.steamId.
 */

export interface CS2RosterResolution {
  ok: boolean;
  error?: string;
  missing?: Array<{ uid: string; steamName?: string }>;
  team1?: any;
  team2?: any;
  team1Players?: Record<string, string>;
  team2Players?: Record<string, string>;
  tournament?: any;
  match?: any;
}

export async function resolveCS2Roster(
  db: Firestore,
  tournamentId: string,
  matchId: string,
): Promise<CS2RosterResolution> {
  const tRef = db.collection("cs2Tournaments").doc(tournamentId);
  const matchRef = tRef.collection("matches").doc(matchId);
  const [tSnap, mSnap] = await Promise.all([tRef.get(), matchRef.get()]);
  if (!tSnap.exists || !mSnap.exists) return { ok: false, error: "tournament or match not found" };

  const tournament: any = tSnap.data();
  const m: any = mSnap.data();

  if (m.team1Id === "TBD" || m.team2Id === "TBD" || !m.team1Id || !m.team2Id) {
    return { ok: false, error: "teams not yet seeded for this match" };
  }

  const [team1Snap, team2Snap] = await Promise.all([
    tRef.collection("teams").doc(m.team1Id).get(),
    tRef.collection("teams").doc(m.team2Id).get(),
  ]);
  if (!team1Snap.exists || !team2Snap.exists) return { ok: false, error: "team roster not found" };
  const team1: any = team1Snap.data();
  const team2: any = team2Snap.data();

  const missing: Array<{ uid: string; steamName?: string }> = [];
  const resolveOne = async (team: any) => {
    const members: Array<{ uid: string; steamName?: string }> = team.members || [];
    const players: Record<string, string> = {};
    await Promise.all(members.map(async (mem) => {
      const [soloSnap, userSnap] = await Promise.all([
        tRef.collection("soloPlayers").doc(mem.uid).get(),
        db.collection("users").doc(mem.uid).get(),
      ]);
      const steamId = soloSnap.data()?.steamId || userSnap.data()?.steamId;
      if (!steamId) {
        missing.push({ uid: mem.uid, steamName: mem.steamName });
        return;
      }
      players[String(steamId)] = mem.steamName || userSnap.data()?.steamName || "player";
    }));
    return players;
  };

  const [team1Players, team2Players] = await Promise.all([resolveOne(team1), resolveOne(team2)]);

  if (missing.length > 0) {
    return { ok: false, error: "one or more rostered players have no linked Steam64", missing };
  }

  return { ok: true, team1, team2, team1Players, team2Players, tournament, match: m };
}

import { isNotAdmin } from "@/lib/checkAdmin";
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

/**
 * POST /api/valorant/match-find
 *
 * Looks up recent Valorant matches for team1's captain via Henrik and returns
 * the matches where both team1 and team2 rosters were present — so the admin
 * doesn't have to paste a match UUID. Admin reviews the preview in the UI and
 * then calls /api/valorant/match-fetch with the chosen match ID to commit.
 *
 * Writes nothing. Read-only discovery.
 *
 * Input: { tournamentId, adminKey, matchDocId, region?, beforeTimestamp?,
 *          afterTimestamp?, size? }
 *   beforeTimestamp: ISO string — only consider matches started strictly
 *     before this time. Useful when fetching Game 1 but Game 2 has
 *     already been played (pass Game 2's startedAt).
 *   afterTimestamp:  ISO string — only consider matches started strictly
 *     after this time. Useful when fetching Game 2+ in a series — pass
 *     the previous game's startedAt so the previous game isn't re-picked.
 *
 * Output (success): { found: true, candidates: [{ matchId, map, mode, startedAt,
 *     team1RoundsWon, team2RoundsWon, team1Side, mvp, players[] }], historySource }
 * Output (no candidates): { found: false, reason, debug }
 */
export async function POST(req: NextRequest) {
  try {
    const { tournamentId, adminKey, matchDocId, region, beforeTimestamp, afterTimestamp, size } = await req.json();

    if (!tournamentId || !adminKey || !matchDocId) {
      return NextResponse.json(
        { error: "Missing fields: tournamentId, adminKey, matchDocId required" },
        { status: 400 }
      );
    }
    if (await isNotAdmin(adminKey)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const henrikKey = process.env.HENRIK_API_KEY;
    if (!henrikKey) {
      return NextResponse.json({ error: "HENRIK_API_KEY not configured" }, { status: 500 });
    }

    const matchRegion = region || "ap";
    const historySize = Math.max(3, Math.min(20, size || 10));

    // ─── Load match doc + both team rosters ─────────────────────────────
    const tournamentRef = adminDb.collection("valorantTournaments").doc(tournamentId);
    const matchRef = tournamentRef.collection("matches").doc(matchDocId);
    const matchDoc = await matchRef.get();
    if (!matchDoc.exists) {
      return NextResponse.json({ error: `Match doc '${matchDocId}' not found` }, { status: 404 });
    }
    const existingMatch = matchDoc.data()!;
    const team1Id = existingMatch.team1Id;
    const team2Id = existingMatch.team2Id;
    if (!team1Id || !team2Id) {
      return NextResponse.json({ error: "Match doc missing team1Id or team2Id" }, { status: 400 });
    }

    const [team1Doc, team2Doc] = await Promise.all([
      tournamentRef.collection("teams").doc(team1Id).get(),
      tournamentRef.collection("teams").doc(team2Id).get(),
    ]);
    const team1Members: any[] = team1Doc.exists ? (team1Doc.data()!.members || []) : [];
    const team2Members: any[] = team2Doc.exists ? (team2Doc.data()!.members || []) : [];

    // ─── Resolve PUUIDs: member object first, then user doc ────────────
    const resolvePuuids = async (members: any[]): Promise<Set<string>> => {
      const out = new Set<string>();
      for (const m of members) if (m?.riotPuuid) out.add(m.riotPuuid);
      if (out.size === 0) {
        const uids = members.map((m: any) => m?.uid).filter(Boolean) as string[];
        if (uids.length > 0) {
          const userDocs = await Promise.all(
            uids.map((uid) => adminDb.collection("users").doc(uid).get())
          );
          for (const d of userDocs) {
            const p = d.data()?.riotPuuid;
            if (p) out.add(p);
          }
        }
      }
      return out;
    };

    const [team1Puuids, team2Puuids] = await Promise.all([
      resolvePuuids(team1Members),
      resolvePuuids(team2Members),
    ]);

    if (team1Puuids.size === 0) {
      return NextResponse.json(
        { error: "No Riot PUUIDs found for team 1 — players must link Riot IDs first" },
        { status: 400 }
      );
    }
    if (team2Puuids.size === 0) {
      return NextResponse.json(
        { error: "No Riot PUUIDs found for team 2 — players must link Riot IDs first" },
        { status: 400 }
      );
    }

    // ─── Query Henrik match history for one team1 player ───────────────
    // Any single PUUID from team1 will surface the match in their history;
    // then we verify both rosters are on the scoreboard.
    const seedPuuid = Array.from(team1Puuids)[0];
    const platform = "pc";
    let historyData: any[] = [];
    let historySource = "v4";
    try {
      const v4Url = `https://api.henrikdev.xyz/valorant/v4/by-puuid/matches/${matchRegion}/${platform}/${seedPuuid}?size=${historySize}`;
      const v4Res = await fetch(v4Url, { headers: { Authorization: henrikKey } });
      if (v4Res.ok) {
        historyData = (await v4Res.json()).data || [];
      } else {
        throw new Error(`v4 status ${v4Res.status}`);
      }
    } catch {
      historySource = "v3";
      const v3Url = `https://api.henrikdev.xyz/valorant/v3/by-puuid/matches/${matchRegion}/${seedPuuid}?size=${historySize}`;
      const v3Res = await fetch(v3Url, { headers: { Authorization: henrikKey } });
      if (!v3Res.ok) {
        return NextResponse.json(
          { error: `Match history fetch failed: ${v3Res.status}. Retry in a few seconds.` },
          { status: 400 }
        );
      }
      historyData = (await v3Res.json()).data || [];
    }

    if (!historyData.length) {
      return NextResponse.json({
        found: false,
        reason: "No recent matches found for team 1's seed player",
        debug: { seedPuuid, team1PuuidCount: team1Puuids.size, team2PuuidCount: team2Puuids.size },
      });
    }

    // ─── Filter: matches where ≥4 players from each team played ────────
    const beforeMs = beforeTimestamp ? new Date(beforeTimestamp).getTime() : 0;
    const afterMs = afterTimestamp ? new Date(afterTimestamp).getTime() : 0;
    const extractRoundsWon = (t: any) =>
      t?.rounds_won ?? t?.roundsWon ?? t?.rounds?.won ?? 0;

    const candidates = historyData
      .map((md: any) => {
        const startedAtStr = md?.metadata?.started_at || md?.metadata?.game_start;
        const startedAtMs = startedAtStr ? new Date(startedAtStr).getTime() : 0;
        const players: any[] = md?.players?.all_players || md?.players || [];
        if (!Array.isArray(players)) return null;
        let t1Count = 0, t2Count = 0;
        for (const p of players) {
          if (team1Puuids.has(p?.puuid)) t1Count++;
          if (team2Puuids.has(p?.puuid)) t2Count++;
        }
        return { md, startedAtMs, startedAtStr, t1Count, t2Count, players };
      })
      .filter((c): c is NonNullable<typeof c> => !!c)
      .filter((c) => c.t1Count >= 4 && c.t2Count >= 4)
      .filter((c) => !beforeMs || !c.startedAtMs || c.startedAtMs < beforeMs)
      .filter((c) => !afterMs || !c.startedAtMs || c.startedAtMs > afterMs)
      .sort((a, b) => b.startedAtMs - a.startedAtMs);

    if (candidates.length === 0) {
      return NextResponse.json({
        found: false,
        reason: "No recent match found where both rosters played together",
        debug: {
          historyCount: historyData.length,
          seedPuuid,
          team1PuuidCount: team1Puuids.size,
          team2PuuidCount: team2Puuids.size,
          beforeMs: beforeMs || null,
          afterMs: afterMs || null,
          // Surface counts per history entry so admin can see why none matched
          matches: historyData.slice(0, 5).map((md: any) => {
            const players: any[] = md?.players?.all_players || md?.players || [];
            let t1 = 0, t2 = 0;
            for (const p of players) {
              if (team1Puuids.has(p?.puuid)) t1++;
              if (team2Puuids.has(p?.puuid)) t2++;
            }
            return {
              matchId: md?.metadata?.matchid || md?.metadata?.match_id || null,
              map: md?.metadata?.map?.name || md?.metadata?.map || "?",
              startedAt: md?.metadata?.started_at || null,
              team1Players: t1,
              team2Players: t2,
            };
          }),
        },
      });
    }

    // ─── Build preview for top candidates ──────────────────────────────
    const top = candidates.slice(0, 3).map(({ md, startedAtStr, t1Count, t2Count, players }) => {
      const matchId = md?.metadata?.matchid || md?.metadata?.match_id || null;
      const mapName = md?.metadata?.map?.name || md?.metadata?.map || "Unknown";
      const modeName = md?.metadata?.mode?.name || md?.metadata?.mode || "Unknown";

      // Resolve red/blue team objects (shape varies between v3/v4)
      let redTeamObj: any = null;
      let blueTeamObj: any = null;
      if (md.teams) {
        if (Array.isArray(md.teams)) {
          redTeamObj = md.teams.find((t: any) => (t.team_id || t.teamId || "").toLowerCase() === "red");
          blueTeamObj = md.teams.find((t: any) => (t.team_id || t.teamId || "").toLowerCase() === "blue");
        } else {
          redTeamObj = md.teams.red || md.teams.Red;
          blueTeamObj = md.teams.blue || md.teams.Blue;
        }
      }
      const redRoundsWon = extractRoundsWon(redTeamObj);
      const blueRoundsWon = extractRoundsWon(blueTeamObj);
      const totalRounds = redRoundsWon + blueRoundsWon;

      // Work out which Valorant side team1 played on
      let team1Side: "Red" | "Blue" | null = null;
      for (const p of players) {
        if (team1Puuids.has(p?.puuid)) {
          const raw = (p?.team_id || p?.team || "").toLowerCase();
          if (raw.includes("red")) team1Side = "Red";
          else if (raw.includes("blue")) team1Side = "Blue";
          if (team1Side) break;
        }
      }
      const team1RoundsWon = team1Side === "Red" ? redRoundsWon : team1Side === "Blue" ? blueRoundsWon : 0;
      const team2RoundsWon = team1Side === "Red" ? blueRoundsWon : team1Side === "Blue" ? redRoundsWon : 0;

      // Per-player preview incl. ACS so admin can sanity-check the scoreboard
      const playerPreviews = players.map((p: any) => {
        const score = p?.stats?.score || 0;
        const kills = p?.stats?.kills || 0;
        const deaths = p?.stats?.deaths || 0;
        const assists = p?.stats?.assists || 0;
        const acs = totalRounds > 0 ? Math.round(score / totalRounds) : score;
        const raw = (p?.team_id || p?.team || "").toLowerCase();
        const side = raw.includes("red") ? "Red" : raw.includes("blue") ? "Blue" : "?";
        const rosterTeam = team1Puuids.has(p?.puuid) ? "team1" : team2Puuids.has(p?.puuid) ? "team2" : "sub";
        return {
          puuid: p?.puuid,
          name: p?.name,
          tag: p?.tag,
          side,
          agent: p?.character || p?.agent?.name || "Unknown",
          kills, deaths, assists, acs,
          rosterTeam,
        };
      });

      const sorted = playerPreviews.slice().sort((a: any, b: any) => b.acs - a.acs);
      const mvp = sorted[0] || null;

      return {
        matchId,
        map: mapName,
        mode: modeName,
        startedAt: startedAtStr || null,
        team1Side,
        team1RoundsWon,
        team2RoundsWon,
        team1PlayersFound: t1Count,
        team2PlayersFound: t2Count,
        mvp: mvp ? { name: mvp.name, tag: mvp.tag, acs: mvp.acs, kills: mvp.kills, deaths: mvp.deaths, assists: mvp.assists, rosterTeam: mvp.rosterTeam } : null,
        players: playerPreviews,
      };
    });

    return NextResponse.json({
      found: true,
      candidates: top,
      candidateCount: candidates.length,
      historySource,
      historyScanned: historyData.length,
    });
  } catch (e: any) {
    console.error("[match-find] error:", e?.message);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}

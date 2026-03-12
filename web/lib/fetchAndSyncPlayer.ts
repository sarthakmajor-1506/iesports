// /lib/fetchAndSyncPlayer.ts
// Single reusable function — call from:
//   1. Steam callback (on link)
//   2. Solo tournament registration
//   3. Solo score refresh (leaderboard load)

import axios from "axios";
import { getRankBracket } from "./opendota";
import { calculatePlayerScore } from "./soloScoring";

type SyncOptions = {
  uid: string;
  steamId: string;
  db: FirebaseFirestore.Firestore;
  tournamentId?: string;
  tournamentStartTime?: number;
  tournamentEndTime?: number;  // ADD THIS
};

export async function fetchAndSyncPlayer({
  uid,
  steamId,
  db,
  tournamentId,
  tournamentStartTime,
  tournamentEndTime,  // ADD THIS
}: SyncOptions) {
  const steam32 = (BigInt(steamId) - BigInt("76561197960265728")).toString();

  // Fetch profile + recent matches in parallel
  const [profileRes, matchesRes] = await Promise.all([
    axios.get(`https://api.opendota.com/api/players/${steam32}`),
    axios.get(`https://api.opendota.com/api/players/${steam32}/recentMatches`),
  ]);

  const profile = profileRes.data;
  const matches = matchesRes.data;

  // ── 1. Update rank on user doc ────────────────────────────────────────
  const rankTier = profile.rank_tier || 0;
  const mmr = profile.mmr_estimate?.estimate || 0;
  const bracket = getRankBracket(rankTier);

  await db.collection("users").doc(uid).update({
    dotaRankTier: rankTier,
    dotaBracket: bracket,
    dotaMMR: mmr,
    recentMatches: (matches || []).slice(0, 20),
    rankFetchedAt: new Date(),
  });

  // ── 2. Append new matches to matchHistory subcollection ───────────────
  if (matches && matches.length > 0) {
    const batch = db.batch();
    const historyRef = db.collection("users").doc(uid).collection("matchHistory");

    // Use match_id as doc ID — set() is idempotent, no duplicate check needed
    for (const m of matches) {
      const docRef = historyRef.doc(String(m.match_id));
      batch.set(
        docRef,
        {
          matchId: m.match_id,
          heroId: m.hero_id,
          kills: m.kills,
          deaths: m.deaths,
          assists: m.assists,
          lastHits: m.last_hits,
          gpm: m.gold_per_min,
          xpm: m.xp_per_min,
          win: m.radiant_win === (m.player_slot < 128),
          startTime: m.start_time,
          duration: m.duration,
          gameMode: m.game_mode,
          lobbyType: m.lobby_type,
          playerSlot: m.player_slot,
          storedAt: new Date(),
        },
        { merge: true }
      );
    }
    await batch.commit();
  }

  // ── 3. If tournament context, calculate score + update player doc ─────
  let tournamentResult = null;
  if (tournamentId && tournamentStartTime !== undefined && matches?.length > 0) {
    const { totalScore, topMatches, matchesPlayed } = calculatePlayerScore(
      matches,
      tournamentStartTime,
      tournamentEndTime ?? Math.floor(Date.now() / 1000)  // fallback to now
    );

    await db
      .collection("soloTournaments")
      .doc(tournamentId)
      .collection("players")
      .doc(uid)
      .update({
        cachedScore: totalScore,
        cachedTopMatches: topMatches,
        matchesPlayed,
        lastUpdated: new Date().toISOString(),
      });

    tournamentResult = { totalScore, topMatches, matchesPlayed };
  }

  return { rankTier, bracket, mmr, tournamentResult };
}
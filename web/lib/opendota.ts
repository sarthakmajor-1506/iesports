import axios from "axios";

export function getRankBracket(rankTier: number): string {
  if (rankTier <= 25) return "herald_guardian";
  if (rankTier <= 45) return "crusader_archon";
  if (rankTier <= 65) return "legend_ancient";
  return "divine_immortal";
}

export function getBracketLabel(bracket: string): string {
  const labels: Record<string, string> = {
    herald_guardian: "Herald – Guardian",
    crusader_archon: "Crusader – Archon",
    legend_ancient:  "Legend – Ancient",
    divine_immortal: "Divine – Immortal",
  };
  return labels[bracket] || bracket;
}

export async function fetchAndStoreRank(uid: string, steamId: string, db: any) {
  try {
    // Convert Steam64 ID to Steam32 ID for OpenDota
    const steam32 = (BigInt(steamId) - BigInt("76561197960265728")).toString();

    // Fetch player profile + recent matches in parallel
    const [profileRes, matchesRes] = await Promise.all([
      axios.get(`https://api.opendota.com/api/players/${steam32}`),
      axios.get(`https://api.opendota.com/api/players/${steam32}/recentMatches`),
    ]);

    const profile = profileRes.data;
    const matches = matchesRes.data;
    console.log("Match sample:", JSON.stringify(matches[0], null, 2));
    console.log("Total matches returned:", matches.length);


    const rankTier = profile.rank_tier || 0;
    const bracket = getRankBracket(rankTier);
    const mmr = profile.mmr_estimate?.estimate || 0;

    // Calculate smurf risk from recent matches
    const smurfScore = calculateSmurfScore(matches, rankTier);

    // Store on user document
    await db.collection("users").doc(uid).update({
      dotaRankTier: rankTier,
      dotaBracket: bracket,
      dotaMMR: mmr,
      recentMatches: matches.slice(0, 20),
      smurfRiskScore: smurfScore,
      rankFetchedAt: new Date(),
    });

    return { rankTier, bracket, mmr, smurfScore };
  } catch (e: any) {
    throw new Error("Failed to fetch Dota rank from OpenDota: " + e.message);
  }
}

function calculateSmurfScore(matches: any[], rankTier: number): number {
  if (!matches || matches.length === 0) return 0;

  const avgLH = matches.reduce((a: number, m: any) => a + (m.last_hits || 0), 0) / matches.length;
  const avgGPM = matches.reduce((a: number, m: any) => a + (m.gold_per_min || 0), 0) / matches.length;
  const avgKDA = matches.reduce((a: number, m: any) => a + ((m.kills + m.assists) / Math.max(m.deaths, 1)), 0) / matches.length;
  const winRate = matches.filter((m: any) => m.radiant_win === (m.player_slot < 128)).length / matches.length;

  // Expected values for rank
  const expectedLH  = rankTier <= 25 ? 40  : rankTier <= 45 ? 60  : rankTier <= 65 ? 80  : 100;
  const expectedGPM = rankTier <= 25 ? 350 : rankTier <= 45 ? 450 : rankTier <= 65 ? 550 : 650;


  let score = 0;
  if (avgLH > expectedLH * 1.5)   score += 40;
  if (avgGPM > expectedGPM * 1.3) score += 30;
  if (avgKDA > 4)                  score += 20;
  if (winRate > 0.65)              score += 10;

  return Math.min(score, 100);
}

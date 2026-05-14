import axios from "axios";

// OpenDota is rate-limited and frequently slow. Cap every call so that a
// stalled response can't pin the entire registration route and trigger a
// Cloudflare 522.
const OPENDOTA_TIMEOUT_MS = 8000;

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

/**
 * Fetch the player's rank tier + MMR + recent-match smurf score from OpenDota
 * and persist to their user doc. Tournament registration calls this to assign
 * a bracket slot.
 *
 * IMPORTANT: this function MUST NOT throw on OpenDota failure. OpenDota is
 * rate-limited and frequently slow, and a thrown error here gets bubbled up
 * through the register route → Vercel → Cloudflare, surfacing as a 522 to
 * users. Instead, we fall back (in order) to:
 *   1. The user's previously-stored rank fields on their user doc.
 *   2. A safe default (herald_guardian, mmr=0) so registration still completes.
 * The user's bracket will be corrected on the next successful rank refresh.
 */
export async function fetchAndStoreRank(uid: string, steamId: string, db: FirebaseFirestore.Firestore) {
  const steam32 = (BigInt(steamId) - BigInt("76561197960265728")).toString();

  let rankTier = 0;
  let mmr = 0;
  let recentMatches: unknown[] = [];
  let smurfScore = 0;
  let openDotaOk = false;

  try {
    const [profileRes, matchesRes] = await Promise.allSettled([
      axios.get(`https://api.opendota.com/api/players/${steam32}`,           { timeout: OPENDOTA_TIMEOUT_MS }),
      axios.get(`https://api.opendota.com/api/players/${steam32}/recentMatches`, { timeout: OPENDOTA_TIMEOUT_MS }),
    ]);

    if (profileRes.status === "fulfilled") {
      const profile = profileRes.value.data;
      rankTier = profile?.rank_tier || 0;
      mmr = profile?.mmr_estimate?.estimate || 0;
      openDotaOk = true;
    }
    if (matchesRes.status === "fulfilled") {
      recentMatches = matchesRes.value.data || [];
      smurfScore = calculateSmurfScore(recentMatches as MatchSnippet[], rankTier);
    }
  } catch {
    // network exception outside Promise.allSettled — fall through to fallback
  }

  // Fallback to user's stored values if OpenDota gave us nothing useful.
  if (!openDotaOk) {
    const userSnap = await db.collection("users").doc(uid).get();
    const stored = userSnap.data() || {};
    rankTier = stored.dotaRankTier || 0;
    mmr = stored.dotaMMR || 0;
    // recentMatches stays empty — we don't overwrite stored ones with [].
    // smurfScore stays 0 — last computed value remains on user doc.
  }

  const bracket = getRankBracket(rankTier);

  // Build update: only overwrite recentMatches/smurfScore when we got a fresh fetch.
  const update: Record<string, unknown> = {
    dotaRankTier: rankTier,
    dotaBracket: bracket,
    dotaMMR: mmr,
    rankFetchedAt: new Date(),
  };
  if (openDotaOk) {
    update.recentMatches = (recentMatches as unknown[]).slice(0, 20);
    update.smurfRiskScore = smurfScore;
    update.rankSource = "opendota";
  } else {
    update.rankSource = "stored_fallback";
  }
  await db.collection("users").doc(uid).update(update);

  return { rankTier, bracket, mmr, smurfScore, source: openDotaOk ? "opendota" : "stored_fallback" };
}

type MatchSnippet = {
  last_hits?: number;
  gold_per_min?: number;
  kills?: number;
  deaths?: number;
  assists?: number;
  radiant_win?: boolean;
  player_slot?: number;
};

function calculateSmurfScore(matches: MatchSnippet[], rankTier: number): number {
  if (!matches || matches.length === 0) return 0;

  const avgLH = matches.reduce((a, m) => a + (m.last_hits || 0), 0) / matches.length;
  const avgGPM = matches.reduce((a, m) => a + (m.gold_per_min || 0), 0) / matches.length;
  const avgKDA = matches.reduce((a, m) => a + (((m.kills ?? 0) + (m.assists ?? 0)) / Math.max(m.deaths ?? 1, 1)), 0) / matches.length;
  const winRate = matches.filter((m) => m.radiant_win === ((m.player_slot ?? 0) < 128)).length / matches.length;

  const expectedLH  = rankTier <= 25 ? 40  : rankTier <= 45 ? 60  : rankTier <= 65 ? 80  : 100;
  const expectedGPM = rankTier <= 25 ? 350 : rankTier <= 45 ? 450 : rankTier <= 65 ? 550 : 650;

  let score = 0;
  if (avgLH > expectedLH * 1.5)   score += 40;
  if (avgGPM > expectedGPM * 1.3) score += 30;
  if (avgKDA > 4)                  score += 20;
  if (winRate > 0.65)              score += 10;

  return Math.min(score, 100);
}

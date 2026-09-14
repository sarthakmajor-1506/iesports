// What a Valorant player looks like at the moment they enter a tournament.
//
// Shared by solo registration and by team create/join, so a player who joins
// through a team code is refreshed, seeded and stored exactly like one who
// registered solo. It used to live inline in /api/valorant/solo.
//
// Nothing here writes. It returns the player document and the user-level
// updates, and the caller commits them only after its slot claim succeeds —
// that ordering is what stops a duplicate call (double click, duplicate PayU
// webhook) leaving two "seed" entries in a player's rating history.

import { seedRating, floorCheck, ratingToRank, ratingToTier } from "@/lib/elo";

const HENRIK_BASE = "https://api.henrikdev.xyz/valorant";

async function refreshRiotRank(region: string, name: string, tag: string) {
  const apiKey = process.env.HENRIK_API_KEY || "";
  const encodedName = encodeURIComponent(name);
  const encodedTag = encodeURIComponent(tag);
  const url = `${HENRIK_BASE}/v2/mmr/${region}/${encodedName}/${encodedTag}?api_key=${apiKey}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json", ...(apiKey ? { Authorization: apiKey } : {}) },
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.data;
}

/**
 * The profile a Valorant tournament needs before anyone can be put in it.
 * Riot counts once LINKED; verification is reviewed separately by admins.
 */
export function valorantProfileError(userData: any): string | null {
  if (!userData.fullName) return "Full name is required. Please update your profile.";
  if (!userData.phone && !userData.phoneNumber) return "Phone number is required. Please log in with your phone number.";
  if (!userData.discordId) return "Discord account is required. Please connect Discord first.";
  if (!userData.riotGameName || (userData.riotVerified || "unlinked") === "unlinked") return "Connect your Riot ID first";
  return null;
}

export type PreparedValorantPlayer = {
  player: Record<string, any>;
  userUpdate: Record<string, any>;
  rankHistoryEntry: Record<string, any> | null;
  iesportsRating: number;
  currentRank: string;
  rankRefreshed: boolean;
  ratingChanged: boolean;
};

export async function prepareValorantPlayer(uid: string, userData: any): Promise<PreparedValorantPlayer> {
  // ── Refresh Riot rank from interim Valorant rank API ────────────────
  let currentRank = userData.riotRank || "";
  let currentTier = userData.riotTier || 0;
  let peakTier = userData.riotPeakTier || currentTier;
  let peakRank = userData.riotPeakRank || currentRank;
  let rankRefreshed = false;

  try {
    const mmrData = await refreshRiotRank(
      userData.riotRegion || "ap",
      userData.riotGameName,
      userData.riotTagLine || ""
    );
    if (mmrData) {
      const newTier = mmrData.current_data?.currenttier || 0;
      const newRank = mmrData.current_data?.currenttierpatched || "Unranked";
      const apiPeakTier = mmrData.highest_rank?.tier || 0;
      const apiPeakRank = mmrData.highest_rank?.patched_tier || "Unranked";

      currentRank = newRank;
      currentTier = newTier;
      peakTier = Math.max(apiPeakTier, peakTier, newTier);
      peakRank = peakTier === apiPeakTier ? apiPeakRank
        : peakTier === (userData.riotPeakTier || 0) ? (userData.riotPeakRank || newRank)
        : newRank;
      rankRefreshed = true;
    }
  } catch { /* proceed with stored rank data */ }

  // ── Seed or floor-check IEsports rating ──────────────────────────────
  let iesportsRating = userData.iesportsRating || 0;
  let ratingChanged = false;
  let rankHistoryEntry: Record<string, any> | null = null;

  const userUpdate: Record<string, any> = {
    riotRank: currentRank,
    riotTier: currentTier,
    riotPeakRank: peakRank,
    riotPeakTier: peakTier,
  };

  if (!userData.iesportsRating) {
    iesportsRating = seedRating(currentTier, peakTier);
    userUpdate.iesportsRating = iesportsRating;
    userUpdate.iesportsRank = ratingToRank(iesportsRating);
    userUpdate.iesportsTier = ratingToTier(iesportsRating);
    userUpdate.iesportsMatchesPlayed = userData.iesportsMatchesPlayed || 0;
    ratingChanged = true;

    rankHistoryEntry = {
      timestamp: new Date().toISOString(),
      type: "seed",
      ratingBefore: 0,
      ratingAfter: iesportsRating,
      delta: iesportsRating,
    };
  } else {
    const bumped = floorCheck(iesportsRating, currentTier, peakTier);
    if (bumped !== null) {
      const before = iesportsRating;
      iesportsRating = bumped;
      userUpdate.iesportsRating = bumped;
      userUpdate.iesportsRank = ratingToRank(bumped);
      userUpdate.iesportsTier = ratingToTier(bumped);
      ratingChanged = true;

      rankHistoryEntry = {
        timestamp: new Date().toISOString(),
        type: "riot_refresh",
        ratingBefore: before,
        ratingAfter: bumped,
        delta: bumped - before,
        riotRankBefore: userData.riotRank || "Unknown",
        riotRankAfter: currentRank,
        riotTierBefore: userData.riotTier || 0,
        riotTierAfter: currentTier,
      };
    } else {
      userUpdate.iesportsRank = ratingToRank(iesportsRating);
      userUpdate.iesportsTier = ratingToTier(iesportsRating);
    }
  }

  return {
    player: {
      uid,
      riotGameName: userData.riotGameName,
      riotTagLine: userData.riotTagLine || "",
      riotAvatar: userData.riotAvatar || "",
      riotRank: currentRank,
      riotTier: currentTier,
      iesportsRating,
      iesportsRank: ratingToRank(iesportsRating),
      iesportsTier: ratingToTier(iesportsRating),
      skillLevel: 1,
      bracket: null,
      registeredAt: new Date().toISOString(),
    },
    userUpdate,
    rankHistoryEntry,
    iesportsRating,
    currentRank,
    rankRefreshed,
    ratingChanged,
  };
}

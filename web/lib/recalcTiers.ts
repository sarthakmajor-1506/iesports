import { adminDb } from "@/lib/firebaseAdmin";

/**
 * Recalculate player tiers for a Valorant tournament based on quantiles of riotTier.
 *
 * - All registered soloPlayers are sorted by riotTier descending (highest rank first).
 * - Split into 4 quartiles: Tier 1 (top 25%), Tier 2, Tier 3, Tier 4 (bottom 25%).
 * - With fewer players, higher tiers are prioritized (ceiling division for top tiers).
 * - Each player's `skillLevel` field is updated in Firestore.
 */
export async function recalcTiers(tournamentId: string): Promise<void> {
  const playersRef = adminDb
    .collection("valorantTournaments")
    .doc(tournamentId)
    .collection("soloPlayers");

  const snap = await playersRef.get();
  if (snap.empty) return;

  // Sort by iesportsTier (fallback to riotTier) descending, break ties by registeredAt
  const players = snap.docs
    .map((d) => {
      const data = d.data();
      return {
        uid: d.id,
        riotTier: data.iesportsTier || data.riotTier || 0,
        registeredAt: data.registeredAt || "",
      };
    })
    .sort((a, b) => b.riotTier - a.riotTier || a.registeredAt.localeCompare(b.registeredAt));

  const n = players.length;

  // Assign tiers using quartile boundaries
  // With small counts, ceiling division ensures higher tiers get priority
  const t1Count = Math.ceil(n / 4);
  const t2Count = Math.ceil((n - t1Count) / 3);
  const t3Count = Math.ceil((n - t1Count - t2Count) / 2);
  // t4Count = remainder

  const batch = adminDb.batch();

  for (let i = 0; i < n; i++) {
    let tier: number;
    if (i < t1Count) tier = 1;
    else if (i < t1Count + t2Count) tier = 2;
    else if (i < t1Count + t2Count + t3Count) tier = 3;
    else tier = 4;

    batch.update(playersRef.doc(players[i].uid), { skillLevel: tier });
  }

  await batch.commit();
}

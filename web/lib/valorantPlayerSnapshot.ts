import { adminDb } from "@/lib/firebaseAdmin";
import type { ValorantSoloPlayer } from "@/lib/types";

/**
 * Denormalized player snapshot kept on `valorantTournaments/{id}.playersSnapshot`.
 *
 * Why: every visit to the tournament detail page used to read 1 tournament doc + N
 * soloPlayers docs. With this cache it reads 1 doc total. soloPlayers/{uid} remains
 * the authoritative source of truth — the snapshot is rebuilt from it on every
 * mutation, so it can never drift permanently. If it does drift (manual Firestore
 * edit, failed write), the admin rebuild endpoint can refresh it.
 *
 * Every API route that writes to `soloPlayers` MUST call `syncPlayerSnapshot` at the
 * end of its mutation. Every API route that changes user-level Riot/iE data that is
 * mirrored into multiple tournaments' soloPlayers MUST call
 * `syncPlayerSnapshotsForUser` so all affected snapshots are refreshed.
 */

const SAFE_FIELDS: (keyof ValorantSoloPlayer)[] = [
  "uid",
  "riotGameName",
  "riotTagLine",
  "riotAvatar",
  "riotRank",
  "riotTier",
  "iesportsRating",
  "iesportsRank",
  "iesportsTier",
  "skillLevel",
  "bracket",
  "registeredAt",
];

function pickSafe(data: FirebaseFirestore.DocumentData, id: string): ValorantSoloPlayer {
  const out: any = { uid: data.uid || id };
  for (const k of SAFE_FIELDS) {
    if (k === "uid") continue;
    const v = (data as any)[k];
    if (v !== undefined) out[k] = v;
  }
  // Make sure the required string fields exist so consumers don't crash on undefined
  if (out.riotGameName == null) out.riotGameName = "";
  if (out.riotTagLine == null) out.riotTagLine = "";
  if (out.riotAvatar == null) out.riotAvatar = "";
  if (out.riotRank == null) out.riotRank = "";
  if (out.riotTier == null) out.riotTier = 0;
  if (out.registeredAt == null) out.registeredAt = "";
  return out as ValorantSoloPlayer;
}

function rankKey(p: ValorantSoloPlayer): number {
  // Sort priority: iesportsTier > riotTier. Higher tier first.
  return (p.iesportsTier ?? 0) * 100 + (p.riotTier ?? 0);
}

/**
 * Rebuild the `playersSnapshot` array on a single tournament doc from its
 * soloPlayers subcollection. Idempotent. Safe to call multiple times.
 */
export async function syncPlayerSnapshot(tournamentId: string): Promise<number> {
  if (!tournamentId) return 0;
  const tournRef = adminDb.collection("valorantTournaments").doc(tournamentId);

  // Bail early if tournament doesn't exist — caller might have just deleted it.
  const tournDoc = await tournRef.get();
  if (!tournDoc.exists) return 0;

  const playersSnap = await tournRef.collection("soloPlayers").get();
  const players = playersSnap.docs
    .map((d) => pickSafe(d.data(), d.id))
    .sort((a, b) => {
      const diff = rankKey(b) - rankKey(a);
      if (diff !== 0) return diff;
      // Stable secondary sort: earlier registration first
      return (a.registeredAt || "").localeCompare(b.registeredAt || "");
    });

  await tournRef.update({
    playersSnapshot: players,
    playersSnapshotUpdatedAt: new Date().toISOString(),
  });

  return players.length;
}

/**
 * Sync the snapshot for every tournament a given user is registered in.
 * Use when user-level data (rating, rank) changes and is propagated to multiple
 * tournament soloPlayers docs.
 *
 * Reads from the user's `registeredValorantTournaments` array. If that array is
 * stale, some tournaments may not be refreshed — pass `extraTournamentIds` to
 * cover known cases not in the array.
 */
export async function syncPlayerSnapshotsForUser(
  uid: string,
  extraTournamentIds: string[] = []
): Promise<{ updated: string[]; skipped: string[] }> {
  if (!uid) return { updated: [], skipped: [] };

  const userDoc = await adminDb.collection("users").doc(uid).get();
  const fromUser: string[] = userDoc.exists
    ? (userDoc.data()?.registeredValorantTournaments as string[] | undefined) || []
    : [];

  const tournamentIds = Array.from(new Set([...fromUser, ...extraTournamentIds])).filter(Boolean);

  const updated: string[] = [];
  const skipped: string[] = [];

  // Sync sequentially to keep the per-mutation Firestore load predictable.
  for (const tId of tournamentIds) {
    try {
      const n = await syncPlayerSnapshot(tId);
      if (n > 0) updated.push(tId);
      else skipped.push(tId);
    } catch (e) {
      console.error(`[playerSnapshot] failed to sync ${tId} for user ${uid}:`, e);
      skipped.push(tId);
    }
  }

  return { updated, skipped };
}

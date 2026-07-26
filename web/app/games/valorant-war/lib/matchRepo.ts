// Thin Firestore wrapper for valorantWarGames collection. Server-only.
import { adminDb } from '@/lib/firebaseAdmin';
import type { MatchState } from '../data/types';

const COLLECTION = 'valorantWarGames';

export async function createMatch(state: MatchState): Promise<void> {
  await adminDb.collection(COLLECTION).doc(state.matchId).set(state);
}

export async function getMatch(matchId: string): Promise<MatchState | null> {
  const snap = await adminDb.collection(COLLECTION).doc(matchId).get();
  if (!snap.exists) return null;
  return snap.data() as MatchState;
}

export async function updateMatch(state: MatchState): Promise<void> {
  await adminDb.collection(COLLECTION).doc(state.matchId).set(state);
}

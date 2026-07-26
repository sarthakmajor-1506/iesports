// POST → create a new match. Body: { idToken?: string }.
// Returns: { matchId, state }. New match starts in phase 'side_select'.
import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { createMatch } from '@/app/games/valorant-war/lib/matchRepo';
import { newSeed } from '@/app/games/valorant-war/lib/rng';
import { HAVEN } from '@/app/games/valorant-war/data/maps';
import { STARTING_GOLD } from '@/app/games/valorant-war/lib/economy';
import type { MatchState } from '@/app/games/valorant-war/data/types';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const idToken: string | undefined = body?.idToken;

    let playerId: string | null = null;
    if (idToken) {
      try {
        const decoded = await getAuth().verifyIdToken(idToken);
        playerId = decoded.uid;
      } catch {
        playerId = null;
      }
    }

    const seed = newSeed();
    const matchId = `vw_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const state: MatchState = {
      matchId,
      playerId,
      seed,
      map: HAVEN,
      status: 'in_progress',
      phase: 'side_select',
      currentRound: 1,
      playerScore: 0,
      aiScore: 0,
      consecutiveLosses: { player: 0, ai: 0 },
      player: { gold: STARTING_GOLD, roster: [] },
      ai:     { gold: STARTING_GOLD, roster: [] },
      rounds: [],
      winner: null,
      createdAt: Date.now(),
      completedAt: null,
      playerRole: null,
      focusSite: null,
    };

    await createMatch(state);
    return NextResponse.json({ matchId, state });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

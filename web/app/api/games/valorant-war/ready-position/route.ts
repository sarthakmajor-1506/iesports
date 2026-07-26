// POST → transition shop → position phase. Body: { matchId }.
// Validates: must be in shop phase with at least one agent owned.
import { NextRequest, NextResponse } from 'next/server';
import { getMatch, updateMatch } from '@/app/games/valorant-war/lib/matchRepo';
import type { MatchState } from '@/app/games/valorant-war/data/types';

export async function POST(req: NextRequest) {
  try {
    const { matchId } = (await req.json()) as { matchId: string };
    const state = await getMatch(matchId);
    if (!state) return NextResponse.json({ error: 'match not found' }, { status: 404 });
    if (state.phase !== 'shop') {
      return NextResponse.json({ error: 'not in shop phase' }, { status: 400 });
    }
    if (state.player.roster.length === 0) {
      return NextResponse.json({ error: 'must own at least one agent' }, { status: 400 });
    }
    // Reset zones for this round (in case carried over from previous round)
    const newRoster = state.player.roster.map(s => ({ ...s, zone: null }));
    const next: MatchState = {
      ...state,
      phase: 'position',
      focusSite: null,
      player: { ...state.player, roster: newRoster },
    };
    await updateMatch(next);
    return NextResponse.json({ state: next });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

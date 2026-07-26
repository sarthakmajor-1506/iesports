// POST → set the player's role (attacker/defender) for the whole match.
// Body: { matchId, role: 'attacker' | 'defender' }
// Allowed only when match is in side_select phase. Advances to 'shop'.
import { NextRequest, NextResponse } from 'next/server';
import { getMatch, updateMatch } from '@/app/games/valorant-war/lib/matchRepo';
import type { MatchState, TeamRole } from '@/app/games/valorant-war/data/types';

export async function POST(req: NextRequest) {
  try {
    const { matchId, role } = (await req.json()) as { matchId: string; role: TeamRole };
    if (!matchId || !role) return NextResponse.json({ error: 'matchId and role required' }, { status: 400 });
    if (role !== 'attacker' && role !== 'defender') {
      return NextResponse.json({ error: 'role must be attacker or defender' }, { status: 400 });
    }
    const state = await getMatch(matchId);
    if (!state) return NextResponse.json({ error: 'match not found' }, { status: 404 });
    if (state.phase !== 'side_select') {
      return NextResponse.json({ error: 'side already chosen' }, { status: 400 });
    }
    const next: MatchState = { ...state, playerRole: role, phase: 'shop' };
    await updateMatch(next);
    return NextResponse.json({ state: next });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

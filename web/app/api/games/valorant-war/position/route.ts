// POST → apply one position action: assign a slot to a zone, or set focus site.
// Body: { matchId, action: PositionAction }.
// Allowed only in 'position' phase.
import { NextRequest, NextResponse } from 'next/server';
import { getMatch, updateMatch } from '@/app/games/valorant-war/lib/matchRepo';
import type { MatchState, PositionAction } from '@/app/games/valorant-war/data/types';
import { ZONES, SITES } from '@/app/games/valorant-war/data/zones';

export async function POST(req: NextRequest) {
  try {
    const { matchId, action } = (await req.json()) as { matchId: string; action: PositionAction };
    if (!matchId || !action) return NextResponse.json({ error: 'matchId and action required' }, { status: 400 });

    const state = await getMatch(matchId);
    if (!state) return NextResponse.json({ error: 'match not found' }, { status: 404 });
    if (state.phase !== 'position') {
      return NextResponse.json({ error: 'not in position phase' }, { status: 400 });
    }

    if (action.kind === 'set_zone') {
      const slot = state.player.roster[action.slotIdx];
      if (!slot) return NextResponse.json({ error: 'invalid slot' }, { status: 400 });
      if (!ZONES.includes(action.zone)) return NextResponse.json({ error: 'invalid zone' }, { status: 400 });
      const newRoster = state.player.roster.map((s, i) =>
        i === action.slotIdx ? { ...s, zone: action.zone } : s
      );
      const next: MatchState = { ...state, player: { ...state.player, roster: newRoster } };
      await updateMatch(next);
      return NextResponse.json({ state: next });
    }

    if (action.kind === 'set_focus') {
      if (state.playerRole !== 'attacker') {
        return NextResponse.json({ error: 'only attacker may set focus' }, { status: 400 });
      }
      if (!SITES.includes(action.site)) {
        return NextResponse.json({ error: 'focus must be A, B, or C' }, { status: 400 });
      }
      const next: MatchState = { ...state, focusSite: action.site };
      await updateMatch(next);
      return NextResponse.json({ state: next });
    }

    return NextResponse.json({ error: 'unknown action' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// GET → return current match state (for refresh / resume).
import { NextRequest, NextResponse } from 'next/server';
import { getMatch } from '@/app/games/valorant-war/lib/matchRepo';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ matchId: string }> },
) {
  try {
    const { matchId } = await params;
    const state = await getMatch(matchId);
    if (!state) return NextResponse.json({ error: 'match not found' }, { status: 404 });
    return NextResponse.json({ state });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

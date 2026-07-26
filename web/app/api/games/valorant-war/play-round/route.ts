// POST → AI auto-positions, simulate round, persist, return events + new state.
// Body: { matchId }
// Allowed in 'position' phase. Validates: all player agents have zones,
// attacker has set focusSite.
import { NextRequest, NextResponse } from 'next/server';
import { getMatch, updateMatch } from '@/app/games/valorant-war/lib/matchRepo';
import { mulberry32 } from '@/app/games/valorant-war/lib/rng';
import { aiShop } from '@/app/games/valorant-war/lib/aiShopper';
import { aiPosition } from '@/app/games/valorant-war/lib/aiPositioner';
import { simulateRound } from '@/app/games/valorant-war/lib/simulator';
import {
  computeGoldAwards, nextConsecutiveLosses, applyGold,
} from '@/app/games/valorant-war/lib/economy';
import type { MatchState, RoundResult, Side } from '@/app/games/valorant-war/data/types';

const FIRST_TO_WIN = 4;

export async function POST(req: NextRequest) {
  try {
    const { matchId } = (await req.json()) as { matchId: string };
    const state = await getMatch(matchId);
    if (!state) return NextResponse.json({ error: 'match not found' }, { status: 404 });
    if (state.status !== 'in_progress') {
      return NextResponse.json({ error: 'match not in progress' }, { status: 400 });
    }
    if (state.phase !== 'position') {
      return NextResponse.json({ error: 'not in position phase' }, { status: 400 });
    }
    if (!state.playerRole) {
      return NextResponse.json({ error: 'side not chosen' }, { status: 400 });
    }
    if (state.player.roster.length === 0) {
      return NextResponse.json({ error: 'must own at least one agent' }, { status: 400 });
    }
    if (state.player.roster.some(s => s.zone == null)) {
      return NextResponse.json({ error: 'all agents must be positioned' }, { status: 400 });
    }
    if (state.playerRole === 'attacker' && state.focusSite == null) {
      return NextResponse.json({ error: 'attacker must set focus site' }, { status: 400 });
    }

    const subSeed = (state.seed ^ (state.currentRound * 0x9e3779b1)) >>> 0;
    const rng = mulberry32(subSeed);

    // 1. AI shops
    let aiTeam = aiShop(state.ai, rng);

    // 2. AI auto-positions and (if attacker) picks focus site
    const aiRole = state.playerRole === 'attacker' ? 'defender' : 'attacker';
    const aiPositioned = aiPosition(aiTeam, aiRole, rng);
    aiTeam = aiPositioned.team;
    const focusSite = state.playerRole === 'attacker' ? state.focusSite : aiPositioned.focusSite;

    // 3. Simulate round
    const sim = simulateRound(
      state.player, aiTeam,
      state.currentRound, state.map, rng,
      state.playerRole, focusSite,
    );

    // 4. Economy
    const awards = computeGoldAwards(sim.winner, sim.killCounts, state.consecutiveLosses);
    const consec = nextConsecutiveLosses(state.consecutiveLosses, sim.winner);

    const roundResult: RoundResult = { ...sim, goldAwarded: awards };

    const playerScore = state.playerScore + (sim.winner === 'player' || sim.winner === 'tie' ? 1 : 0);
    const aiScore     = state.aiScore     + (sim.winner === 'ai' ? 1 : 0);

    const matchOver = playerScore >= FIRST_TO_WIN || aiScore >= FIRST_TO_WIN || state.currentRound >= 7;
    let winner: Side | null = null;
    if (matchOver) {
      winner = playerScore > aiScore ? 'player' : aiScore > playerScore ? 'ai' : 'player';
    }

    // 5. Build next state.
    //    - Clear zones (player must re-position next round).
    //    - For agents that DIED this round: clear armor + utility (they lose them on death,
    //      matching Valorant — survivors keep their gear). Weapons retained for survivors.
    //    Track which slot indices died this round from the events.
    const deadPlayer = new Set<number>();
    const deadAi = new Set<number>();
    for (const ev of sim.events) {
      if (ev.type === 'eliminate') {
        if (ev.side === 'player') deadPlayer.add(ev.slotIdx);
        else deadAi.add(ev.slotIdx);
      }
    }
    // Track which agents fired their ultimate this round (from sim snapshot)
    const playerUlted = new Set<number>();
    const aiUlted = new Set<number>();
    sim.startingPlayerRoster.forEach((s, i) => {
      if (s.ultUsed && !state.player.roster[i].ultUsed) playerUlted.add(i);
    });
    sim.startingAiRoster.forEach((s, i) => {
      if (s.ultUsed && !(aiTeam.roster[i]?.ultUsed)) aiUlted.add(i);
    });

    const stripDeath = (
      slot: typeof state.player.roster[number],
      dead: boolean,
      ulted: boolean,
    ) => ({
      ...slot,
      zone: null,
      armorId: dead ? 'none' : slot.armorId,
      utilityId: dead ? null : slot.utilityId,
      ultUsed: slot.ultUsed || ulted,
    });
    const playerNextRoster = state.player.roster.map((s, i) =>
      stripDeath(s, deadPlayer.has(i), playerUlted.has(i)));
    const aiNextRoster = aiTeam.roster.map((s, i) =>
      stripDeath(s, deadAi.has(i), aiUlted.has(i)));

    let nextState: MatchState = {
      ...state,
      ai: { gold: aiTeam.gold, roster: aiNextRoster },
      player: { ...state.player, roster: playerNextRoster },
      rounds: [...state.rounds, roundResult],
      playerScore,
      aiScore,
      consecutiveLosses: consec,
      currentRound: matchOver ? state.currentRound : state.currentRound + 1,
      phase: matchOver ? 'finished' : 'shop',
      focusSite: null,
      status: matchOver ? 'completed' : 'in_progress',
      winner,
      completedAt: matchOver ? Date.now() : null,
    };
    nextState = applyGold(nextState, awards);

    await updateMatch(nextState);
    return NextResponse.json({ state: nextState, roundResult });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

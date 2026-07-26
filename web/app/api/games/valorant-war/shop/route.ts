// POST → apply one shop action. Body: { matchId, action: ShopAction }.
// Returns: { state } on success, { error } on validation failure.
import { NextRequest, NextResponse } from 'next/server';
import { getMatch, updateMatch } from '@/app/games/valorant-war/lib/matchRepo';
import { getAgent } from '@/app/games/valorant-war/data/agents';
import { getWeapon } from '@/app/games/valorant-war/data/weapons';
import { getArmor } from '@/app/games/valorant-war/data/armors';
import { getUtility } from '@/app/games/valorant-war/data/utilities';
import type { ShopAction, MatchState } from '@/app/games/valorant-war/data/types';

const MAX_ROSTER = 5;

export async function POST(req: NextRequest) {
  try {
    const { matchId, action } = (await req.json()) as { matchId: string; action: ShopAction };
    if (!matchId || !action) {
      return NextResponse.json({ error: 'matchId and action required' }, { status: 400 });
    }

    const state = await getMatch(matchId);
    if (!state) return NextResponse.json({ error: 'match not found' }, { status: 404 });
    if (state.status !== 'in_progress') {
      return NextResponse.json({ error: 'match not in progress' }, { status: 400 });
    }
    if (state.phase !== 'shop') {
      return NextResponse.json({ error: 'not in shop phase' }, { status: 400 });
    }

    const next = applyShopAction(state, action);
    if ('error' in next) return NextResponse.json({ error: next.error }, { status: 400 });

    await updateMatch(next.state);
    return NextResponse.json({ state: next.state });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

function applyShopAction(state: MatchState, action: ShopAction): { state: MatchState } | { error: string } {
  const player = { gold: state.player.gold, roster: state.player.roster.map(s => ({ ...s })) };

  switch (action.kind) {
    case 'buy_agent': {
      const agent = safeGetAgent(action.agentId);
      if (!agent) return { error: 'unknown agent' };
      if (player.roster.length >= MAX_ROSTER) return { error: 'roster full' };
      if (player.roster.some(s => s.agentId === agent.id)) return { error: 'agent already owned' };
      if (player.gold < agent.cost) return { error: 'insufficient gold' };
      player.roster.push({ agentId: agent.id, weaponId: 'classic', armorId: 'none', utilityId: null, zone: null, ultUsed: false });
      player.gold -= agent.cost;
      break;
    }
    case 'buy_weapon': {
      const slot = player.roster[action.slotIdx];
      if (!slot) return { error: 'invalid slot' };
      const weapon = safeGetWeapon(action.weaponId);
      if (!weapon) return { error: 'unknown weapon' };
      if (slot.weaponId === weapon.id) return { error: 'already equipped' };
      if (player.gold < weapon.cost) return { error: 'insufficient gold' };
      slot.weaponId = weapon.id;
      player.gold -= weapon.cost;
      break;
    }
    case 'buy_armor': {
      const slot = player.roster[action.slotIdx];
      if (!slot) return { error: 'invalid slot' };
      const armor = safeGetArmor(action.armorId);
      if (!armor) return { error: 'unknown armor' };
      if (slot.armorId === armor.id) return { error: 'already equipped' };
      if (player.gold < armor.cost) return { error: 'insufficient gold' };
      slot.armorId = armor.id;
      player.gold -= armor.cost;
      break;
    }
    case 'buy_utility': {
      const slot = player.roster[action.slotIdx];
      if (!slot) return { error: 'invalid slot' };
      const util = safeGetUtility(action.utilityId);
      if (!util) return { error: 'unknown utility' };
      if (slot.utilityId === util.id) return { error: 'already equipped' };
      if (player.gold < util.cost) return { error: 'insufficient gold' };
      slot.utilityId = util.id;
      player.gold -= util.cost;
      break;
    }
    case 'clear_utility': {
      const slot = player.roster[action.slotIdx];
      if (!slot) return { error: 'invalid slot' };
      slot.utilityId = null;
      break;
    }
  }

  return { state: { ...state, player } };
}

function safeGetAgent(id: string) { try { return getAgent(id); } catch { return null; } }
function safeGetWeapon(id: string) { try { return getWeapon(id); } catch { return null; } }
function safeGetArmor(id: string) { try { return getArmor(id); } catch { return null; } }
function safeGetUtility(id: string) { try { return getUtility(id); } catch { return null; } }

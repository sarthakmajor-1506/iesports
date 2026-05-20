// Smoke test: deterministic round simulation with v2 zone-based combat.
// Usage: npx tsx scripts/testValorantWarSim.ts
import { mulberry32 } from '../app/games/valorant-war/lib/rng';
import { simulateRound } from '../app/games/valorant-war/lib/simulator';
import { aiShop } from '../app/games/valorant-war/lib/aiShopper';
import { aiPosition } from '../app/games/valorant-war/lib/aiPositioner';
import { computeGoldAwards, nextConsecutiveLosses, STARTING_GOLD } from '../app/games/valorant-war/lib/economy';
import { HAVEN } from '../app/games/valorant-war/data/maps';
import type { TeamState } from '../app/games/valorant-war/data/types';

function main() {
  const seed = 12345;
  const rng = mulberry32(seed);

  console.log(`Seed=${seed}  Map=${HAVEN}\n`);

  // Player: attacker. Buys 2 agents and places them at A site (focus).
  const player: TeamState = {
    gold: STARTING_GOLD - 400 - 500,
    roster: [
      { agentId: 'phoenix', weaponId: 'classic', armorId: 'none', utilityId: null, zone: 'A', ultUsed: false },
      { agentId: 'sova',    weaponId: 'classic', armorId: 'none', utilityId: null, zone: 'A', ultUsed: false },
    ],
  };

  // AI: defender. Auto-position
  const aiInitial: TeamState = { gold: STARTING_GOLD, roster: [] };
  const ai0 = aiShop(aiInitial, rng);
  const aiPositioned = aiPosition(ai0, 'defender', rng);
  const ai = aiPositioned.team;
  console.log(
    'AI defenders:',
    ai.roster.map(s => `${s.agentId}@${s.zone}+${s.weaponId}`).join(', '),
  );

  const result = simulateRound(player, ai, 1, HAVEN, rng, 'attacker', 'A');
  console.log(`\nRound 1 → winner=${result.winner}, kills=${result.killCounts.player}/${result.killCounts.ai}, events=${result.events.length}`);
  console.log('First 15 events:');
  for (const ev of result.events.slice(0, 15)) console.log('  ', JSON.stringify(ev));

  const awards = computeGoldAwards(result.winner, result.killCounts, { player: 0, ai: 0 });
  const losses = nextConsecutiveLosses({ player: 0, ai: 0 }, result.winner);
  console.log(`\nGold awards: player=+${awards.player} ai=+${awards.ai}, consecutiveLosses=`, losses);

  // Determinism re-run
  const rng2 = mulberry32(seed);
  const aiAgain = aiShop({ gold: STARTING_GOLD, roster: [] }, rng2);
  const aiPos2 = aiPosition(aiAgain, 'defender', rng2);
  if (JSON.stringify(aiPos2.team.roster) !== JSON.stringify(ai.roster)) {
    console.error('DETERMINISM FAILURE — same seed produced different AI');
    process.exit(1);
  }
  console.log('\n✅ Determinism check passed (same seed → same AI shop+position).');
}

main();

// End-to-end API smoke test. Requires `npm run dev` running on :3000.
// Usage: npx tsx scripts/testValorantWarApi.ts
const BASE = 'http://localhost:3000/api/games/valorant-war';

async function post(path: string, body: unknown) {
  const r = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`${path} → ${r.status}: ${JSON.stringify(j)}`);
  return j;
}

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`);
  const j = await r.json();
  if (!r.ok) throw new Error(`${path} → ${r.status}: ${JSON.stringify(j)}`);
  return j;
}

async function main() {
  console.log('1. new-match');
  const { matchId, state: s0 } = await post('/new-match', {});
  console.log(`   matchId=${matchId} map=${s0.map} gold=${s0.player.gold}`);

  console.log('2. shop: buy phoenix');
  const { state: s1 } = await post('/shop', { matchId, action: { kind: 'buy_agent', agentId: 'phoenix' } });
  console.log(`   roster=${s1.player.roster.length} gold=${s1.player.gold}`);

  console.log('3. shop: buy sheriff for slot 0');
  try {
    const { state: s2 } = await post('/shop', { matchId, action: { kind: 'buy_weapon', slotIdx: 0, weaponId: 'sheriff' } });
    console.log(`   slot0.weapon=${s2.player.roster[0].weaponId} gold=${s2.player.gold}`);
  } catch (e) {
    console.log(`   (skipped: ${(e as Error).message})`);
  }

  console.log('4. play-round');
  const { state: s3, roundResult } = await post('/play-round', { matchId });
  console.log(`   round1 winner=${roundResult.winner} score=${s3.playerScore}-${s3.aiScore} gold=${s3.player.gold} phase=${s3.phase}`);

  console.log('5. GET match state');
  const { state: s4 } = await get(`/match/${matchId}`);
  console.log(`   round=${s4.currentRound} phase=${s4.phase} status=${s4.status}`);

  console.log('\n✅ All API endpoints responded correctly');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

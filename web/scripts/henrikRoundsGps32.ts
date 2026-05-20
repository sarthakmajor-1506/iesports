import { config } from 'dotenv';
config({ path: '/Users/sjain/Documents/iesports/iesports/web/.env.local' });

import fs from 'fs';

const HENRIK = process.env.HENRIK_API_KEY!;
const TARGET_NAME = 'GPS32  ツ';
const TARGET_TAG = 'HERS';
const REGION = 'ap';

const games = [
  { game: 'game1', map: 'Bind',  matchId: '3d65cfe4-edeb-4298-ac64-db4dd96b7e3f' },
  { game: 'game2', map: 'Split', matchId: 'c146541e-c1c5-4697-9695-30ef6e35e768' },
];

async function fetchMatch(matchId: string) {
  const url = `https://api.henrikdev.xyz/valorant/v2/match/${matchId}`;
  const res = await fetch(url, { headers: { Authorization: HENRIK } });
  if (!res.ok) {
    console.error(`Henrik ${res.status} for ${matchId}: ${await res.text()}`);
    return null;
  }
  return res.json();
}

function findPuuid(match: any): string | null {
  for (const p of match.data?.players?.all_players || []) {
    if (
      p.name?.toLowerCase().includes('gps32') ||
      `${p.name}#${p.tag}`.toLowerCase().includes('gps32')
    ) {
      return p.puuid;
    }
  }
  return null;
}

function scoreRound(stats: any, won: boolean) {
  const kills = stats.kills || 0;
  let damage = 0;
  for (const ev of stats.damage_events || []) damage += ev.damage || 0;
  // Approx flags (Henrik doesn't directly mark "clutch" or "first kill" — derive)
  const score =
    kills * 100 +
    damage * 0.5 +
    (won ? 50 : 0); // small win bonus
  return { score, kills, damage };
}

async function main() {
  const all: any[] = [];

  for (const g of games) {
    console.log(`\n=== Fetching ${g.game} (${g.map}) ${g.matchId} ===`);
    const m = await fetchMatch(g.matchId);
    if (!m) continue;
    const puuid = findPuuid(m);
    console.log(`  GPS32 puuid: ${puuid}`);
    if (!puuid) continue;

    // Find GPS32's team
    const me = m.data.players.all_players.find((p: any) => p.puuid === puuid);
    const myTeam = me?.team;  // "Red" / "Blue"
    console.log(`  Team: ${myTeam}`);

    const rounds = m.data.rounds || [];
    console.log(`  Rounds: ${rounds.length}`);

    for (let i = 0; i < rounds.length; i++) {
      const r = rounds[i];
      const myStats = (r.player_stats || []).find((ps: any) => ps.player_puuid === puuid);
      if (!myStats) continue;
      const won = (r.winning_team || '').toLowerCase() === (myTeam || '').toLowerCase();
      const { score, kills, damage } = scoreRound(myStats, won);
      all.push({
        game: g.game,
        map: g.map,
        roundNumber: i + 1,
        won,
        kills,
        damage: Math.round(damage),
        score: Math.round(score),
        endType: r.end_type,
        bombPlanted: r.bomb_planted,
      });
    }
  }

  all.sort((a, b) => b.score - a.score);

  console.log('\n=== ALL ROUNDS sorted by score ===');
  console.log(`${'#'.padStart(3)}  ${'game'.padEnd(6)} ${'map'.padEnd(6)} ${'rd'.padStart(3)} ${'K'.padStart(3)} ${'dmg'.padStart(4)} ${'won'.padEnd(3)} score   end`);
  let i = 0;
  for (const r of all) {
    i++;
    console.log(`${String(i).padStart(3)}  ${r.game.padEnd(6)} ${r.map.padEnd(6)} ${String(r.roundNumber).padStart(3)} ${String(r.kills).padStart(3)} ${String(r.damage).padStart(4)} ${(r.won ? 'W' : 'L').padEnd(3)} ${String(r.score).padStart(5)}  ${r.endType}`);
  }

  console.log('\n=== TOP 3 ===');
  for (const r of all.slice(0, 3)) {
    console.log(`  ${r.game} ${r.map} R${r.roundNumber}: ${r.kills}K ${r.damage}dmg won=${r.won} score=${r.score}`);
  }

  fs.writeFileSync(
    '/Users/sjain/Documents/iesports/iesports/web/scripts/_gps32_rounds.json',
    JSON.stringify({ all, top3: all.slice(0, 3) }, null, 2)
  );
  console.log('\nSaved → scripts/_gps32_rounds.json');
}

main().catch(e => { console.error(e); process.exit(1); });

import fs from 'fs';
import path from 'path';

const data = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../data/match-data.json'), 'utf-8'));

// Team mapping
const TEAMS: Record<string, string> = {
  'team-3': 'Radiant Reapers',
  'team-1': 'Muth Rajya',
};

interface PlayerBest {
  name: string;
  team: string;
  bestGame: number;
  kills: number;
  deaths: number;
  assists: number;
  acs: number;
  kd: number;
  reason: string;
}

const playerBests: Record<string, PlayerBest> = {};

for (let g = 1; g <= 3; g++) {
  const game = data[`game${g}`];
  if (!game?.playerStats) continue;

  const totalRounds = (game.team1RoundsWon || 0) + (game.team2RoundsWon || 0);

  for (const p of game.playerStats) {
    const name = p.name || p.riotId || 'unknown';
    const team = TEAMS[p.teamId] || 'unknown';
    const kills = p.kills || 0;
    const deaths = p.deaths || 0;
    const assists = p.assists || 0;
    const acs = totalRounds > 0 ? Math.round((p.score || 0) / totalRounds) : 0;
    const kd = kills / Math.max(1, deaths);

    // Score: weighted combo of ACS, KD, and kills
    const score = acs * 1.0 + kd * 50 + kills * 2;

    const existing = playerBests[name];
    const existingScore = existing
      ? existing.acs * 1.0 + existing.kd * 50 + existing.kills * 2
      : -1;

    if (score > existingScore) {
      playerBests[name] = {
        name,
        team,
        bestGame: g,
        kills,
        deaths,
        assists,
        acs,
        kd: Math.round(kd * 100) / 100,
        reason: `Game ${g}: ${kills}K/${deaths}D/${assists}A, ${acs} ACS, ${kd.toFixed(2)} KD`,
      };
    }
  }
}

// Sort by ACS
const sorted = Object.values(playerBests).sort((a, b) => b.acs - a.acs);

console.log('\n=== BEST GAME PER PLAYER (Grand Final) ===\n');
console.log(`${'Player'.padEnd(22)} ${'Team'.padEnd(18)} ${'Best'.padStart(4)} ${'K'.padStart(3)} ${'D'.padStart(3)} ${'A'.padStart(3)} ${'ACS'.padStart(5)} ${'KD'.padStart(5)}   Reason`);
console.log('-'.repeat(100));

for (const p of sorted) {
  console.log(`${p.name.padEnd(22)} ${p.team.padEnd(18)} ${('G'+p.bestGame).padStart(4)} ${String(p.kills).padStart(3)} ${String(p.deaths).padStart(3)} ${String(p.assists).padStart(3)} ${String(p.acs).padStart(5)} ${p.kd.toFixed(2).padStart(5)}   ${p.reason}`);
}

// Save for clip generation
const output = sorted.map(p => ({
  ...p,
  clipFile: `${p.name.replace(/[^a-zA-Z0-9]/g, '_')}.mp4`,
}));

fs.writeFileSync(path.resolve(__dirname, '../data/player-highlights.json'), JSON.stringify(output, null, 2));
console.log('\nSaved to data/player-highlights.json');

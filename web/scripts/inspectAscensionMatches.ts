import { config } from 'dotenv';
config({ path: '/Users/sjain/Documents/iesports/iesports/web/.env.local' });

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}
const db = getFirestore();

async function main() {
  const matchesSnap = await db
    .collection('valorantTournaments')
    .doc('league-of-rising-stars-ascension')
    .collection('matches')
    .get();

  console.log(`Matches: ${matchesSnap.size}\n`);

  const buckets: Record<string, number> = {};
  for (const m of matchesSnap.docs) {
    const d: any = m.data();
    const key = `${d.bracketType || '?'} | ${d.bracketLabel || '?'} | round=${d.bracketRound}`;
    buckets[key] = (buckets[key] || 0) + 1;
  }
  console.log('Bracket buckets:');
  for (const [k, v] of Object.entries(buckets).sort()) console.log(`  ${k}  ×${v}`);

  console.log('\n=== GPS32 search across ALL matches ===');
  const found: any[] = [];
  for (const m of matchesSnap.docs) {
    const d: any = m.data();
    for (const k of Object.keys(d)) {
      if (!k.startsWith('game')) continue;
      const g = d[k];
      if (!g?.playerStats) continue;
      for (const p of g.playerStats) {
        const name = (p.name || '').toString();
        if (/gps32/i.test(name)) {
          found.push({
            matchId: m.id,
            game: k,
            valorantMatchId: g.valorantMatchId,
            mapName: g.mapName,
            name: p.name, tag: p.tag, team: p.team, puuid: p.puuid,
            kills: p.kills, deaths: p.deaths, assists: p.assists, score: p.score,
            bracketType: d.bracketType, bracketLabel: d.bracketLabel, bracketRound: d.bracketRound,
            matchTeams: `${d.team1Name} vs ${d.team2Name}`,
            startedAt: d.startedAt,
          });
        }
      }
    }
  }
  console.log(`GPS32 appearances: ${found.length}`);
  for (const f of found) {
    console.log(`\n  ${f.matchId} ${f.game} (${f.mapName})`);
    console.log(`    bracket="${f.bracketLabel}" type=${f.bracketType} round=${f.bracketRound}`);
    console.log(`    name=${f.name}#${f.tag} team=${f.team}`);
    console.log(`    K/D/A=${f.kills}/${f.deaths}/${f.assists} score=${f.score}`);
    console.log(`    teams=${f.matchTeams}  startedAt=${f.startedAt}`);
    console.log(`    valorantMatchId=${f.valorantMatchId}`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });

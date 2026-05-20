import { config } from 'dotenv';
config({ path: '/Users/sjain/Documents/iesports/iesports/web/.env.local' });

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';

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
  const snap = await db.collection('valorantTournaments').get();
  console.log(`Total Valorant tournaments: ${snap.size}`);
  const ascension: { id: string; data: any }[] = [];
  for (const doc of snap.docs) {
    const d = doc.data();
    const name = (d.name || d.tournamentName || d.title || '').toString();
    if (/ascen/i.test(name) || /ascen/i.test(doc.id)) {
      ascension.push({ id: doc.id, data: d });
    }
  }
  console.log(`Ascension matches:`);
  for (const t of ascension) {
    console.log(`  - id=${t.id}  name=${t.data.name || t.data.tournamentName || '(none)'}  status=${t.data.status || '?'}`);
  }
  if (!ascension.length) {
    console.log('No Ascension found. Listing all tournaments:');
    for (const doc of snap.docs) {
      const d = doc.data();
      console.log(`  - id=${doc.id}  name=${d.name || d.tournamentName || '(none)'}`);
    }
    return;
  }

  for (const t of ascension) {
    console.log(`\n=== Tournament ${t.id} ===`);
    const matchesSnap = await db
      .collection('valorantTournaments')
      .doc(t.id)
      .collection('matches')
      .get();
    console.log(`Matches: ${matchesSnap.size}`);

    const round1Matches: any[] = [];
    for (const m of matchesSnap.docs) {
      const md: any = m.data();
      const isR1 =
        md.bracketRound === 1 ||
        /round\s*1\b|\br1\b|\bro1\b/i.test(md.bracketLabel || '') ||
        /round\s*1\b|\br1\b|\bro1\b/i.test(md.label || '');
      if (isR1) round1Matches.push({ id: m.id, ...md });
    }
    console.log(`Round 1 matches: ${round1Matches.length}`);

    const gpsMatches: any[] = [];
    for (const m of round1Matches) {
      const playersFound: any[] = [];
      for (const k of Object.keys(m)) {
        if (!k.startsWith('game')) continue;
        const g: any = m[k];
        if (!g || typeof g !== 'object' || !Array.isArray(g.playerStats)) continue;
        for (const p of g.playerStats) {
          const name = (p.name || p.riotId || '').toString();
          if (/^gps32$/i.test(name) || /\bgps32\b/i.test(name)) {
            playersFound.push({ game: k, name, tag: p.tag || '?', team: p.team || '?', puuid: p.puuid });
          }
        }
      }
      if (playersFound.length) {
        gpsMatches.push({
          matchId: m.id,
          team1Name: m.team1Name,
          team2Name: m.team2Name,
          startedAt: m.startedAt,
          bracketLabel: m.bracketLabel,
          bracketRound: m.bracketRound,
          gpsAppearances: playersFound,
          games: Object.keys(m)
            .filter(k => k.startsWith('game') && m[k]?.valorantMatchId)
            .map(k => ({
              game: k,
              valorantMatchId: m[k].valorantMatchId,
              mapName: m[k].mapName,
              roundsPlayed: m[k].roundsPlayed,
              winner: m[k].winner,
            })),
        });
      }
    }

    console.log(`\nGPS32 found in ${gpsMatches.length} Round 1 match(es):`);
    for (const m of gpsMatches) {
      console.log(`\n  match=${m.matchId}  ${m.team1Name} vs ${m.team2Name}`);
      console.log(`    bracketLabel: ${m.bracketLabel || '(none)'}  bracketRound: ${m.bracketRound}`);
      console.log(`    startedAt:    ${m.startedAt || '(none)'}`);
      console.log(`    appearances:`);
      for (const a of m.gpsAppearances) console.log(`      ${a.name}#${a.tag} on ${a.team} (${a.game}) puuid=${a.puuid?.slice(0, 8)}…`);
      console.log(`    games:`);
      for (const g of m.games) console.log(`      ${g.game}: ${g.mapName} matchId=${g.valorantMatchId} rounds=${g.roundsPlayed} winner=${g.winner}`);
    }

    const outPath = '/Users/sjain/Documents/iesports/iesports/web/scripts/_ascension_gps32.json';
    fs.writeFileSync(outPath, JSON.stringify({ tournamentId: t.id, gpsMatches }, null, 2));
    console.log(`\nSaved → ${outPath}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });

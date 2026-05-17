/**
 * Call /api/valorant/match-fetch with backoff on Henrik 429s.
 * Usage: npx tsx scripts/valFetchWithRetry.ts <valorantMatchId> <gameNumber>
 */
const [VID, GN] = process.argv.slice(2);
const BODY = {
  tournamentId: "league-of-rising-stars-ascension",
  adminKey: "iesports@1506",
  matchDocId: "round4-match2",
  valorantMatchId: VID,
  gameNumber: Number(GN),
  region: "ap",
};
const sleep = (ms:number)=>new Promise(r=>setTimeout(r,ms));

(async () => {
  for (let attempt=1; attempt<=5; attempt++) {
    const res = await fetch("http://localhost:3000/api/valorant/match-fetch", {
      method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(BODY),
    });
    const txt = await res.text();
    if (res.ok && !/\"error\"/.test(txt)) { console.log(`✅ G${GN} OK:`, txt.slice(0,1200)); return; }
    if (/429/.test(txt)) {
      const wait = 30000 + attempt*5000;
      console.log(`attempt ${attempt}: 429 rate-limited — waiting ${wait/1000}s…`);
      await sleep(wait);
      continue;
    }
    console.log(`attempt ${attempt}: non-429 response:`, txt.slice(0,800));
    if (attempt>=2) return; // a real error, stop
    await sleep(5000);
  }
  console.log("Gave up after retries (still 429 — Henrik key is heavily throttled).");
})();

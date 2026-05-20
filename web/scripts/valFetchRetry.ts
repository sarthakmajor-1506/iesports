/* Generalized match-fetch with Henrik 429 backoff.
   Usage: npx tsx scripts/valFetchRetry.ts <tournamentId> <matchDocId> <valMatchId> <gameNumber> [region] */
const [TID,MDOC,VID,GN,REGION="ap"]=process.argv.slice(2);
const BODY={tournamentId:TID,adminKey:"iesports@1506",matchDocId:MDOC,valorantMatchId:VID,gameNumber:Number(GN),region:REGION};
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  for(let a=1;a<=6;a++){
    const res=await fetch("http://localhost:3000/api/valorant/match-fetch",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(BODY)});
    const t=await res.text();
    if(res.ok && !/"error"/.test(t)){ console.log(`✅ G${GN} ${VID.slice(0,8)} OK: ${t.slice(0,1400)}`); return; }
    if(/429/.test(t)){ const w=35000+a*5000; console.log(`G${GN} attempt ${a}: 429 — wait ${w/1000}s`); await sleep(w); continue; }
    console.log(`G${GN} attempt ${a}: non-429 → ${t.slice(0,900)}`); if(a>=2) return; await sleep(6000);
  }
  console.log(`G${GN}: gave up (still 429).`);
})();

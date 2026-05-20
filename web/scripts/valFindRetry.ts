/* Retry match-find with in-process backoff until Henrik stops 429ing.
   Usage: npx tsx scripts/valFindRetry.ts <tournamentId> <matchDocId> [region] */
const [TID,MDOC,REGION="ap"]=process.argv.slice(2);
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  for(let a=1;a<=8;a++){
    const res=await fetch("http://localhost:3000/api/valorant/match-find",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({tournamentId:TID,adminKey:"iesports@1506",matchDocId:MDOC,region:REGION,size:12})});
    const j:any=await res.json().catch(()=>({}));
    const all429 = j?.debug?.seedAttempts?.length && j.debug.seedAttempts.every((s:any)=>/429/.test(s.error||""));
    if(j.found){ console.log("FOUND:\n"+JSON.stringify(j,null,2)); return; }
    if(!all429){ console.log(`attempt ${a}: not-429 result →\n`+JSON.stringify(j,null,2).slice(0,2500)); return; }
    const wait=35000+a*5000;
    console.log(`attempt ${a}: all 429 — waiting ${wait/1000}s…`);
    await sleep(wait);
  }
  console.log("Gave up — Henrik key still hard-throttled.");
})();

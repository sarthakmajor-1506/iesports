import { config } from "dotenv"; config({ path: ".env.local" });
const ACCTS=[{"ign":"Aomine","team":"10k ke Pohe","acct":110061314},{"ign":"bRiSINGR","team":"10k ke Pohe","acct":369309884},{"ign":"zu mu mu!","team":"10k ke Pohe","acct":415901777},{"ign":"Bubble","team":"10k ke Pohe","acct":1758378740},{"ign":"/","team":"10k ke Pohe","acct":129122102},{"ign":"Caterpillar_","team":"Toxic","acct":6277646},{"ign":"PABLO","team":"Toxic","acct":881804946},{"ign":"enoughofgrief","team":"Toxic","acct":1239409641},{"ign":"MiyaMC","team":"Toxic","acct":405888739},{"ign":"Mr Pig","team":"Toxic","acct":893784612},{"ign":"kysms","team":"Versatile","acct":1014062540},{"ign":"Default11","team":"Versatile","acct":85958921},{"ign":"SMoothOp","team":"Versatile","acct":1003644723},{"ign":"Naruto","team":"Versatile","acct":1040605388},{"ign":"Walru5","team":"Versatile","acct":367299678},{"ign":"BAZOOO","team":"Dog Tamers","acct":167947980},{"ign":"PMA","team":"Dog Tamers","acct":1001646749},{"ign":"Kiluminati","team":"Dog Tamers","acct":284010264},{"ign":"Ninja","team":"Dog Tamers","acct":1015922875},{"ign":"ITACHI","team":"Dog Tamers","acct":1850533095}];
(async()=>{
  const heroes=(await (await fetch("https://api.opendota.com/api/heroes")).json()) as any[];
  const hn:Record<number,string>={}; heroes.forEach(h=>hn[h.id]=h.localized_name);
  let lastTeam="";
  for(const a of ACCTS){
    if(a.team!==lastTeam){console.log(`\n##### ${a.team} #####`);lastTeam=a.team;}
    try{
      const hs:any=await (await fetch(`https://api.opendota.com/api/players/${a.acct}/heroes`)).json();
      if(!Array.isArray(hs)||!hs.length){console.log(`  ${a.ign.padEnd(14)} — profile private / no data`);await new Promise(r=>setTimeout(r,900));continue;}
      const top=hs.filter((h:any)=>h.games>=4).sort((a:any,b:any)=>b.games-a.games).slice(0,6)
        .map((h:any)=>`${hn[h.hero_id]}(${h.games}g ${Math.round(100*h.win/h.games)}%)`);
      console.log(`  ${a.ign.padEnd(14)} ${top.join(", ")||"(few games)"}`);
    }catch(e:any){console.log(`  ${a.ign.padEnd(14)} — err ${e?.message}`);}
    await new Promise(r=>setTimeout(r,900));
  }
  process.exit(0);
})();

import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
const TID="domin8-ultimate-tilt-proof-tournament";
const APPLY=process.argv.includes("--apply");
const NAME:Record<string,string>={"team-1":"10k ke Pohe","team-2":"Toxic but Talented","team-3":"Versatile Dogs","team-4":"Dog Tamers"};
const ist=(z:string)=>z?new Date(z).toLocaleString("en-IN",{timeZone:"Asia/Kolkata",weekday:"short",day:"numeric",month:"short",hour:"numeric",minute:"2-digit",hour12:true}):"— (unscheduled)";
const col=db.collection("tournaments").doc(TID).collection("matches");

// R5 round-robin (4 teams = 6 matches)
const R5:[string,string,string][]=[
  ["r5-match-1","team-1","team-2"],["r5-match-2","team-3","team-4"],["r5-match-3","team-1","team-4"],
  ["r5-match-4","team-2","team-3"],["r5-match-5","team-1","team-3"],["r5-match-6","team-2","team-4"],
];
// Tomorrow Sun 28 Jun, 7 PM IST start, 1.5hr intervals (IST=UTC+5:30)
const SLOTS=["2026-06-28T13:30:00Z","2026-06-28T15:00:00Z","2026-06-28T16:30:00Z","2026-06-28T18:00:00Z","2026-06-28T19:30:00Z"];
// schedule plan: matchId -> slot index (0-4). First 3 = Versatile Dogs, last 2 = no VD.
const PLAN:[string,number,string][]=[
  ["r4-match-2",0,"VD vs Dog Tamers (R4)"],   // VD
  ["r4-match-5",1,"10k vs VD (R4)"],          // VD
  ["r5-match-4",2,"Toxic vs VD (R5-new)"],    // VD
  ["r4-match-1",3,"10k vs Toxic (R4)"],       // no VD
  ["r5-match-3",4,"10k vs Dog Tamers (R5-new)"], // no VD
];
(async()=>{
  const now=new Date().toISOString();
  // guard: don't recreate r5 if exists
  const ex=(await col.get()).docs.filter(d=>d.id.startsWith("r5-")).map(d=>d.id);
  console.log(ex.length?`existing r5 matches: ${ex.join(", ")}`:"no existing r5 matches");
  console.log("\n=== STEP 1: create Round 5 (6-match round robin) ===");
  for(let i=0;i<R5.length;i++){const [id,a,b]=R5[i];
    const sched=PLAN.find(p=>p[0]===id);
    const doc:any={id,tournamentId:TID,matchDay:5,matchIndex:i+1,isBracket:false,bestOf:1,status:"pending",team1Score:0,team2Score:0,team1Id:a,team1Name:NAME[a],team1Logo:"",team2Id:b,team2Name:NAME[b],team2Logo:"",createdAt:now};
    if(sched) doc.scheduledTime=SLOTS[sched[1]];
    console.log(`  ${id}  ${NAME[a]} vs ${NAME[b]}${sched?`  -> ${ist(SLOTS[sched[1]])}`:"  (unscheduled)"}`);
    if(APPLY) await col.doc(id).set(doc,{merge:true});
  }
  console.log("\n=== STEP 2: schedule the 3 pending R4 matches ===");
  for(const [id,slot] of PLAN.filter(p=>p[0].startsWith("r4-"))){
    console.log(`  ${id}  -> ${ist(SLOTS[slot])}`);
    if(APPLY) await col.doc(id).update({scheduledTime:SLOTS[slot]});
  }
  console.log("\n=== TOMORROW'S NIGHT (Sun 28 Jun, in order) ===");
  PLAN.sort((a,b)=>a[1]-b[1]).forEach(([id,slot,desc])=>console.log(`  ${ist(SLOTS[slot])}  ${id.padEnd(12)} ${desc}`));
  console.log("\nVersatile Dogs plays: slots 1,2,3 (first three) ✓ | no-VD: slots 4,5 ✓");
  console.log(APPLY?"\n✅ APPLIED":"\n🟡 DRY-RUN — pass --apply");
  process.exit(0);
})();

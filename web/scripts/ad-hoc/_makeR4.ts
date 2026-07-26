import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
const TID="domin8-ultimate-tilt-proof-tournament";
const APPLY=process.argv.includes("--apply");
const NAME:Record<string,string>={"team-1":"10k ke Pohe","team-2":"Toxic but Talented","team-3":"Versatile Dogs","team-4":"Dog Tamers"};
// round-robin, ordered to minimize back-to-back (team-1 in games 1/3/5)
const pairs:[string,string][]=[["team-1","team-2"],["team-3","team-4"],["team-1","team-4"],["team-2","team-3"],["team-1","team-3"],["team-2","team-4"]];
// Sat 13 Jun 2026 IST night, 90-min slots from 11:00 PM IST (= 17:30Z)
const slots=["2026-06-13T17:30:00Z","2026-06-13T19:00:00Z","2026-06-13T20:30:00Z","2026-06-13T22:00:00Z","2026-06-13T23:30:00Z","2026-06-14T01:00:00Z"];
const ist=(z:string)=>new Date(z).toLocaleString("en-IN",{timeZone:"Asia/Kolkata",weekday:"short",day:"numeric",month:"short",hour:"numeric",minute:"2-digit",hour12:true});
(async()=>{
  const col=db.collection("tournaments").doc(TID).collection("matches");
  // guard: don't overwrite existing r4
  const ex=await col.get(); const has=ex.docs.filter(d=>d.id.startsWith("r4-")).map(d=>d.id);
  if(has.length){console.log("⚠️ existing r4 matches already present: "+has.join(", ")+" — aborting to avoid overwrite");process.exit(0);}
  const now=new Date().toISOString();
  console.log("ROUND 4 — Round Robin (6 matches, Sat 13 Jun):");
  for(let i=0;i<6;i++){
    const [a,b]=pairs[i]; const id=`r4-match-${i+1}`;
    const doc:any={ id, tournamentId:TID, matchDay:4, matchIndex:i+1, isBracket:false, bestOf:1,
      status:"pending", team1Score:0, team2Score:0,
      team1Id:a, team1Name:NAME[a], team1Logo:"", team2Id:b, team2Name:NAME[b], team2Logo:"",
      scheduledTime:slots[i], createdAt:now };
    console.log(`  ${id}  ${ist(slots[i])}   ${NAME[a]}  vs  ${NAME[b]}`);
    if(APPLY) await col.doc(id).set(doc);
  }
  console.log(APPLY?"\n✅ CREATED 6 round-4 matches":"\n🟡 DRY-RUN — pass --apply");
  process.exit(0);
})();

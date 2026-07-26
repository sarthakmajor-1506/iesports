import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
(async()=>{
  // teams
  const ts=await db.collection("tournaments").doc("domin8-ultimate-tilt-proof-tournament").collection("teams").get();
  console.log("TEAMS:");
  ts.docs.sort((a,b)=>a.id.localeCompare(b.id,undefined,{numeric:true})).forEach(t=>console.log("  "+t.id+" = "+(t.data() as any).teamName));
  // pristine pending r3 match shape (one that was never played)
  const m:any=(await db.collection("tournaments").doc("domin8-ultimate-tilt-proof-tournament").collection("matches").doc("r3-match-2").get()).data();
  console.log("\nr3-match-2 ALL keys:", Object.keys(m).join(", "));
  console.log("\nr3-match-2 base fields (the ones a fresh match needs):");
  ["tournamentId","matchDay","matchIndex","round","roundNumber","bracketLabel","bracketType","bracketRound","isBracket","bestOf","status","team1Score","team2Score","createdAt","scheduledTime"].forEach(k=>console.log("  "+k+" = "+JSON.stringify(m[k])));
  // does any match have a `round` field? check all r3
  const all=await db.collection("tournaments").doc("domin8-ultimate-tilt-proof-tournament").collection("matches").get();
  const days=new Set<any>(); const idxs:string[]=[];
  all.forEach(d=>{const x:any=d.data();if(d.id.startsWith("r3-")){days.add(x.matchDay);idxs.push(d.id+":idx"+x.matchIndex+":day"+x.matchDay);}});
  console.log("\nall r3 ids/matchDay/matchIndex:", idxs.join("  "));
  console.log("tournament.currentMatchDay?", JSON.stringify((await db.collection("tournaments").doc("domin8-ultimate-tilt-proof-tournament").get()).data()?.currentMatchDay));
  process.exit(0);
})();

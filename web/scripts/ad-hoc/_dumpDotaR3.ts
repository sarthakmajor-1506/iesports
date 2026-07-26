import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
const TID="domin8-ultimate-tilt-proof-tournament";
(async()=>{
  const tdoc=await db.collection("tournaments").doc(TID).get();
  const td:any=tdoc.data();
  console.log("TOURNAMENT keys:",Object.keys(td).join(", "));
  console.log("has schedule field:", !!td.schedule, Array.isArray(td.schedule)?`(array ${td.schedule.length})`:typeof td.schedule);
  // matches subcollection?
  const subs=await db.collection("tournaments").doc(TID).listCollections();
  console.log("subcollections:",subs.map(c=>c.id).join(", ")||"(none)");
  for(const c of subs){
    const ms=await db.collection("tournaments").doc(TID).collection(c.id).get();
    console.log(`\n## subcollection ${c.id} (${ms.size})`);
    ms.forEach(m=>{const d:any=m.data();
      if((d.round==3)||(d.roundNumber==3)||/R3|round-3|round3/i.test(m.id)||/R3/i.test(d.matchLabel||d.label||"")){
        console.log(`  [${m.id}] ${JSON.stringify(d)}`);
      }
    });
  }
  // also matches stored on tournament doc?
  if(td.matches){console.log("\nTOURNAMENT.matches:",JSON.stringify(td.matches).slice(0,3000));}
  if(td.bracket){console.log("\nTOURNAMENT.bracket keys:",Object.keys(td.bracket).join(","));console.log(JSON.stringify(td.bracket).slice(0,3000));}
  if(td.schedule){console.log("\nTOURNAMENT.schedule:",JSON.stringify(td.schedule).slice(0,3000));}
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});

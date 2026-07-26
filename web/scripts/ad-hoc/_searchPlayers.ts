import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
const want=["shrey","kattapa","onu","beck","afk","shubhan","shubhra","money","vanshaj"];
(async()=>{
  const ps=await db.collection("tournaments").doc("domin8-ultimate-tilt-proof-tournament").collection("players").get();
  console.log(`=== tournament players subcollection: ${ps.size} ===`);
  ps.forEach(p=>{const d:any=p.data();
    const blob=`${d.fullName||""} ${d.steamName||""} ${d.discordUsername||""} ${d.dotaName||""}`.toLowerCase();
    const hit=want.find(w=>blob.includes(w));
    if(hit) console.log(`  [match:${hit}] fullName="${d.fullName||""}" ign="${d.steamName||""}" discord="${d.discordUsername||""}" uid=${p.id}`);
  });
  console.log("\n=== users collection broad search ===");
  const us=await db.collection("users").get();
  let n=0;
  us.forEach(u=>{const d:any=u.data();
    const blob=`${d.fullName||""} ${d.steamName||""} ${d.discordUsername||""}`.toLowerCase();
    const hit=want.find(w=>blob.includes(w));
    if(hit){n++; if(n<=30) console.log(`  [${hit}] fullName="${d.fullName||""}" ign="${d.steamName||""}" discord="${d.discordUsername||""}" uid=${u.id}`);}
  });
  console.log(`(users scanned=${us.size}, matches=${n})`);
  process.exit(0);
})();

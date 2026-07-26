import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
const tokens=["kattapa","onu","beck","afk","shubhan"];
(async()=>{
  // unmatched current players' ALL name-ish fields
  console.log("=== 6 current players NOT in image (their aliases) ===");
  const ts=await db.collection("tournaments").doc("domin8-ultimate-tilt-proof-tournament").collection("teams").get();
  const keep=new Set(["bRiSINGR","zu mu mu!","Kiluminati..!","Aomine","ITACHI","PABLO","enoughofgrief-_-|","kysms","Default’11","Mr. Walru5","Naruto Uzumaki","BAZOOOㄨA|٢٨™","Ninja","Bubble"]);
  ts.docs.forEach(t=>{const d:any=t.data();(d.members||[]).forEach((p:any)=>{
    if(!keep.has(p.steamName||"")) console.log(`  ign="${p.steamName}" full="${p.fullName}" discord="${p.discordUsername}" riot="${p.riotGameName||""}" uid=${p.uid}`);
  });});
  console.log("\n=== users matching unknown tokens (any field incl riotGameName) ===");
  const us=await db.collection("users").get(); let n=0;
  us.forEach(u=>{const d:any=u.data();const blob=`${d.fullName||""} ${d.steamName||""} ${d.discordUsername||""} ${d.riotGameName||""} ${d.dotaName||""}`.toLowerCase();
    const hit=tokens.find(t=>blob.includes(t)); if(hit){n++; console.log(`  [${hit}] full="${d.fullName||""}" ign="${d.steamName||""}" disc="${d.discordUsername||""}" riot="${d.riotGameName||""}" uid=${u.id}`);}});
  console.log(`(matches=${n})`);
  process.exit(0);
})();

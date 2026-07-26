import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
const TID="league-of-rising-stars-ascension";
const norm=(p:string)=>{p=(p||"").replace(/[^0-9]/g,""); if(p.length===10)p="91"+p; return p;};
(async()=>{
  const st:any=(await db.collection("whatsappStatus").doc("state").get()).data();
  console.log("WA state:", st?.state||st?.status, "ready:", st?.ready, "lastSeen:", st?.lastSeen||st?.updatedAt);
  const m:any=(await db.collection("valorantTournaments").doc(TID).collection("matches").doc("lb-r1-m2").get()).data();
  console.log(`\nlb-r1-m2: ${m.team1Name} vs ${m.team2Name} status=${m.status} score=${m.team1Score}-${m.team2Score} winner=${m.winnerName||m.winnerId||"—"}`);
  const t:any=(await db.collection("valorantTournaments").doc(TID).collection("teams").doc("team-4").get()).data();
  console.log(`\nMUTH MANTRALAYA [team-4] group=${t.whatsappTeamGroupId}`);
  for(const p of (t.members||[])){
    const u:any=(await db.collection("users").doc(p.uid).get()).data();
    const phone=norm(u?.phone||p.phone||"");
    console.log(`  ${p.fullName||p.steamName} | ign=${p.steamName} | phone=${phone||"❌ MISSING"} | uid=${p.uid}`);
  }
  process.exit(0);
})();

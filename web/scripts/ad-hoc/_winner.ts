import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
const TID="league-of-rising-stars-ascension";
const norm=(p:string)=>{p=(p||"").replace(/[^0-9]/g,""); if(p.length===10)p="91"+p; return p;};
async function roster(teamId:string){
  const t:any=(await db.collection("valorantTournaments").doc(TID).collection("teams").doc(teamId).get()).data();
  const out:any[]=[];
  for(const p of (t.members||[])){const u:any=(await db.collection("users").doc(p.uid).get()).data();out.push({name:p.riotGameName||u?.fullName||p.uid,phone:norm(u?.phone||p.phone||"")});}
  return {name:t.teamName,group:t.whatsappTeamGroupId,players:out};
}
(async()=>{
  const m:any=(await db.collection("valorantTournaments").doc(TID).collection("matches").doc("lb-r1-m2").get()).data();
  console.log(`lb-r1-m2: ${m.team1Name} vs ${m.team2Name} status=${m.status} score=${m.team1Score}-${m.team2Score} winnerId=${m.winnerId||"—"} winnerName=${m.winnerName||"—"}`);
  // determine winner team id
  let winId=m.winnerId; if(!winId && m.team1Score!==m.team2Score) winId = m.team1Score>m.team2Score?m.team1Id:m.team2Id;
  console.log("resolved winnerId:",winId||"NONE");
  if(winId){
    const w=await roster(winId); const muth=await roster("team-4");
    console.log("\nWINNER:",JSON.stringify(w,null,1));
    console.log("\nMUTH:",JSON.stringify(muth,null,1));
  }
  process.exit(0);
})();

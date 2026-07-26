import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
const TID="league-of-rising-stars-ascension";
const dash="-";
(async()=>{
  const t:any=(await db.collection("valorantTournaments").doc(TID).get()).data();
  console.log("TOURNAMENT status="+t.status+" game="+t.game+" discord="+t.discordChannelId+" waGroup="+(t.whatsappGroupId||dash));
  const all=(await db.collection("valorantTournaments").doc(TID).collection("matches").get()).docs.map(d=>({id:d.id,...(d.data() as any)}));
  const done=all.filter((m:any)=>m.status==="completed");
  console.log("completed: "+done.length+" | have completedAt: "+done.filter((m:any)=>m.completedAt).length+" | have winnerName/Id: "+done.filter((m:any)=>m.winnerName||m.winnerId).length+" | draws: "+done.filter((m:any)=>m.team1Score===m.team2Score).length);
  done.slice(0,3).forEach((m:any)=>console.log("  "+m.id+" ["+(m.bracketLabel||"swiss")+"] "+m.team1Name+" "+m.team1Score+"-"+m.team2Score+" "+m.team2Name+" winner="+(m.winnerName||m.winnerId||dash)+" completedAt="+(m.completedAt||"MISSING")));
  const up=all.filter((m:any)=>m.status!=="completed"&&m.scheduledTime);
  console.log("upcoming w/ sched: "+up.length);
  up.slice(0,6).forEach((m:any)=>console.log("  "+m.id+" ["+(m.bracketLabel||"swiss")+"] "+m.status+" "+m.team1Name+" vs "+m.team2Name+" @ "+m.scheduledTime));
  process.exit(0);
})();

import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
const TID="league-of-rising-stars-ascension";
(async()=>{
  const t:any=(await db.collection("valorantTournaments").doc(TID).get()).data();
  console.log("championMembers:",JSON.stringify(t.championMembers||null).slice(0,300));
  const lb=await db.collection("valorantTournaments").doc(TID).collection("leaderboard").limit(2).get();
  console.log("\nleaderboard sample (keys):",lb.docs[0]?Object.keys(lb.docs[0].data()).join(", "):"EMPTY");
  lb.docs.forEach(d=>{const x:any=d.data();console.log(`  ${d.id}: name=${x.name||x.riotGameName} uid=${x.uid} rank=${x.iesportsRank||x.riotRank} K/D/A=${x.totalKills}/${x.totalDeaths}/${x.totalAssists}`);});
  console.log("leaderboard count:",(await db.collection("valorantTournaments").doc(TID).collection("leaderboard").get()).size);
  // team member shape (for roster display)
  const tm:any=(await db.collection("valorantTournaments").doc(TID).collection("teams").doc("team-6").get()).data();
  console.log("\nteam-6 member sample:",JSON.stringify((tm.members||[])[0]).slice(0,300));
  process.exit(0);
})();

import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
const TID="league-of-rising-stars-ascension";
const LRS_GROUP="120363409054463438@g.us";
(async()=>{
  // 1) enable WhatsApp mirror for the Valorant tournament (main LRS group)
  await db.collection("valorantTournaments").doc(TID).set({whatsappGroupId:LRS_GROUP},{merge:true});
  console.log("set valorant whatsappGroupId =",LRS_GROUP);
  // 2) backfill resultAnnouncedAt on all currently-completed valorant matches (anti-backblast)
  const ms=await db.collection("valorantTournaments").doc(TID).collection("matches").get();
  let n=0; for(const m of ms.docs){const d:any=m.data();if(d.status==="completed"&&!d.resultAnnouncedAt){await m.ref.set({resultAnnouncedAt:new Date().toISOString(),resultAnnouncedBackfill:true},{merge:true});n++;}}
  console.log("backfilled resultAnnouncedAt on "+n+" completed valorant matches (no backblast)");
  console.log("=> next NEW completion (e.g. lb-r2-m2 MUTH vs #METOO, live now) will auto-announce to Discord + LRS WhatsApp group");
  process.exit(0);
})();

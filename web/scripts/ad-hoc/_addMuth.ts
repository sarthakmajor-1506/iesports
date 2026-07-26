import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
const MUTH="120363408184829697@g.us";
const phones=["917470929889","919399729438","916232974749","919669802332","917999704001"];
(async()=>{
  const ref=await db.collection("whatsappOutbox").add({action:"add-participants",target:{id:MUTH},participantPhones:phones,sleep:[1200,2500],status:"pending",createdAt:new Date().toISOString(),source:"muth-roster-add"});
  console.log(`enqueued add-participants (${phones.length} players) -> MUTH group:`,ref.id);
  for(let i=0;i<30;i++){
    await new Promise(r=>setTimeout(r,2500));
    const d:any=(await ref.get()).data();
    if(d.status!=="pending"){
      console.log(`\n→ status=${d.status}`);
      if(d.error) console.log("error:",d.error);
      if(d.result) console.log("result:",JSON.stringify(d.result,null,1));
      process.exit(0);
    }
    process.stdout.write(".");
  }
  console.log("\nstill pending after 75s (adds are throttled, may still complete) — re-check the group");
  process.exit(0);
})();

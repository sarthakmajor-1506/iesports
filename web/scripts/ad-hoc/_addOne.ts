import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
const MUTH="120363408184829697@g.us";
(async()=>{
  const ref=await db.collection("whatsappOutbox").add({action:"add-participants",target:{id:MUTH},participantPhones:["919399729438"],status:"pending",createdAt:new Date().toISOString(),source:"add-one-test"});
  for(let i=0;i<15;i++){await new Promise(r=>setTimeout(r,2000));const d:any=(await ref.get()).data();if(d.status!=="pending"){console.log("ADD result:",JSON.stringify(d.settled||d.error));break;}}
  // re-check presence
  const ref2=await db.collection("whatsappOutbox").add({action:"group-info",target:{id:MUTH},checkPhone:"919399729438",status:"pending",createdAt:new Date().toISOString(),source:"diag2"});
  for(let i=0;i<12;i++){await new Promise(r=>setTimeout(r,2000));const d:any=(await ref2.get()).data();if(d.status!=="pending"){console.log("MUTH now:",JSON.stringify(d.settled||d.error));break;}}
  process.exit(0);
})();

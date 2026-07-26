import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
const MUTH="120363408184829697@g.us";
(async()=>{
  // test staff numbers (on WhatsApp, likely admins/contacts) to isolate player-specific vs community-wide
  const ref=await db.collection("whatsappOutbox").add({action:"add-participants",target:{id:MUTH},participantPhones:["919713770910","919752433957"],status:"pending",createdAt:new Date().toISOString(),source:"add-staff-test"});
  for(let i=0;i<15;i++){await new Promise(r=>setTimeout(r,2000));const d:any=(await ref.get()).data();if(d.status!=="pending"){console.log("staff add:",JSON.stringify(d.settled||d.error,null,1));break;}}
  // also: get the MUTH subgroup invite link (the workaround path)
  const ref2=await db.collection("whatsappOutbox").add({action:"get-invite",target:{id:MUTH},status:"pending",createdAt:new Date().toISOString(),source:"muth-link"});
  for(let i=0;i<12;i++){await new Promise(r=>setTimeout(r,2000));const d:any=(await ref2.get()).data();if(d.status!=="pending"){console.log("MUTH invite link:",JSON.stringify(d.settled||d.error));break;}}
  process.exit(0);
})();

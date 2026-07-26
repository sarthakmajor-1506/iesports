import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
(async()=>{
  for(const [label,gid] of [["MUTH","120363408184829697@g.us"],["#METOO","120363408716274772@g.us"]] as any){
    const ref=await db.collection("whatsappOutbox").add({action:"group-info",target:{id:gid},checkPhone:"919632866229",status:"pending",createdAt:new Date().toISOString(),source:"diag-staff"});
    for(let i=0;i<12;i++){await new Promise(r=>setTimeout(r,2000));const d:any=(await ref.get()).data();if(d.status!=="pending"){console.log(`${label}: 9632866229 present=${d.settled?.checkPhone?.present} | members=${d.settled?.memberCount}`);break;}}
  }
  process.exit(0);
})();

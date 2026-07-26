import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
(async()=>{
  const ref=await db.collection("whatsappOutbox").add({action:"get-invite",target:{id:"120363409054463438@g.us"},status:"pending",createdAt:new Date().toISOString(),source:"get-community-link"});
  for(let i=0;i<15;i++){await new Promise(r=>setTimeout(r,2000));const d:any=(await ref.get()).data();if(d.status!=="pending"){console.log("status:",d.status,"\nlink:",JSON.stringify(d.settled||d.error));process.exit(0);}}
  console.log("timeout"); process.exit(0);
})();

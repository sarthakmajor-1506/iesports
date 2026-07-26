import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
(async()=>{
  const ref=db.collection("whatsappOutbox").doc("q35mAsI0tUucg8yRClwn");
  const d:any=(await ref.get()).data();
  if(!d){console.log("doc gone");process.exit(0);}
  await ref.set({status:"pending",attempts:0,error:null,updatedAt:new Date().toISOString()},{merge:true});
  console.log("re-queued lb-r2-m2 result (target="+d.target?.id+"). It will send when the local bot restarts.");
  console.log("text:\n"+d.text);
  process.exit(0);
})();

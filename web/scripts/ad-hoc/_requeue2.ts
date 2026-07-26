import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
(async()=>{
  const ref=db.collection("whatsappOutbox").doc("m28G2HOuXTBjAPcjwcXt");
  await ref.set({status:"pending",attempts:0,error:null,updatedAt:new Date().toISOString()},{merge:true});
  console.log("re-queued ALPHAS result; waiting for send...");
  for(let i=0;i<15;i++){await new Promise(r=>setTimeout(r,2000));const d:any=(await ref.get()).data();if(d.status!=="pending"){console.log("-> status="+d.status+(d.error?" ERR:"+d.error:""));console.log("text:\n"+d.text);break;}}
  process.exit(0);
})();

import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
(async()=>{
  // cancel any pending result-announcer docs (the stuck lb-r2-m1 one)
  const q=await db.collection("whatsappOutbox").where("source","==","result-announcer").where("status","==","pending").get();
  for(const d of q.docs){await d.ref.set({status:"cancelled",reason:"manual-cancel-user",updatedAt:new Date().toISOString()},{merge:true});console.log("cancelled "+d.id+" dedupe="+(d.data() as any).dedupeKey);}
  console.log(q.empty?"(no pending result-announcer docs)":"done: "+q.size+" cancelled");
  process.exit(0);
})();

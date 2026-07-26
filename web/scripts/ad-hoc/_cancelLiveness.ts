import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
(async()=>{
  const q=await db.collection("whatsappOutbox").where("status","==","pending").where("source","==","liveness-check").get();
  for(const d of q.docs) await d.ref.delete();
  console.log(`cleaned ${q.size} liveness doc(s)`);
  process.exit(0);
})();

import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
(async()=>{
  const st:any=(await db.collection("whatsappStatus").doc("state").get()).data();
  console.log("WA bot: state="+st?.state+" lastSeen="+(st?.lastSeen||st?.updatedAt)+" note="+(st?.note||"-"));
  const d:any=(await db.collection("whatsappOutbox").doc("q35mAsI0tUucg8yRClwn").get()).data();
  console.log("re-queued doc: status="+d?.status+" attempts="+(d?.attempts||0)+" error="+(d?.error||"-")+" updatedAt="+(d?.updatedAt||"-"));
  // pending count
  const p=await db.collection("whatsappOutbox").where("status","==","pending").get();
  console.log("pending outbox docs: "+p.size);
  process.exit(0);
})();

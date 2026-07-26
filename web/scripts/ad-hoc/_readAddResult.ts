import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
(async()=>{
  const d:any=(await db.collection("whatsappOutbox").doc("QMgPGEEvTxGEkeHbE49D").get()).data();
  console.log("status:",d.status,"| all fields:",Object.keys(d).join(", "));
  console.log("result:",JSON.stringify(d.result,null,1));
  console.log("error:",d.error||"none");
  process.exit(0);
})();

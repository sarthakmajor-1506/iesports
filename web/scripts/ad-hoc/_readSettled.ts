import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
(async()=>{
  for(const src of ["metoo-roster-add","muth-roster-add"]){
    const q=await db.collection("whatsappOutbox").where("source","==",src).get();
    q.forEach(d=>{const x:any=d.data();
      console.log(`\n## ${src} [${d.id}] status=${x.status}`);
      console.log("phones:",JSON.stringify(x.participantPhones));
      console.log("settled:",JSON.stringify(x.settled,null,1));
    });
  }
  process.exit(0);
})();

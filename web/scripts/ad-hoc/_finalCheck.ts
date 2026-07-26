import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
(async()=>{
  const q=await db.collection("whatsappOutbox").where("source","==","result-announcer").get();
  const by:Record<string,number>={}; const stuck:any[]=[];
  q.docs.forEach(d=>{const x:any=d.data();by[x.status]=(by[x.status]||0)+1;if(x.status!=="sent")stuck.push({id:d.id,status:x.status,target:x.target?.id,dedupe:x.dedupeKey,err:x.error});});
  console.log("result-announcer docs by status:",JSON.stringify(by));
  if(stuck.length){console.log("STUCK (not sent):");stuck.forEach(s=>console.log("  ",JSON.stringify(s).slice(0,160)));}else console.log("✅ all result-announcer messages sent");
  const st:any=(await db.collection("whatsappStatus").doc("state").get()).data();
  console.log("WA bot: state="+st?.state+" lastSeen="+(st?.lastSeen||st?.updatedAt));
  process.exit(0);
})();

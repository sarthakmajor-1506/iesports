import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
const MUTH="120363408184829697@g.us";
(async()=>{
  const ref=await db.collection("whatsappOutbox").add({action:"get-invite",target:{id:MUTH},status:"pending",createdAt:new Date().toISOString(),source:"liveness-check"});
  console.log("enqueued liveness get-invite:",ref.id,"— waiting up to 40s for the bot to process...");
  for(let i=0;i<20;i++){
    await new Promise(r=>setTimeout(r,2000));
    const d:any=(await ref.get()).data();
    if(d.status!=="pending"){console.log(`\n→ bot processed it: status=${d.status} ${d.result?`result=${JSON.stringify(d.result).slice(0,120)}`:""} ${d.error?`error=${d.error}`:""}`);console.log("✅ BOT IS ALIVE — outbox is being drained");process.exit(0);}
    process.stdout.write(".");
  }
  console.log("\n→ still PENDING after 40s. ❌ The whatsapp bot is NOT draining the outbox (not connected).");
  process.exit(0);
})();

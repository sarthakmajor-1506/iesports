import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
const MUTH="120363408184829697@g.us";
(async()=>{
  const st:any=(await db.collection("whatsappStatus").doc("state").get()).data();
  console.log("WA state doc:", st?.state||st?.status, "lastSeen:", st?.lastSeen||st?.updatedAt);
  const ref=await db.collection("whatsappOutbox").add({action:"get-invite",target:{id:MUTH},status:"pending",createdAt:new Date().toISOString(),source:"liveness-check"});
  console.log("liveness get-invite:",ref.id,"— waiting up to 30s...");
  for(let i=0;i<15;i++){
    await new Promise(r=>setTimeout(r,2000));
    const d:any=(await ref.get()).data();
    if(d.status!=="pending"){console.log(`→ status=${d.status} ${d.result?"invite="+JSON.stringify(d.result).slice(0,90):""} ${d.error?"error="+d.error:""}`); console.log(d.status==="sent"?"✅ BOT ALIVE & draining":"⚠️ processed with error"); process.exit(0);}
    process.stdout.write(".");
  }
  console.log("\n❌ still pending — bot not draining");
  process.exit(0);
})();

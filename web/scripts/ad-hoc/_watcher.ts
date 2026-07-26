import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
console.log("[watcher] auto-requeue for failed result-announcer WA messages — running ~3h");
(async()=>{
  for(let i=0;i<120;i++){ // ~120 * 90s = 3h
    try{
      const q=await db.collection("whatsappOutbox").where("source","==","result-announcer").where("status","==","error").get();
      for(const d of q.docs){ await d.ref.set({status:"pending",attempts:0,error:null,updatedAt:new Date().toISOString()},{merge:true}); console.log(`[watcher] re-queued ${d.id} (${(d.data() as any).target?.id})`); }
      if(q.size) console.log(`[watcher] cycle ${i}: re-queued ${q.size}`);
    }catch(e:any){console.error("[watcher] err:",e?.message||e);}
    await new Promise(r=>setTimeout(r,90000));
  }
  console.log("[watcher] done (3h elapsed)");
})();

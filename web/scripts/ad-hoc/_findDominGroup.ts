import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
(async()=>{
  const d:any=(await db.collection("whatsappStatus").doc("debugGroups").get()).data();
  (d?.groups||[]).forEach((g:any)=>{const n=(g.name||g.subject||"");if(/domin|dota|tilt|ultimate|general|iesports/i.test(n))console.log(`  "${n}" ${g.id||g.gid}`);});
  // dota tournament whatsapp group field?
  const t:any=(await db.collection("tournaments").doc("domin8-ultimate-tilt-proof-tournament").get()).data();
  console.log("dota tournament WA fields:", JSON.stringify({wa:t?.whatsappGroupId,master:t?.whatsappMasterGroupId,comm:t?.communityGroupId,discord:t?.discordChannelId}));
  process.exit(0);
})();

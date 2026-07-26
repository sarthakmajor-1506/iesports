import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
(async()=>{
  const d:any=(await db.collection("whatsappStatus").doc("debugGroups").get()).data();
  const groups=d?.groups||d?.list||[];
  console.log(`debugGroups dumped: ${groups.length} (as of ${d?.lastSeen||d?.checkedAt||"?"})`);
  groups.forEach((g:any)=>{const name=(g.name||g.subject||"").toString();
    if(/rising|lrs|master|announce|main|community|ascension|league/i.test(name)) console.log(`  ⭐ "${name}" id=${g.id||g.gid}`);
  });
  console.log("--- all groups (name → id) ---");
  groups.slice(0,40).forEach((g:any)=>console.log(`  "${g.name||g.subject}" ${g.id||g.gid}`));
  process.exit(0);
})();

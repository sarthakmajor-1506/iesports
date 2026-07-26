import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
const PHONE="919399729438";
const targets=[
  ["MUTH group","120363408184829697@g.us"],
  ["LRS Ascension announce","120363409054463438@g.us"],
  ["iesports A","120363406769069584@g.us"],
  ["iesports B","120363407941588357@g.us"],
];
(async()=>{
  for(const [label,gid] of targets){
    const ref=await db.collection("whatsappOutbox").add({action:"group-info",target:{id:gid},checkPhone:PHONE,status:"pending",createdAt:new Date().toISOString(),source:"diag"});
    let done=false;
    for(let i=0;i<12;i++){await new Promise(r=>setTimeout(r,2000));const d:any=(await ref.get()).data();if(d.status!=="pending"){console.log(`\n${label} (${gid}):`);console.log("  "+(d.error?("ERR: "+d.error):JSON.stringify(d.settled)));done=true;break;}}
    if(!done)console.log(`\n${label}: timeout`);
  }
  process.exit(0);
})();

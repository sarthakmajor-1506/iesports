import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
const METOO="120363408716274772@g.us";
async function getInvite(gid:string){const ref=await db.collection("whatsappOutbox").add({action:"get-invite",target:{id:gid},status:"pending",createdAt:new Date().toISOString(),source:"link"});for(let i=0;i<12;i++){await new Promise(r=>setTimeout(r,2000));const d:any=(await ref.get()).data();if(d.status!=="pending")return d.settled||("ERR:"+d.error);}return "timeout";}
(async()=>{
  const metooLink=await getInvite(METOO);
  console.log("#METOO link:",metooLink);
  console.log("MUTH link: https://chat.whatsapp.com/EtB4HmKyM193DOzo8sP1eB");
  process.exit(0);
})();

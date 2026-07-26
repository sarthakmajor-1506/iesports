import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
const MAIN="120363409054463438@g.us";
const msg=`🎮 *JOIN YOUR TEAM GROUP* — your match insights & scouting are posted inside!\nTap your team's link 👇 (instant — you're already in the community)\n\n🔱 *MUTH MANTRALAYA* → https://chat.whatsapp.com/EtB4HmKyM193DOzo8sP1eB\n🚀 *#METOO ESPORTS* → https://chat.whatsapp.com/GDffdvV13iJHVly2J1VYEK\n\n_LB R2: MUTH MANTRALAYA vs #METOO ESPORTS — get in, prep, and good luck!_ 🔥`;
(async()=>{
  const ref=await db.collection("whatsappOutbox").add({action:"send-text",target:{type:"group",id:MAIN},text:msg,status:"pending",createdAt:new Date().toISOString(),source:"team-join-links"});
  for(let i=0;i<15;i++){await new Promise(r=>setTimeout(r,2000));const d:any=(await ref.get()).data();if(d.status!=="pending"){console.log("join message:",d.status,d.error||"");break;}}
  process.exit(0);
})();

import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
const TID="league-of-rising-stars-ascension";
const MID="lb-r1-m2";
const TEST_GROUP="120363426643253610@g.us";
const tref=db.collection("valorantTournaments").doc(TID);
const mref=tref.collection("matches").doc(MID);
(async()=>{
  const t:any=(await tref.get()).data();
  const m:any=(await mref.get()).data();
  const saved={discord:t.discordChannelId, wa:t.whatsappGroupId, completedAt:m.completedAt, announced:m.resultAnnouncedAt};
  console.log("saved:",JSON.stringify(saved));
  try{
    // arm test: WA->test group, suppress Discord, make lb-r1-m2 fresh+unannounced
    await tref.set({whatsappGroupId:TEST_GROUP, discordChannelId:FieldValue.delete()},{merge:true});
    await mref.set({resultAnnouncedAt:FieldValue.delete(), completedAt:new Date().toISOString()},{merge:true});
    console.log("ARMED — waiting up to 180s for the Railway announcer (runs every ~60s)...");
    const dedupe=`result-${TID}-${MID}`;
    let fired=false, delivered=false;
    for(let i=0;i<60;i++){
      await new Promise(r=>setTimeout(r,3000));
      const mm:any=(await mref.get()).data();
      const q=await db.collection("whatsappOutbox").where("dedupeKey","==",dedupe).limit(1).get();
      if(!q.empty){const d:any=q.docs[0].data(); fired=true;
        if(d.status!=="pending"){delivered=true; console.log(`\n✅ ANNOUNCER FIRED + WA ${d.status} to test group`); console.log("   WA text:\n   "+String(d.text).replace(/\n/g,"\n   ")); break;}
        else process.stdout.write("(enqueued,draining)");
      } else if(mm.resultAnnouncedAt){process.stdout.write("[marked]");} else process.stdout.write(".");
    }
    if(!fired) console.log("\n⚠️ announcer did NOT fire in 180s — Railway may still be deploying the new build, or check bot logs.");
    else if(!delivered) console.log("\n⚠️ enqueued but local WA bot didn't drain it (check local bot).");
  } finally {
    // REVERT (resultAnnouncedAt stays as the announcer set it, so it won't re-fire to the real group)
    await tref.set({whatsappGroupId:saved.wa, discordChannelId:saved.discord||FieldValue.delete()},{merge:true});
    await mref.set({completedAt:saved.completedAt},{merge:true});
    console.log("\nreverted: whatsappGroupId + discordChannelId restored, completedAt restored.");
    const chk:any=(await tref.get()).data();
    console.log("verify: whatsappGroupId="+chk.whatsappGroupId+" discordChannelId="+chk.discordChannelId);
  }
  process.exit(0);
})();

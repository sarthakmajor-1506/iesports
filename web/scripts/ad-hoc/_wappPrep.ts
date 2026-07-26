import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
const TID="league-of-rising-stars-ascension";
(async()=>{
  console.log("=== WhatsApp bot status ===");
  const ws=await db.collection("whatsappStatus").get().catch(()=>null);
  if(ws&&!ws.empty) ws.forEach(d=>{const x:any=d.data();console.log(`  ${d.id}: state=${x.state||x.status||x.connection||"?"} ready=${x.ready??"?"} lastSeen=${x.lastSeen||x.updatedAt||x.checkedAt||"?"}`);});
  else console.log("  (no whatsappStatus docs)");

  console.log("\n=== LB matches (#METOO vs RR + MUTH next) ===");
  const ms=await db.collection("valorantTournaments").doc(TID).collection("matches").get();
  ms.forEach(d=>{const m:any=d.data();
    if(/METOO|RADIANT|MUTH/i.test(`${m.team1Name} ${m.team2Name}`) || /lb/i.test(m.bracketLabel||""))
      console.log(`  [${m.bracketLabel||(m.isBracket?"bracket":"swiss")}] ${d.id}: ${m.team1Name} vs ${m.team2Name} status=${m.status} score=${m.team1Score}-${m.team2Score} winner=${m.winnerName||m.winnerId||"—"} winnerGoesTo=${m.winnerGoesTo||"—"}`);
  });

  console.log("\n=== team WA groups + rosters ===");
  const teams=await db.collection("valorantTournaments").doc(TID).collection("teams").get();
  teams.forEach(t=>{const d:any=t.data();
    if(/METOO|RADIANT|MUTH/i.test(d.teamName||"")) console.log(`  ${d.teamName} [${t.id}] waGroup=${d.whatsappTeamGroupId||"—"} members=${(d.members||[]).length}`);
  });

  console.log("\n=== community / main group config ===");
  const cfg=await db.collection("config").doc("whatsapp").get().catch(()=>null);
  if(cfg&&cfg.exists) console.log("  config/whatsapp:",JSON.stringify(cfg.data()).slice(0,500));
  const td:any=(await db.collection("valorantTournaments").doc(TID).get()).data();
  console.log("  tournament masterGroup:",td?.whatsappMasterGroupId||td?.whatsappGroupId||td?.communityGroupId||"—","| discordChannelId:",td?.discordChannelId||"—");
  process.exit(0);
})();

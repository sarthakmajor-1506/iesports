import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
const TID="domin8-ultimate-tilt-proof-tournament", MID="r3-match-2";
(async()=>{
  const mref=db.collection("tournaments").doc(TID).collection("matches").doc(MID);
  await mref.update({
    status:"pending", team1Score:0, team2Score:0,
    lobbyStatus:FieldValue.delete(), lobbyName:FieldValue.delete(), lobbyPassword:FieldValue.delete(),
    lobbyMode:FieldValue.delete(), lobbySetAt:FieldValue.delete(), lastSetLobbyDiag:FieldValue.delete(),
    botQueueId:FieldValue.delete(), team1Subs:FieldValue.delete(), team2Subs:FieldValue.delete(),
    vetoState:FieldValue.delete(), game1:FieldValue.delete(), games:FieldValue.delete(),
    dotaMatchId:FieldValue.delete(), winner:FieldValue.delete(), winnerTeamId:FieldValue.delete(),
    completedAt:FieldValue.delete(), startedAt:FieldValue.delete(), durationSec:FieldValue.delete(),
    result:FieldValue.delete(), waitingRoomVcId:FieldValue.delete(), team1VcId:FieldValue.delete(),
    team2VcId:FieldValue.delete(), vcStatus:FieldValue.delete(), discordOpsMessageIds:FieldValue.delete(),
    resultMessageId:FieldValue.delete(), resultMessageChannelId:FieldValue.delete(),
  });
  const qs=await db.collection("botQueues").where("tournamentId","==",TID).where("tournamentMatchId","==",MID).get();
  for(const q of qs.docs) await q.ref.delete();
  const m:any=(await mref.get()).data();
  console.log(`AFTER: status=${m.status} lobbyStatus=${m.lobbyStatus??"—"} dotaMatchId=${m.dotaMatchId??"—"} botQueueId=${m.botQueueId??"—"} game1=${m.game1?"present":"—"} | botQueues deleted: ${qs.size}`);
  process.exit(0);
})();

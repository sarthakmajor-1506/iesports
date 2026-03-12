import { initializeApp, cert, getApps, getApp } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";
let db: Firestore;
export function initFirebase(): Firestore { if(!getApps().length){initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID!,clientEmail:process.env.FIREBASE_CLIENT_EMAIL!,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})})} db=getFirestore(getApp()); return db; }
export function getDb(): Firestore { if(!db) throw new Error("Firebase not init"); return db; }
export interface WebUser { uid:string; steamId:string; steamName:string; discordId:string; }
export async function findUserByDiscordId(discordId:string): Promise<WebUser|null> { const s=await getDb().collection("users").where("discordId","==",discordId).limit(1).get(); if(s.empty) return null; const d=s.docs[0]; const data=d.data(); return {uid:d.id,steamId:data.steamId||"",steamName:data.steamName||"",discordId:data.discordId||""}; }
export function steamIdToSteam32(id64:string):string { return (BigInt(id64)-BigInt("76561197960265728")).toString(); }
export interface QueuePlayer { discordId:string; username:string; steamId:string|null; steam32Id:string|null; steamName:string|null; joinedAt:string; }
export interface QueueDoc { id:string; name:string; type:"free"|"wager"|"sponsored"; entryFee:number; bonus:number; sponsorId:string|null; players:QueuePlayer[]; maxPlayers:number; status:"open"|"locked"|"in_progress"|"completed"; createdAt:string; createdBy:string; lobbyId:string|null; messageId:string|null; scheduledTime:string|null; }
export async function createQueue(data:Omit<QueueDoc,"id">):Promise<string> { const r=await getDb().collection("botQueues").add(data); await r.update({id:r.id}); return r.id; }
export async function getQueue(id:string):Promise<QueueDoc|null> { const d=await getDb().collection("botQueues").doc(id).get(); return d.exists?({...d.data(),id:d.id} as QueueDoc):null; }
export async function addPlayerToQueue(queueId:string,player:QueuePlayer):Promise<{success:boolean;position:number;error?:string}> { const ref=getDb().collection("botQueues").doc(queueId); return getDb().runTransaction(async tx=>{const s=await tx.get(ref);const d=s.data() as QueueDoc;if(!d) return{success:false,position:0,error:"Not found"};if(d.status!=="open") return{success:false,position:0,error:"Closed"};if(d.players.some(p=>p.discordId===player.discordId)) return{success:false,position:0,error:"Already in"};if(d.players.length>=d.maxPlayers) return{success:false,position:0,error:"Full"};d.players.push(player);tx.update(ref,{players:d.players});return{success:true,position:d.players.length};}); }
export async function removePlayerFromQueue(queueId:string,discordId:string):Promise<boolean> { const ref=getDb().collection("botQueues").doc(queueId); return getDb().runTransaction(async tx=>{const s=await tx.get(ref);const d=s.data() as QueueDoc;if(!d) return false;const b=d.players.length;d.players=d.players.filter(p=>p.discordId!==discordId);if(d.players.length===b) return false;tx.update(ref,{players:d.players});return true;}); }
export async function updateQueue(queueId:string,data:Partial<QueueDoc>|string):Promise<void> { 
  const update = typeof data === "string" ? { status: data as QueueDoc["status"] } : data;
  await getDb().collection("botQueues").doc(queueId).update(update); 
}
export interface MatchPlayer { discordId:string; username:string; steamId:string|null; steam32Id:string|null; steamName:string|null; }
export interface LobbyDoc { id:string; queueId:string; gcLobbyId:string|null; lobbyName:string; password:string; gameMode:string; serverRegion:string; radiant:MatchPlayer[]; dire:MatchPlayer[]; spectators:MatchPlayer[]; status:"waiting"|"active"|"completed"|"cancelled"; dotaMatchId:string|null; winner:"radiant"|"dire"|null; mvp:any|null; duration:string|null; playerStats:any[]|null; createdAt:string; completedAt:string|null; }
export async function saveLobby(data:Omit<LobbyDoc,"id">):Promise<string> { const r=await getDb().collection("botLobbies").add(data); await r.update({id:r.id}); return r.id; }
export async function getLobby(id:string):Promise<LobbyDoc|null> { const d=await getDb().collection("botLobbies").doc(id).get(); return d.exists?({...d.data(),id:d.id} as LobbyDoc):null; }
export async function updateLobby(id:string,data:Partial<LobbyDoc>):Promise<void> { await getDb().collection("botLobbies").doc(id).update(data); }
export async function getActiveLobby():Promise<LobbyDoc|null> { const s=await getDb().collection("botLobbies").where("status","in",["waiting","active"]).orderBy("createdAt","desc").limit(1).get(); if(s.empty) return null; return{...s.docs[0].data(),id:s.docs[0].id} as LobbyDoc; }
export async function saveDailyRecord(date:string,data:any):Promise<void> { await getDb().collection("botDailyRecords").doc(date).set(data,{merge:true}); }

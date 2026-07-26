import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
const TID="domin8-ultimate-tilt-proof-tournament";
const APPLY=process.argv.includes("--apply");
// new rosters by uid, in image order (I..V). label = image name (for display only in this log)
const NEW: Record<string,[string,string][]> = {
  "team-1": [["discord_475274594802991105","Nivesh"],["steam_76561198329575612","Brisingr"],["discord_443481547249811468","Zumumu"],["discord_1364667323860127815","Vanshaj"],["steam_76561198089387830","Shrey"]],
  "team-2": [["discord_364743440715612160","Beck"],["discord_665194485650685963","Pablo"],["discord_718122172610117643","Nikhil"],["discord_257510407571243008","AFK"],["discord_360748823905304577","Shubhanshu"]],
  "team-3": [["discord_394429076158545920","Civic"],["steam_76561198046224649","Default"],["discord_754777338058899539","Onu"],["discord_722068528076816424","Naruto"],["discord_735213506105835650","Walrus"]],
  "team-4": [["discord_827178822847430677","Bazooka"],["steam_76561198961912477","Kattapa"],["discord_444438240095633408","Money"],["steam_76561198976188603","Ninja"],["discord_703754385909350400","Itachi"]],
};
(async()=>{
  // map uid -> full member object from current teams
  const ts=await db.collection("tournaments").doc(TID).collection("teams").get();
  const byUid:Record<string,any>={}; const teamName:Record<string,string>={};
  ts.forEach(t=>{const d:any=t.data();teamName[t.id]=d.teamName;(d.members||[]).forEach((p:any)=>byUid[p.uid]=p);});
  const allCurrent=new Set(Object.keys(byUid));
  const used=new Set<string>();
  // build member object for a uid (existing, or fetch user for NEW additions)
  async function member(uid:string){
    if(byUid[uid]) return byUid[uid];
    const u:any=(await db.collection("users").doc(uid).get()).data();
    if(!u) throw new Error("user not found: "+uid);
    return {uid, fullName:u.fullName||"", steamName:u.steamName||u.fullName||uid, steamAvatar:u.steamAvatar||"", dotaMMR:u.dotaMMR||0, dotaRankTier:u.dotaRankTier||0, dotaBracket:u.dotaBracket||"", discordId:u.discordId||"", discordUsername:u.discordUsername||"", iesportsRating:u.iesportsRating||0, skillLevel:u.skillLevel||0, rolePreferences:u.rolePreferences||[], assignedRole:null, assignedRoleLabel:""};
  }
  for(const [teamId,roster] of Object.entries(NEW)){
    console.log(`\n## ${teamId} "${teamName[teamId]}"`);
    const members:any[]=[];
    for(const [uid,label] of roster){
      const m=await member(uid); used.add(uid);
      const was=Object.keys(byUid).includes(uid)?(ts.docs.find(t=>(t.data() as any).members?.some((x:any)=>x.uid===uid))?.id):"NEW";
      console.log(`  ${label.padEnd(11)} ign="${m.steamName}" uid=${uid}  (was: ${was})`);
      members.push(m);
    }
    if(APPLY){
      const total=members.reduce((s,m)=>s+(m.skillLevel||0),0);
      await db.collection("tournaments").doc(TID).collection("teams").doc(teamId).update({members, totalSkillLevel:total, avgSkillLevel: total/members.length});
    }
  }
  const dropped=[...allCurrent].filter(u=>!used.has(u));
  console.log("\nDROPPED (on no team):", dropped.map(u=>`${byUid[u].steamName}(${u})`).join(", ")||"none");
  console.log(APPLY?"\n✅ APPLIED":"\n🟡 DRY-RUN — pass --apply");
  process.exit(0);
})();

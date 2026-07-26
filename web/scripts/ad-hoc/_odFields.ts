(async()=>{
  const j:any=await (await fetch("https://api.opendota.com/api/matches/8840753040")).json();
  console.log("top: radiant_win",j.radiant_win,"dur",j.duration,"radiant_score",j.radiant_score,"dire_score",j.dire_score,"leagueid",j.leagueid,"picks_bans?",Array.isArray(j.picks_bans),(j.picks_bans||[]).length);
  const p=(j.players||[])[0];
  console.log("\nplayer[0] available fields:",Object.keys(p||{}).filter(k=>/account|persona|hero_id|kills|deaths|assists|last_hits|denies|gold_per_min|xp_per_min|hero_damage|tower_damage|hero_healing|level|net_worth|isRadiant|item_|win/.test(k)).join(", "));
  console.log("sample:",JSON.stringify({acct:p?.account_id,name:p?.personaname,hero:p?.hero_id,k:p?.kills,d:p?.deaths,a:p?.assists,nw:p?.net_worth,gpm:p?.gold_per_min,xpm:p?.xp_per_min,lh:p?.last_hits,dn:p?.denies,hd:p?.hero_damage,td:p?.tower_damage,hh:p?.hero_healing,lvl:p?.level,rad:p?.isRadiant,items:[p?.item_0,p?.item_1,p?.item_2,p?.item_3,p?.item_4,p?.item_5]}));
  console.log("\npicks_bans sample:",JSON.stringify((j.picks_bans||[]).slice(0,4)));
})();

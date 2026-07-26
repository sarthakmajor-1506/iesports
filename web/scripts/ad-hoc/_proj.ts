const MAP_MIN=-8000,MAP_SPAN=16000;
const projX=(x:number)=>Math.max(0,Math.min(100,((x-MAP_MIN)/MAP_SPAN)*100));
const projY=(y:number)=>Math.max(0,Math.min(100,(1-(y-MAP_MIN)/MAP_SPAN)*100));
const pts=[["Major DarkSeer (Dire fountain)",7136,6688],["Radiant fountain ~",-7000,-6500],["mid ~",0,0],["full-game sample",-7062,-1137]];
for(const [n,x,y] of pts as any) console.log(`${n}: world(${x},${y}) -> left ${projX(x).toFixed(0)}% top ${projY(y).toFixed(0)}%`);

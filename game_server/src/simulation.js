import { config } from './config.js';
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const average=(xs)=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:45;
const shapes={
 '4-3-3':{GK:1,CB:2,LB:1,RB:1,DM:1,CM:2,LW:1,RW:1,ST:1},
 '4-4-2':{GK:1,CB:2,LB:1,RB:1,CM:2,LW:1,RW:1,ST:2},
 '4-2-3-1':{GK:1,CB:2,LB:1,RB:1,DM:2,AM:1,LW:1,RW:1,ST:1},
 '3-5-2':{GK:1,CB:3,DM:1,CM:2,LW:1,RW:1,ST:2},
 '4-1-4-1':{GK:1,CB:2,LB:1,RB:1,DM:1,CM:2,LW:1,RW:1,ST:1}
};
export function squadStrength(players,formation='4-3-3') {
 if (!Array.isArray(players)||players.length<11) return 35;
 const starters=players.slice(0,11);
 const base=average(starters.map(p=>Number(p.overall)||40));
 const fitness=average(starters.map(p=>Number(p.fitness??100)));
 const expected=shapes[formation]||shapes['4-3-3'];
 const actual={};for(const p of starters)actual[p.position]=(actual[p.position]||0)+1;
 const keys=new Set([...Object.keys(expected),...Object.keys(actual)]);
 const mismatch=[...keys].reduce((sum,key)=>sum+Math.abs((actual[key]||0)-(expected[key]||0)),0);
 const shapeBonus=clamp(4-mismatch*0.75,-4,4);
 return clamp(base*(0.9+fitness/1000)+shapeBonus,25,100);
}
function poisson(lambda,rng) {
 const limit=Math.exp(-lambda);let k=0,product=1;
 do{k++;product*=rng();}while(product>limit&&k<8);
 return Math.max(0,k-1);
}
export function simulateMatch(homePlayers,awayPlayers,options={}) {
 const rng=options.random||Math.random;
 const homeStrength=squadStrength(homePlayers,options.homeFormation||'4-3-3')*(1+config.matchHomeAdvantage);
 const awayStrength=squadStrength(awayPlayers,options.awayFormation||'4-3-3');
 const share=homeStrength/(homeStrength+awayStrength);
 const homeGoals=poisson(0.55+share*1.85,rng);
 const awayGoals=poisson(0.55+(1-share)*1.85,rng);
 const events=[];
 const count=homeGoals+awayGoals;
 let hg=0,ag=0;
 for(let i=0;i<count;i++){
  const minute=4+Math.floor(rng()*87);
  const side=(hg<homeGoals&&ag<awayGoals)?(rng()<share?'home':'away'):(hg<homeGoals?'home':'away');
  if(side==='home')hg++;else ag++;
  events.push({minute,type:'goal',side,homeScore:hg,awayScore:ag,text:side==='home'?'Home team scores':'Away team scores'});
 }
 for(const item of [[12,'chance','A dangerous attack'],[28,'save','A goalkeeper makes a save'],[43,'chance','A late first-half chance'],[61,'attack','Pressure builds in the final third'],[76,'chance','A chance opens up'],[89,'attack','Last-minute pressure']]){
  if(rng()>0.42)events.push({minute:item[0],type:item[1],side:rng()<share?'home':'away',text:item[2]});
 }
 events.sort((a,b)=>a.minute-b.minute);
 let chronologicalHome=0,chronologicalAway=0;
 for(const event of events)if(event.type==='goal'){if(event.side==='home')chronologicalHome++;else chronologicalAway++;event.homeScore=chronologicalHome;event.awayScore=chronologicalAway;}
 return {homeGoals,awayGoals,events,homeStrength:Number(homeStrength.toFixed(1)),awayStrength:Number(awayStrength.toFixed(1))};
}

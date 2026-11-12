import test from 'node:test';
import assert from 'node:assert/strict';
import {formations,FORMATION_IDS,POSITIONS,ROLES,isFormation,analyseLineup,arrange,slotFit,fitBonus,bestLineup,FIT_BONUS_MAX} from '../src/formations.js';
import {repairLineup,isValidLineup,lineupProblem,formationShapes} from '../src/lineup.js';
import {simulateMatch,squadStrength,lineupStrength} from '../src/simulation.js';
import {academySquadTemplate} from '../src/catalog.js';

const APPROVED=['4-3-3','4-2-3-1','4-4-2','4-1-4-1','4-4-1-1','3-5-2','3-4-3','3-4-2-1','5-3-2','5-4-1','4-2-2-2','4-3-2-1'];
// The intended XI of a formation: one player in the first natural position of every slot.
const natural=(id,overall=60)=>formations[id].slots.map((s,i)=>({id:id+'-'+i,position:s.natural[0],overall,fitness:100}));
const squad=()=>academySquadTemplate.map(([position,overall],i)=>({id:'p'+String(i).padStart(2,'0'),position,overall}));
function mulberry32(a){return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
// n matches, alternating venue; the record of side A in percent and points per match.
function record(a,fa,b,fb,{n=40000,seed=1}={}){
 const random=mulberry32(seed);let w=0,d=0,goals=0,against=0;
 for(let i=0;i<n;i++){
  const home=i%2===0,r=simulateMatch(home?a:b,home?b:a,{random,homeFormation:home?fa:fb,awayFormation:home?fb:fa});
  const ga=home?r.homeGoals:r.awayGoals,gb=home?r.awayGoals:r.homeGoals;
  if(ga>gb)w++;else if(ga===gb)d++;goals+=ga;against+=gb;
 }
 return {win:w/n*100,draw:d/n*100,points:(3*w+d)/n,goals:(goals+against)/n,scored:goals/n,conceded:against/n};
}

// ---- Formation definitions ----
test('exactly the 12 approved formations exist',()=>{
 assert.deepEqual([...FORMATION_IDS].sort(),[...APPROVED].sort());
 assert.equal(FORMATION_IDS.length,12);
 for(const id of APPROVED)assert.ok(isFormation(id));
 for(const bad of ['9-9-9','4-3-3 ','433','',null,undefined,7,'constructor','__proto__','toString',['4-3-3']])assert.equal(isFormation(bad),false,String(bad));
 assert.ok(FORMATION_IDS.every(id=>id.length<=8),'fits the lineups.formation column');
});
test('every formation has 11 distinct slots, one goalkeeper, and the outfield lines of its name',()=>{
 for(const id of APPROVED){
  const f=formations[id];
  assert.equal(f.slots.length,11,id);
  assert.equal(new Set(f.slots.map(s=>s.id)).size,11,id+' slot ids are unique');
  assert.equal(f.slots.filter(s=>s.role==='GK').length,1,id+' has one goalkeeper slot');
  assert.equal(f.slots.filter(s=>s.natural.includes('GK')||s.cover.includes('GK')).length,1,id+' only the goalkeeper slot takes a goalkeeper');
  // The first number of the name is the defenders; the name counts ten outfield players.
  const wanted=id.split('-').map(Number),count=roles=>f.slots.filter(s=>roles.includes(s.role)).length;
  assert.equal(wanted.reduce((a,b)=>a+b,0),10,id);
  assert.equal(count(['CB','LB','RB']),wanted[0],id+' defenders');
  assert.deepEqual(Object.keys(f.slots[0]).sort(),['cover','id','natural','role'],id+' slots carry roles only, no pitch coordinates');
 }
});
test('every slot mapping uses only the supported player positions',()=>{
 for(const id of APPROVED)for(const s of formations[id].slots){
  assert.ok(ROLES[s.role],id+' '+s.id);assert.ok(s.natural.length>=1);
  for(const p of s.natural.concat(s.cover))assert.ok(POSITIONS.includes(p),id+' '+s.id+' '+p);
  assert.equal(new Set(s.natural.concat(s.cover)).size,s.natural.length+s.cover.length,id+' '+s.id+' natural and cover do not overlap');
 }
 assert.deepEqual(POSITIONS,['GK','CB','LB','RB','DM','CM','AM','LW','RW','ST']);
});
test('every formation keeps a headline shape of eleven natural positions',()=>{
 assert.equal(Object.keys(formationShapes).length,12);
 for(const shape of Object.values(formationShapes))assert.equal(Object.values(shape).reduce((a,b)=>a+b,0),11);
});

// ---- Arrangement and validation ----
test('the intended XI of every formation is arranged with eleven natural roles and no slot used twice',()=>{
 for(const id of APPROVED){
  const xi=natural(id),shuffled=xi.slice().reverse(),a=analyseLineup(shuffled,id);
  assert.equal(a.valid,true,id);assert.equal(a.natural,11,id);assert.equal(a.fit,11,id);assert.equal(a.fitBonus,FIT_BONUS_MAX,id);
  assert.equal(new Set(a.slots.map(s=>s.playerId)).size,11,id+' every player placed once');
  assert.equal(lineupProblem(id,shuffled.map(p=>p.id),shuffled),null,id);
 }
});
test('arrangement never duplicates a player or a slot (20,000 random XIs)',()=>{
 const random=mulberry32(11);
 for(let n=0;n<20000;n++){
  const id=APPROVED[Math.floor(random()*12)],size=Math.floor(random()*12);
  const positions=Array.from({length:size},()=>POSITIONS[Math.floor(random()*10)]),placed=arrange(positions,id);
  assert.equal(placed.length,size);assert.equal(new Set(placed).size,size);assert.ok(placed.every(s=>s>=0&&s<11));
  if(size===11){
   const xi=positions.map((position,i)=>({id:'r'+i,position,overall:60})),a=analyseLineup(xi,id);
   assert.equal(a.natural+a.cover+a.outOfPosition,11);assert.equal(a.fit,a.natural+a.cover/2);
   // Valid only if every player really is natural or cover where he was put.
   assert.equal(a.valid,a.slots.every(s=>slotFit(formations[id].slots.find(x=>x.id===s.slot),s.position)>0));
  }
 }
});
test('lineup rules: count, duplicates, goalkeeper, ownership, formation and position mapping',()=>{
 for(const id of APPROVED){
  const xi=natural(id),ids=xi.map(p=>p.id),keeper=xi.find(p=>p.position==='GK'),outfield=xi.filter(p=>p.position!=='GK');
  assert.match(lineupProblem(id,ids.slice(0,10),xi),/exactly 11/,id+' ten players');
  assert.match(lineupProblem(id,ids.concat(['extra']),xi.concat([{id:'extra',position:'CM'}])),/exactly 11/,id+' twelve players');
  assert.match(lineupProblem(id,ids.slice(0,10).concat([ids[0]]),xi),/exactly 11 unique/,id+' duplicate');
  assert.match(lineupProblem(id,ids,xi.filter(p=>p!==outfield[0])),/outside this club/,id+' foreign player');
  const noKeeper=xi.map(p=>p===keeper?{...p,position:'CM'}:p);
  assert.match(lineupProblem(id,ids,noKeeper),/must include a goalkeeper/,id+' no goalkeeper');
  const twoKeepers=xi.map(p=>p===outfield[0]?{...p,position:'GK'}:p);
  assert.match(lineupProblem(id,ids,twoKeepers),/exactly one goalkeeper/,id+' two goalkeepers');
  // Ten strikers behind a goalkeeper fit no formation, and the club has players who do.
  const strikers=xi.map(p=>p===keeper?p:{...p,position:'ST'}),others=natural(id).map(p=>({...p,id:'alt-'+p.id}));
  assert.match(lineupProblem(id,ids,strikers.concat(others)),/cannot be filled/,id+' invalid mapping');
  assert.equal(lineupProblem('4-5-1',ids,xi),'Unsupported formation');
 }
 // One out-of-position player is enough: with a centre-back in place of the striker nobody can lead a 4-3-3.
 const xi=natural('4-3-3');xi[10]={...xi[10],position:'CB'};
 const problem=lineupProblem('4-3-3',xi.map(p=>p.id),xi.concat([{id:'spare',position:'ST',overall:50}]));assert.match(problem,/cannot be filled/);assert.match(problem,/no valid player for [A-Z]+ \([A-Z]+ out of position\)/);
 // The same swap is acceptable where a cover role exists: a full-back may cover at centre-back.
 const cover=natural('4-3-3');cover[2]={...cover[2],position:'RB'};
 assert.equal(lineupProblem('4-3-3',cover.map(p=>p.id),cover),null);assert.equal(analyseLineup(cover,'4-3-3').cover,1);
});
test('the academy squad can field a valid XI in all 12 formations, and best XI never repeats a player',()=>{
 const players=squad();
 for(const id of APPROVED){
  const best=bestLineup(players,id);
  assert.equal(best.valid,true,id);assert.equal(best.starters.length,11);assert.equal(new Set(best.starters).size,11);
  assert.equal(best.substitutes.length,7);assert.ok(best.substitutes.every(x=>!best.starters.includes(x)));
  assert.equal(lineupProblem(id,best.starters,players),null,id);
  assert.ok(isValidLineup(best.starters,players));
 }
 // 4-3-3 is the shape the academy squad was built for: its first eleven is the best XI.
 assert.deepEqual(bestLineup(players,'4-3-3').starters.slice().sort(),players.slice(0,11).map(p=>p.id).sort());
});
test('thin and unusual squads: best XI reports honestly, repair still fields eleven unique players',()=>{
 const make=list=>list.map((position,i)=>({id:'t'+String(i).padStart(2,'0'),position,overall:50+(i%7)}));
 const cases={
  'no wide players':make(['GK','CB','CB','CB','CB','DM','DM','CM','CM','CM','AM','ST','ST']),
  'no DM or AM':make(['GK','CB','CB','CB','LB','RB','CM','CM','CM','LW','RW','ST','ST']),
  'one goalkeeper, 13 players':make(['GK','CB','CB','LB','RB','DM','CM','CM','AM','LW','RW','ST','ST']),
  'attackers only':make(['GK','ST','ST','ST','ST','ST','ST','LW','RW','AM','AM','AM','ST']),
  'three goalkeepers on a short bench':make(['GK','GK','GK','CB','CB','LB','RB','DM','CM','CM','LW','RW','ST'])
 };
 for(const [label,players] of Object.entries(cases))for(const id of APPROVED){
  const best=bestLineup(players,id);
  assert.equal(best.starters.length,11,label+' '+id);assert.equal(new Set(best.starters).size,11);
  assert.equal(lineupProblem(id,best.starters,players),null,label+' '+id+' the best XI a squad can field is always accepted');
  const team=best.starters.map(x=>players.find(p=>p.id===x));
  assert.equal(best.valid,analyseLineup(team,id).valid,label+' '+id+' valid flag is honest');
  const r=repairLineup({formation:id,starters:[],substitutes:[],players});
  assert.ok(isValidLineup(r.starters,players),label+' '+id);
  assert.equal(r.starters.filter(x=>players.find(p=>p.id===x).position==='GK').length,1,label+' '+id+' one goalkeeper');
  assert.ok(squadStrength(r.starters.map(x=>players.find(p=>p.id===x)),id)>=25);
 }
 assert.equal(bestLineup(cases['attackers only'],'5-4-1').valid,false);
 // A squad with no wide players is suited to a narrow shape: more natural roles in 4-2-2-2 than in 4-3-3.
 const narrow=cases['no wide players'],fitIn=id=>analyseLineup(bestLineup(narrow,id).starters.map(x=>narrow.find(p=>p.id===x)),id);
 assert.ok(fitIn('4-2-2-2').natural>fitIn('4-3-3').natural);assert.ok(fitIn('4-2-2-2').fitBonus>fitIn('4-3-3').fitBonus);
});
test('repair fills a vacancy with a natural player, then cover, then the same line, in every formation',()=>{
 for(const id of APPROVED){
  const xi=natural(id),gone=xi[10],slot=formations[id].slots[10];
  const bench=[{id:'nat',position:slot.natural[0],overall:41},{id:'cov',position:slot.cover[0],overall:70},{id:'far',position:'CB',overall:88},{id:'gk2',position:'GK',overall:90}];
  const starters=xi.map(p=>p.id);
  let players=xi.filter(p=>p!==gone).concat(bench);
  assert.deepEqual(repairLineup({formation:id,starters,substitutes:[],players}).promoted,['nat'],id+' natural first');
  players=players.filter(p=>p.id!=='nat');
  assert.deepEqual(repairLineup({formation:id,starters,substitutes:[],players}).promoted,['cov'],id+' then cover');
  players=players.filter(p=>p.id!=='cov');
  const r=repairLineup({formation:id,starters,substitutes:[],players});
  assert.deepEqual(r.promoted,['far'],id+' an outfield player before a second goalkeeper');
  assert.equal(new Set(r.starters).size,11);
 }
});

// ---- Suitability ----
test('formation fit is bounded, monotonic with mismatch, and identical for every formation',()=>{
 assert.equal(fitBonus(11),4);assert.equal(fitBonus(10.5),3.25);assert.equal(fitBonus(10),2.5);assert.equal(fitBonus(0),-4);
 for(let f=0;f<=11;f+=0.5){assert.ok(fitBonus(f)<=4&&fitBonus(f)>=-4);if(f)assert.ok(fitBonus(f)>=fitBonus(f-0.5));}
 for(const id of APPROVED){
  assert.equal(squadStrength(natural(id),id),64,id+' intended XI: 60 + 4, the same for every formation');
  // Turn one more player into a goalkeeper each step: strength can only fall, and never below 60 - 4.
  let previous=Infinity;
  for(let wrong=0;wrong<=10;wrong++){
   const xi=natural(id).map((p,i)=>i>0&&i<=wrong?{...p,position:'GK'}:p),s=squadStrength(xi,id);
   assert.ok(s<=previous,id+' '+wrong+' wrong');assert.ok(s>=56&&s<=64);previous=s;
  }
  assert.equal(previous,56,id+' worst case');
  assert.equal(squadStrength(natural(id).slice(0,10),id),35);
 }
});
test('suitability depends on the players: the same squad is stronger in the shape it suits',()=>{
 const players=squad(),byId=new Map(players.map(p=>[p.id,p]));
 const strength=Object.fromEntries(APPROVED.map(id=>[id,squadStrength(bestLineup(players,id).starters.map(x=>byId.get(x)),id)]));
 assert.equal(Math.max(...Object.values(strength)),strength['4-3-3'],'the academy squad is built for 4-3-3');
 assert.ok(strength['4-3-3']-Math.min(...Object.values(strength))<=4,'the gap between best and worst shape stays modest');
 assert.ok(new Set(Object.values(strength).map(x=>x.toFixed(2))).size>=4,'formations are not interchangeable for this squad');
 // A squad built around two strikers and two playmakers prefers 4-2-2-2 to 4-3-3.
 const narrow=natural('4-2-2-2').concat([{id:'b1',position:'CM',overall:55},{id:'b2',position:'CB',overall:55}]),nb=new Map(narrow.map(p=>[p.id,p]));
 const at=id=>squadStrength(bestLineup(narrow,id).starters.map(x=>nb.get(x)),id);
 assert.ok(at('4-2-2-2')>at('4-3-3')+2);
 // The fit of the saved XI is what counts, not the formation's name.
 assert.ok(squadStrength(natural('4-3-3'),'4-3-3')>squadStrength(natural('4-3-3'),'5-4-1'));
 assert.ok(squadStrength(natural('5-4-1'),'5-4-1')>squadStrength(natural('5-4-1'),'4-3-3'));
});

test('all 12 formations enter simulation and are fair with equal squads in their intended shapes',()=>{
 const report=[];
 for(const [i,id] of APPROVED.entries()){
  const r=simulateMatch(natural(id),natural('4-3-3'),{random:mulberry32(i+1),homeFormation:id,awayFormation:'4-3-3'});
  assert.equal(r.homeStrength,64);assert.equal(r.awayStrength,64);
  assert.ok(Number.isInteger(r.homeGoals)&&Number.isInteger(r.awayGoals));
  assert.equal(r.events.filter(e=>e.type==='goal').length,r.homeGoals+r.awayGoals);
  assert.ok(r.events.every(e=>e.type!=='kickoff'&&e.minute>0),id+' no extra kickoff event');
  assert.deepEqual(Object.keys(r).sort(),['awayGoals','awayStrength','events','homeGoals','homeStrength'],id+' result carries no tactical fields');
  // Against the whole field (equal ratings, every opponent in its own intended shape): no formation-name bias.
  let points=0,goals=0;
  for(const [j,other] of APPROVED.entries()){const x=record(natural(id),id,natural(other),other,{n:6000,seed:1000+i*12+j});points+=x.points;goals+=x.goals;}
  points/=12;goals/=12;report.push(id.padEnd(8)+points.toFixed(3)+'  '+goals.toFixed(2));
  assert.ok(Math.abs(points-1.38)<=0.03,id+' points per match against the field: '+points.toFixed(3));
  assert.ok(Math.abs(goals-2.95)<=0.05,id+' goals per match: '+goals.toFixed(2));
 }
 console.log('formation  pts/match  goals/match (equal squads, against all 12)\n'+report.join('\n'));
});
test('formations differ only through fit: with natural XIs every pairing plays exactly like a mirror match',()=>{
 // Same seed, same ratings, different shapes: the results are identical match for match.
 for(const [a,b] of [['5-4-1','4-2-2-2'],['3-4-3','4-1-4-1'],['4-2-3-1','5-3-2']]){
  const one=record(natural(a),a,natural(b),b,{n:4000,seed:9}),mirror=record(natural('4-3-3'),'4-3-3',natural('4-3-3'),'4-3-3',{n:4000,seed:9});
  assert.deepEqual(one,mirror,a+' v '+b);
 }
});
test('against stronger and weaker opponents every formation keeps the approved rating curve',()=>{
 for(const [i,id] of APPROVED.entries()){
  const stronger=record(natural(id,66),id,natural('4-3-3',60),'4-3-3',{n:20000,seed:200+i});
  const weaker=record(natural(id,54),id,natural('4-3-3',60),'4-3-3',{n:20000,seed:300+i});
  assert.ok(Math.abs(stronger.points-1.59)<=0.09,id+' at +6: '+stronger.points.toFixed(3));
  assert.ok(Math.abs(weaker.points-1.14)<=0.09,id+' at -6: '+weaker.points.toFixed(3));
  assert.ok(stronger.points>weaker.points+0.3);
 }
});
test('a formation the players cannot play costs strength through the fit penalty',()=>{
 const xi=natural('4-3-3');
 const fitted=lineupStrength(xi,'4-3-3'),misused=lineupStrength(xi,'5-4-1');
 assert.equal(fitted.fit,11);assert.ok(misused.fit<fitted.fit);assert.ok(misused.strength<fitted.strength);
 const r=record(xi,'5-4-1',natural('4-3-3'),'4-3-3',{seed:71});
 assert.ok(r.points<1.38,'a 4-3-3 squad sent out as 5-4-1 does worse: '+r.points.toFixed(3));
});

// ---- Backward compatibility: lineups saved before roles were validated ----
test('every XI the previous rules produced for the five original formations is still accepted',()=>{
 const old={'4-3-3':{GK:1,CB:2,LB:1,RB:1,DM:1,CM:2,LW:1,RW:1,ST:1},'4-4-2':{GK:1,CB:2,LB:1,RB:1,CM:2,LW:1,RW:1,ST:2},'4-2-3-1':{GK:1,CB:2,LB:1,RB:1,DM:2,AM:1,LW:1,RW:1,ST:1},'3-5-2':{GK:1,CB:3,DM:1,CM:2,LW:1,RW:1,ST:2},'4-1-4-1':{GK:1,CB:2,LB:1,RB:1,DM:1,CM:2,LW:1,RW:1,ST:1}};
 for(const [id,shape] of Object.entries(old)){
  const xi=Object.entries(shape).flatMap(([position,n])=>Array.from({length:n},(_,i)=>({id:position+i,position,overall:60,fitness:100})));
  const a=analyseLineup(xi,id);
  assert.equal(a.natural,11,id+' the old perfect shape is eleven natural roles');assert.equal(a.fitBonus,4);
  assert.equal(lineupProblem(id,xi.map(p=>p.id),xi.concat(natural(id).map(p=>({...p,id:'alt-'+p.id})))),null,id);
 }
});
test('a saved lineup is never locked: unchanged it is accepted again, and it can be improved but not made worse',()=>{
 const players=squad(),ids=p=>p.map(x=>x.id),by=position=>players.filter(p=>p.position===position);
 const first=players.slice(0,11);
 // Legacy XI: a striker where a centre-back should be (the old rules accepted any eleven with a goalkeeper).
 const legacy=first.map(p=>p===first.find(x=>x.position==='CB')?by('ST').find(x=>!first.includes(x)):p);
 assert.equal(analyseLineup(legacy,'5-4-1').valid,false);
 const saved={formation:'5-4-1',starters:ids(legacy)};
 assert.match(lineupProblem('5-4-1',ids(legacy),players),/cannot be filled/,'a new club could not save it');
 assert.equal(lineupProblem('5-4-1',ids(legacy),players,saved),null,'the club that already has it can save it again');
 assert.equal(lineupProblem('5-4-1',ids(legacy).reverse(),players,saved),null,'in any order');
 const before=analyseLineup(legacy,'5-4-1').outOfPosition;
 // One change that leaves it no worse is accepted; one that adds a player out of position is refused.
 const wrong=analyseLineup(legacy,'5-4-1').slots.filter(s=>s.fit===0).map(s=>s.playerId);
 const spareBack=players.find(p=>!legacy.includes(p)&&['CB','LB','RB'].includes(p.position));
 const better=legacy.map(p=>p.id===wrong[0]?spareBack:p);
 assert.ok(analyseLineup(better,'5-4-1').outOfPosition<before);
 assert.equal(lineupProblem('5-4-1',ids(better),players,saved),null,'improving it step by step is accepted');
 const keeper=legacy.find(p=>p.position==='GK'),fine=legacy.find(p=>p!==keeper&&!wrong.includes(p.id)&&['CB','LB','RB'].includes(p.position));
 const worse=legacy.map(p=>p===fine?by('ST').concat(by('AM'),by('LW'),by('RW')).find(x=>!legacy.includes(x)):p);
 assert.ok(analyseLineup(worse,'5-4-1').outOfPosition>before);
 assert.match(lineupProblem('5-4-1',ids(worse),players,saved),/cannot be filled/,'making it worse is refused');
 // The allowance belongs to the saved formation only.
 assert.match(lineupProblem('5-4-1',ids(legacy),players,{formation:'4-3-3',starters:ids(legacy)}),/cannot be filled/);
 // A legacy XI with two goalkeepers: accepted unchanged, refused once it is edited and still has two.
 const second=by('GK').find(p=>p!==keeper),two=first.map(p=>p===first.find(x=>x.position==='ST')?second:p),savedTwo={formation:'4-3-3',starters:ids(two)};
 assert.equal(lineupProblem('4-3-3',ids(two),players,savedTwo),null);
 assert.match(lineupProblem('4-3-3',ids(two),players),/exactly one goalkeeper/);
 const edited=two.map(p=>p===two.find(x=>x.position==='CM')?players.find(x=>x.position==='CM'&&!two.includes(x)):p);
 assert.match(lineupProblem('4-3-3',ids(edited),players,savedTwo),/exactly one goalkeeper/);
 // Essential rules are never relaxed, saved or not.
 const noKeeper=first.map(p=>p===keeper?players.find(x=>x.position==='CM'&&!first.includes(x)):p);
 assert.match(lineupProblem('4-3-3',ids(noKeeper),players,{formation:'4-3-3',starters:ids(noKeeper)}),/must include a goalkeeper/);
 assert.equal(lineupProblem('4-5-1',ids(legacy),players,{formation:'4-5-1',starters:ids(legacy)}),'Unsupported formation');
 assert.match(lineupProblem('5-4-1',ids(legacy).slice(1).concat(['ghost']),players,saved),/outside this club/);
});
test('a squad that cannot fill a formation is not locked out of it',()=>{
 const make=list=>list.map((position,i)=>({id:'t'+String(i).padStart(2,'0'),position,overall:50+(i%7)}));
 const players=make(['GK','ST','ST','ST','ST','ST','ST','LW','RW','AM','AM','AM','ST','CM']);
 for(const id of APPROVED){
  const best=bestLineup(players,id),team=best.starters.map(x=>players.find(p=>p.id===x)),least=analyseLineup(team,id).outOfPosition;
  assert.equal(lineupProblem(id,best.starters,players),null,id+' best possible XI is accepted');
  // Any XI that is as well placed as the squad allows is accepted; nothing with more players out of position than that.
  const swap=players.find(p=>!team.includes(p)&&p.position!=='GK'),other=team.map(p=>p===team.find(x=>x.position==='CM'||x.position==='AM')?swap:p);
  const n=analyseLineup(other,id).outOfPosition;
  assert.equal(lineupProblem(id,other.map(p=>p.id),players)===null,n<=least,id);
 }
});

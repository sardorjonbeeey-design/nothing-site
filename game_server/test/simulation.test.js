import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateMatch,squadStrength,goalShare,MATCH_RATING_SCALE,MATCH_HOME_ADVANTAGE_POINTS} from '../src/simulation.js';

const team=(rating)=>Array.from({length:11},(_,i)=>({id:String(i),overall:rating,position:i===0?'GK':'CM',fitness:100}));

test('squad strength requires a complete starting eleven',()=>{
 assert.equal(squadStrength(team(70).slice(0,10)),35);
 assert.ok(squadStrength(team(70))>65);
});

test('match simulation returns bounded integer score and ordered events',()=>{
 const result=simulateMatch(team(80),team(50),{random:()=>0.5});
 assert.ok(Number.isInteger(result.homeGoals));
 assert.ok(Number.isInteger(result.awayGoals));
 assert.ok(result.homeGoals>=0&&result.homeGoals<=7);
 assert.ok(result.awayGoals>=0&&result.awayGoals<=7);
 assert.deepEqual(result.events.map(e=>e.minute),result.events.map(e=>e.minute).slice().sort((a,b)=>a-b));
 const goals=result.events.filter(e=>e.type==='goal');
 assert.equal(goals.length,result.homeGoals+result.awayGoals);
 if(goals.length){assert.equal(goals.at(-1).homeScore,result.homeGoals);assert.equal(goals.at(-1).awayScore,result.awayGoals);}
 assert.ok(result.homeStrength>result.awayStrength);
});

test('simulation supports a seeded random generator',()=>{
 let seed=123456789;
 const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
 const a=simulateMatch(team(64),team(62),{random});
 seed=123456789;
 const b=simulateMatch(team(64),team(62),{random});
 assert.equal(a.homeGoals,b.homeGoals);
 assert.equal(a.awayGoals,b.awayGoals);
 assert.deepEqual(a.events,b.events);
});

test('formation fit changes squad strength',()=>{
 const positions=['GK','CB','CB','LB','RB','DM','CM','CM','LW','RW','ST'];
 const balanced=positions.map(position=>({position,overall:70,fitness:100}));
 assert.ok(squadStrength(balanced,'4-3-3')>squadStrength(balanced,'4-4-2'));
});

// ---- Match-engine verification: S = 40, home advantage +2 rating points ----
function mulberry32(a){return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const shape433=['GK','CB','CB','LB','RB','DM','CM','CM','LW','RW','ST'];
const side=(rating,positions=shape433)=>positions.map(position=>({position,overall:rating,fitness:100}));
// Plays n matches, alternating home and away, and reports the first side's record in percent.
function record(a,b,{n=40000,seed=1,formationA='4-3-3',formationB='4-3-3'}={}){
 const random=mulberry32(seed);let w=0,d=0,l=0,homeWins=0,goals=0;
 for(let i=0;i<n;i++){
  const home=i%2===0,r=simulateMatch(home?a:b,home?b:a,{random,homeFormation:home?formationA:formationB,awayFormation:home?formationB:formationA});
  const ga=home?r.homeGoals:r.awayGoals,gb=home?r.awayGoals:r.homeGoals;
  if(ga>gb)w++;else if(ga===gb)d++;else l++;
  if(r.homeGoals>r.awayGoals)homeWins++;goals+=r.homeGoals+r.awayGoals;
 }
 return {win:w/n*100,draw:d/n*100,loss:l/n*100,points:(3*w+d)/n,homeWin:homeWins/n*100,goals:goals/n};
}
const near=(actual,expected,tolerance,label)=>assert.ok(Math.abs(actual-expected)<=tolerance,label+': '+actual.toFixed(2)+' not within '+tolerance+' of '+expected);

test('approved match constants and goal-share curve',()=>{
 assert.equal(MATCH_RATING_SCALE,40);assert.equal(MATCH_HOME_ADVANTAGE_POINTS,2);
 near(goalShare(60,60),1/(1+10**(-2/40)),1e-12,'equal sides');
 near(goalShare(58,60),0.5,1e-12,'a 2-point deficit cancels home advantage');
 assert.ok(goalShare(70,60)>goalShare(64,60));
 near(goalShare(80,54)+goalShare(54-2-2,80),1,1e-12,'symmetric curve');
});
test('win rates across rating gaps match the approved S=40 table',()=>{
 // gap -> [win %, points per match] for the stronger side, home and away averaged.
 const approved={0:[38,1.38],3:[41,1.47],6:[45,1.59],10:[49,1.72],15:[55,1.87],20:[60,2.01],26:[64,2.12]};
 let previous=0;
 for(const [gap,[win,points]] of Object.entries(approved)){
  const r=record(side(54+Number(gap)),side(54),{seed:100+Number(gap)});
  near(r.win,win,2,'win % at +'+gap);near(r.points,points,0.05,'points at +'+gap);
  assert.ok(r.points>previous,'points rise with the gap');previous=r.points;
  assert.ok(r.loss>=10,'the weaker side still wins sometimes at +'+gap);
 }
});
test('the same gap is worth the same at every rating level',()=>{
 for(const gap of [6,15]){
  const levels=[46,54,62,70,80].map((base,i)=>record(side(base+gap),side(base),{seed:300+gap*10+i}).points);
  assert.ok(Math.max(...levels)-Math.min(...levels)<0.06,'gap '+gap+': '+levels.map(x=>x.toFixed(2)).join(', '));
 }
});
test('home advantage and scoring level',()=>{
 const equal=record(side(60),side(60),{seed:7});
 near(equal.homeWin,40,2,'home win % between equal sides');near(equal.win,equal.loss,2,'no advantage besides venue');
 near(equal.goals,2.95,0.1,'goals per match');
 near(record(side(80),side(54),{seed:8}).goals,2.95,0.1,'goals per match with a large gap');
 near(record(side(62),side(60),{seed:9}).points,record(side(60),side(60),{seed:9}).points+0.07,0.05,'+2 rating is roughly worth home advantage');
});
test('a wrong shape costs strength, bounded at 8 points in the worst case (all 12 formations: formations.test.js)',()=>{
 assert.equal(squadStrength(side(60),'4-3-3'),64,'matched shape gets the full +4');
 const mismatched=squadStrength(side(60),'3-5-2');
 assert.ok(mismatched<64&&mismatched>=56,'mismatch penalty is bounded: '+mismatched);
 const r=record(side(60),side(60),{seed:900,formationA:'3-5-2'});
 assert.ok(r.points<1.38,'playing a 4-3-3 squad as 3-5-2 is a disadvantage: '+r.points.toFixed(2));
 // Eleven players all out of position (worst case -4) against a perfect shape (+4) is an 8-point swing, no more.
 const worst=squadStrength(Array.from({length:11},()=>({position:'ST',overall:60,fitness:100})),'4-3-3');
 assert.equal(worst,56);
});
test('an incomplete XI still falls back to strength 35',()=>{
 assert.equal(squadStrength(side(80).slice(0,10)),35);
});

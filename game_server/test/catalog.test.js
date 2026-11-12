import test from 'node:test';
import assert from 'node:assert/strict';
import {attributeOffsets,attributesFor,attributeNames,starterPlayers,academySquadTemplate,generateAcademySquad,generateYouthPlayer,youthSlots,YOUTH_MIN_OVERALL,YOUTH_MAX_OVERALL} from '../src/catalog.js';
import {marketValueUzs,qualityForOverall,overallFromAttributes,STARTING_SQUAD_SIZE} from '../src/economy.js';
import {isValidLineup,formationShapes} from '../src/lineup.js';

const sum=a=>Object.values(a).reduce((x,y)=>x+y,0);
test('approved attribute offsets sum to zero for every position',()=>{
 assert.deepEqual(attributeOffsets,{GK:[-3,-4,-4,-4,0,15],CB:[-2,-8,-3,-7,12,8],LB:[5,-9,0,0,3,1],RB:[5,-9,0,0,3,1],DM:[-3,-8,5,-4,6,4],CM:[-2,-2,5,2,-2,-1],AM:[1,2,4,5,-8,-4],LW:[6,3,-2,6,-9,-4],RW:[6,3,-2,6,-9,-4],ST:[2,8,-4,1,-10,3]});
 for(const [position,offsets] of Object.entries(attributeOffsets))assert.equal(offsets.reduce((a,b)=>a+b,0),0,position);
});
test('templates average exactly to overall at every rating, including the clamped extremes',()=>{
 for(const position of Object.keys(attributeOffsets))for(let overall=1;overall<=99;overall++){
  const a=attributesFor(overall,position);
  assert.deepEqual(Object.keys(a),attributeNames);
  assert.equal(sum(a),overall*6,position+' '+overall);
  assert.ok(Object.values(a).every(v=>Number.isInteger(v)&&v>=1&&v<=99));
  assert.equal(overallFromAttributes(a,1,99),overall,'the upgrade formula reproduces the overall');
 }
 assert.deepEqual(attributesFor(54,'ST'),{pace:56,shooting:62,passing:50,dribbling:55,defending:44,physical:57});
 assert.throws(()=>attributesFor(54,'XX'));assert.throws(()=>attributesFor(0,'ST'));
});
test('market catalogue: 360 fictional players, consistent price, tier, attributes and unique keys',()=>{
 assert.equal(starterPlayers.length,360);
 assert.equal(new Set(starterPlayers.map(p=>p.catalogKey)).size,360);
 for(const p of starterPlayers){
  assert.equal(p.origin,'market');assert.equal(p.marketValueUzs,marketValueUzs(p.overall));assert.equal(p.quality,qualityForOverall(p.overall));
  assert.equal(sum(p.attributes),p.overall*6);assert.ok(p.potential>=p.overall&&p.potential<=92);assert.ok(p.overall>=46&&p.overall<=74);
 }
});
test('academy squad: the approved 18-player distribution, identical for every club',()=>{
 assert.equal(academySquadTemplate.length,STARTING_SQUAD_SIZE);
 const count=list=>list.reduce((m,x)=>(m[x]=(m[x]||0)+1,m),{});
 assert.deepEqual(count(academySquadTemplate.map(x=>x[0])),{GK:2,CB:3,LB:1,RB:1,DM:2,CM:3,AM:1,LW:1,RW:1,ST:3});
 assert.deepEqual(academySquadTemplate.slice(0,11).map(x=>x[1]).sort((a,b)=>b-a),[58,56,56,54,54,54,54,52,52,52,52]);
 assert.deepEqual(academySquadTemplate.slice(11).map(x=>x[1]).sort((a,b)=>b-a),[50,50,50,47,47,47,47]);
 assert.deepEqual(count(academySquadTemplate.slice(0,11).map(x=>x[0])),formationShapes['4-3-3'],'the XI is a natural 4-3-3');
 for(let run=0;run<20;run++){
  const squad=generateAcademySquad();
  assert.deepEqual(squad.map(p=>[p.position,p.overall]),academySquadTemplate);
  assert.equal(new Set(squad.map(p=>p.fullName)).size,18,'no duplicate names inside a squad');
  for(const p of squad){
   assert.equal(p.origin,'academy');assert.equal(p.marketValueUzs,marketValueUzs(p.overall));assert.equal(sum(p.attributes),p.overall*6);
   assert.ok(p.age>=16&&p.age<=40);assert.ok(p.potential>=p.overall&&p.potential<=100);assert.equal(p.catalogKey,undefined);
  }
  const players=squad.map((p,i)=>({id:String(i),...p}));
  assert.ok(isValidLineup(players.slice(0,11).map(p=>p.id),players));
 }
});
test('generated youth players are always rated 45-50 and priced by the curve',()=>{
 assert.equal(youthSlots.length,12);assert.ok(youthSlots.includes('GK'));
 const seen=new Set();
 for(let i=0;i<600;i++){
  const p=generateYouthPlayer(youthSlots[i%12]);seen.add(p.overall);
  assert.ok(p.overall>=YOUTH_MIN_OVERALL&&p.overall<=YOUTH_MAX_OVERALL);assert.equal(p.origin,'generated');
  assert.equal(p.marketValueUzs,marketValueUzs(p.overall));assert.equal(sum(p.attributes),p.overall*6);assert.ok(p.age>=16&&p.age<=19);
 }
 assert.deepEqual([...seen].sort(),[45,46,47,48,49,50]);
});

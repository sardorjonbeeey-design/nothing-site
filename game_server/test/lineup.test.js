import test from 'node:test';
import assert from 'node:assert/strict';
import {repairLineup,isValidLineup,formationShapes} from '../src/lineup.js';
import {academySquadTemplate} from '../src/catalog.js';

const squad=()=>academySquadTemplate.map(([position,overall],i)=>({id:'p'+String(i).padStart(2,'0'),position,overall}));
const xi=players=>players.slice(0,11).map(p=>p.id),bench=players=>players.slice(11).map(p=>p.id);
let seed=20261112;const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};

test('a valid lineup is left untouched',()=>{
 const players=squad(),r=repairLineup({formation:'4-3-3',starters:xi(players),substitutes:bench(players),players});
 assert.equal(r.changed,false);assert.deepEqual(r.promoted,[]);assert.deepEqual(r.starters,xi(players));assert.deepEqual(r.substitutes,bench(players));
});
test('a sold starter is replaced by the best player in the same position',()=>{
 const all=squad(),sold=all[10];assert.equal(sold.position,'ST');
 const players=all.filter(p=>p!==sold),r=repairLineup({formation:'4-3-3',starters:xi(all),substitutes:bench(all),players});
 assert.equal(r.promoted.length,1);assert.equal(players.find(p=>p.id===r.promoted[0]).position,'ST');
 assert.ok(isValidLineup(r.starters,players));assert.ok(!r.starters.includes(sold.id));assert.ok(!r.substitutes.includes(r.promoted[0]));
});
test('a sold goalkeeper is replaced by the other goalkeeper',()=>{
 const all=squad(),players=all.filter(p=>p!==all[0]),r=repairLineup({formation:'4-3-3',starters:xi(all),substitutes:bench(all),players});
 assert.equal(players.find(p=>p.id===r.promoted[0]).position,'GK');assert.ok(isValidLineup(r.starters,players));
});
test('same line is used when the exact position is missing, and a spare goalkeeper is the last choice',()=>{
 const all=squad(),lb=all[3];assert.equal(lb.position,'LB');
 const players=all.filter(p=>p!==lb),r=repairLineup({formation:'4-3-3',starters:xi(all),substitutes:bench(all),players});
 assert.equal(players.find(p=>p.id===r.promoted[0]).position,'CB','the bench centre-back covers left-back');
 const onlyKeeperLeft=all.slice(0,10).concat([{id:'k2',position:'GK',overall:90},{id:'o1',position:'AM',overall:40}]);
 const r2=repairLineup({formation:'4-3-3',starters:all.slice(0,10).map(p=>p.id),substitutes:[],players:onlyKeeperLeft});
 assert.deepEqual(r2.promoted,['o1'],'an outfield player is preferred to a second goalkeeper');
});
test('an XI without a goalkeeper gets one when the club has one',()=>{
 const players=squad(),outfield=players.filter(p=>p.position!=='GK').slice(0,11).map(p=>p.id);
 const r=repairLineup({formation:'4-3-3',starters:outfield,substitutes:[],players});
 assert.ok(isValidLineup(r.starters,players));assert.equal(r.starters.filter(id=>players.find(p=>p.id===id).position==='GK').length,1);
});
test('unknown, duplicate and surplus entries are dropped',()=>{
 const players=squad(),ids=xi(players);
 const r=repairLineup({formation:'4-4-2',starters:[ids[0],ids[0],'ghost',...ids.slice(1),players[12].id,players[13].id],substitutes:['ghost',ids[1],players[14].id,players[14].id],players});
 assert.ok(isValidLineup(r.starters,players));assert.deepEqual(r.starters,ids);assert.deepEqual(r.substitutes,[players[14].id]);
});
test('property: whenever a club has 11 players the repaired XI is valid (20,000 random cases)',()=>{
 const positions=['GK','CB','LB','RB','DM','CM','AM','LW','RW','ST'],formations=Object.keys(formationShapes).concat(['unknown']);
 for(let n=0;n<20000;n++){
  const size=11+Math.floor(random()*16);
  const players=Array.from({length:size},(_,i)=>({id:'x'+i,position:random()<0.12?'GK':positions[1+Math.floor(random()*9)],overall:40+Math.floor(random()*45)}));
  const pool=players.map(p=>p.id).concat(['ghost1','ghost2']);
  const draw=k=>Array.from({length:k},()=>pool[Math.floor(random()*pool.length)]);
  const r=repairLineup({formation:formations[Math.floor(random()*formations.length)],starters:draw(Math.floor(random()*14)),substitutes:draw(Math.floor(random()*10)),players});
  assert.ok(isValidLineup(r.starters,players),'case '+n);
  assert.ok(r.substitutes.length<=7&&new Set(r.substitutes).size===r.substitutes.length);
  assert.ok(r.substitutes.every(id=>players.some(p=>p.id===id)&&!r.starters.includes(id)));
  assert.ok(r.promoted.every(id=>r.starters.includes(id)));
 }
});
test('fewer than 11 players: everyone available starts and nothing invalid is invented',()=>{
 const players=squad().slice(0,9),r=repairLineup({starters:[],substitutes:[],players});
 assert.equal(r.starters.length,9);assert.equal(new Set(r.starters).size,9);
});

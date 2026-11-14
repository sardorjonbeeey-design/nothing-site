import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateMatch} from '../src/simulation.js';

const xi=(prefix)=>['GK','CB','CB','LB','RB','DM','CM','CM','LW','RW','ST'].map((position,i)=>({
 id:prefix+i,full_name:prefix.toUpperCase()+' Player '+i,position,overall:60,attributes:{pace:60,shooting:60,passing:60,dribbling:60,defending:60,physical:60}
}));

test('every goal names a scorer from the scoring side, and an assist from the same side when given',()=>{
 for(let seed=1;seed<=200;seed++){
  let s=seed;const rng=()=>{s=(s*16807)%2147483647;return s/2147483647;};
  const home=xi('h'),away=xi('a');
  const result=simulateMatch(home,away,{random:rng});
  for(const e of result.events.filter(x=>x.type==='goal')){
   const team=e.side==='home'?home:away;
   const scorer=team.find(p=>p.id===e.scorerId);
   assert.ok(scorer,'scorer must be in the scoring XI');
   assert.equal(e.scorerName,scorer.full_name);
   if(e.assistId){
    assert.notEqual(e.assistId,e.scorerId);
    assert.ok(team.some(p=>p.id===e.assistId&&p.position!=='GK'));
   }
  }
 }
});

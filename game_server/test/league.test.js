import test from 'node:test';
import assert from 'node:assert/strict';
import {generateRoundRobin} from '../src/league.js';

test('10 clubs produce 9 rounds and 45 unique fixtures',()=>{
 const ids=Array.from({length:10},(_,i)=>'club-'+i),rounds=generateRoundRobin(ids);
 assert.equal(rounds.length,9);
 assert.ok(rounds.every(r=>r.length===5));
 const pairs=new Set();
 for(const round of rounds)for(const f of round){
  assert.notEqual(f.homeClubId,f.awayClubId);
  const pair=[f.homeClubId,f.awayClubId].sort().join('|');
  assert.ok(!pairs.has(pair));pairs.add(pair);
 }
 assert.equal(pairs.size,45);
});
test('fixture generator rejects odd, duplicate or undersized groups',()=>{
 assert.throws(()=>generateRoundRobin(['a']));
 assert.throws(()=>generateRoundRobin(['a','b','c']));
 assert.throws(()=>generateRoundRobin(['a','a']));
});

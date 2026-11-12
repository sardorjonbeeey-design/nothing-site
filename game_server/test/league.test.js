import test from 'node:test';
import assert from 'node:assert/strict';
import {generateRoundRobin,generateDoubleRoundRobin,dayForRound,leagueSchedule,LEAGUE_TIMEZONE,LEAGUE_KICKOFF_TIME,MATCH_DURATION_SECONDS} from '../src/league.js';

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

test('double round robin: 18 rounds, 90 fixtures, every opponent home and away',()=>{
 const ids=Array.from({length:10},(_,i)=>'club-'+i),rounds=generateDoubleRoundRobin(ids);
 assert.equal(rounds.length,18);
 assert.deepEqual(rounds.map(r=>r[0].roundNumber),Array.from({length:18},(_,i)=>i+1));
 const ordered=new Set();
 for(const round of rounds){
  assert.equal(round.length,5);
  assert.equal(new Set(round.flatMap(f=>[f.homeClubId,f.awayClubId])).size,10,'each club plays exactly once per round');
  for(const f of round){const key=f.homeClubId+'>'+f.awayClubId;assert.ok(!ordered.has(key));ordered.add(key);}
 }
 assert.equal(ordered.size,90);
 for(const a of ids)for(const b of ids)if(a!==b)assert.ok(ordered.has(a+'>'+b));
 for(const id of ids)assert.equal(rounds.flat().filter(f=>f.homeClubId===id).length,9);
 for(let i=0;i<9;i++)assert.deepEqual(rounds[i+9].map(f=>f.awayClubId+'>'+f.homeClubId),rounds[i].map(f=>f.homeClubId+'>'+f.awayClubId),'second half mirrors the first');
});
test('matchdays 1-9 and 11-19 with a rest day on day 10',()=>{
 assert.deepEqual(Array.from({length:18},(_,i)=>dayForRound(i+1,9)),[1,2,3,4,5,6,7,8,9,11,12,13,14,15,16,17,18,19]);
 assert.throws(()=>dayForRound(0,9));assert.throws(()=>dayForRound(19,9));assert.throws(()=>dayForRound(1.5,9));
 const schedule=leagueSchedule(Array.from({length:10},(_,i)=>'club-'+i));
 assert.equal(schedule.length,90);
 const days=[...new Set(schedule.map(f=>f.dayNumber))];
 assert.equal(days.length,18);assert.ok(!days.includes(10));assert.equal(Math.max(...days),19);
 for(const day of days){
  const today=schedule.filter(f=>f.dayNumber===day);
  assert.equal(today.length,5);assert.equal(new Set(today.flatMap(f=>[f.homeClubId,f.awayClubId])).size,10,'one league match per club per day');
 }
});
test('league timing constants: 20:00 Asia/Tashkent, 60-second matches',()=>{
 assert.equal(LEAGUE_TIMEZONE,'Asia/Tashkent');assert.equal(LEAGUE_KICKOFF_TIME,'20:00');assert.equal(MATCH_DURATION_SECONDS,60);
});

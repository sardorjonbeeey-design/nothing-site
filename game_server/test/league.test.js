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

test('odd groups play with a bye: 5 clubs give 20 fixtures over 11 days',async()=>{
 const {seasonDays}=await import('../src/league.js');
 const ids=Array.from({length:5},(_,i)=>'c'+i),schedule=leagueSchedule(ids);
 assert.equal(schedule.length,20);
 assert.equal(seasonDays(5),11);assert.equal(seasonDays(10),19);assert.equal(seasonDays(18),35);
 const days=[...new Set(schedule.map(f=>f.dayNumber))];
 assert.equal(Math.max(...days),11);
 for(const day of days){const today=schedule.filter(f=>f.dayNumber===day);assert.equal(new Set(today.flatMap(f=>[f.homeClubId,f.awayClubId])).size,today.length*2,'no club plays twice a day');}
});
test('18 clubs: 306 fixtures over 35 matchdays',()=>{
 const schedule=leagueSchedule(Array.from({length:18},(_,i)=>'c'+i));
 assert.equal(schedule.length,306);
 assert.equal(Math.max(...schedule.map(f=>f.dayNumber)),35);
});
test('placement: main league takes up to 18, the rest form a second league of 5 or more, otherwise they wait',async()=>{
 const {placeClubs}=await import('../src/league.js');
 const w=n=>Array.from({length:n},(_,i)=>'w'+i);
 assert.equal(placeClubs({waiting:w(12)}).main.length,12);
 assert.equal(placeClubs({waiting:w(12)}).second.length,0);
 const p20=placeClubs({waiting:w(20)});
 assert.equal(p20.main.length,18);assert.equal(p20.second.length,0);assert.equal(p20.waiting.length,2);
 const p25=placeClubs({waiting:w(25)});
 assert.equal(p25.main.length,18);assert.equal(p25.second.length,7);assert.equal(p25.waiting.length,0);
 const p40=placeClubs({waiting:w(40)});
 assert.equal(p40.second.length,18);assert.equal(p40.waiting.length,4);
 const carried=placeClubs({main:w(18).slice(0,15),second:['s1','s2','s3','s4','s5'],waiting:['x1','x2','x3','x4']});
 assert.equal(carried.main.length,18);assert.equal(carried.second.length,6);
});

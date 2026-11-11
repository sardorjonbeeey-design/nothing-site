// Server-authoritative match settlement. Nothing in this module is reachable from an HTTP route:
// fixtures are settled only by the scheduler, MATCH_DURATION_SECONDS after their kick-off, using the database clock.
import {requireDb,inTransaction,assertIsolatedDatabase} from './db.js';
import {simulateMatch} from './simulation.js';
import {MATCH_DURATION_SECONDS} from './league.js';

export async function awardDevelopmentPoints(client,clubId,amount,reason,referenceId=null){
 const r=await client.query('UPDATE clubs SET development_points=development_points+$2 WHERE id=$1 RETURNING development_points',[clubId,amount]);
 await client.query('INSERT INTO development_ledger(club_id,amount_dp,balance_after_dp,reason,reference_id) VALUES($1,$2,$3,$4,$5)',[clubId,amount,r.rows[0].development_points,reason,referenceId]);
}
export async function progressMission(client,clubId,metric,amount){
 const rows=await client.query('SELECT cm.mission_id,cm.progress,cm.completed_at,cm.claimed_at,m.target,m.reward_dp FROM club_missions cm JOIN missions m ON m.id=cm.mission_id WHERE cm.club_id=$1 AND m.metric=$2 FOR UPDATE',[clubId,metric]);
 for(const row of rows.rows){
  if(row.completed_at)continue;
  const next=Math.min(Number(row.target),Number(row.progress)+amount);
  const done=next>=Number(row.target);
  await client.query('UPDATE club_missions SET progress=$3,completed_at=CASE WHEN $4 THEN NOW() ELSE NULL END,claimed_at=CASE WHEN $4 THEN NOW() ELSE NULL END WHERE club_id=$1 AND mission_id=$2',[clubId,row.mission_id,next,done]);
  if(done)await awardDevelopmentPoints(client,clubId,Number(row.reward_dp),'mission_reward',null);
 }
}
const lineupSql='SELECT p.*,l.formation FROM lineups l CROSS JOIN LATERAL unnest(l.starters) WITH ORDINALITY s(id,ord) JOIN players p ON p.id=s.id WHERE l.club_id=$1 ORDER BY s.ord';
// The caller holds a row lock on the fixture and has verified that it is scheduled and due.
async function settleFixture(client,f){
 await client.query('SELECT id FROM clubs WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',[[f.home_club_id,f.away_club_id]]);
 const hl=await client.query(lineupSql,[f.home_club_id]),al=await client.query(lineupSql,[f.away_club_id]);
 const result=simulateMatch(hl.rows,al.rows,{homeFormation:hl.rows[0]?.formation||'4-3-3',awayFormation:al.rows[0]?.formation||'4-3-3'});
 const played=await client.query("UPDATE fixtures SET status='played',home_goals=$2,away_goals=$3,events=$4::jsonb,played_at=NOW() WHERE id=$1 AND status='scheduled'",[f.id,result.homeGoals,result.awayGoals,JSON.stringify(result.events)]);
 if(!played.rowCount)return;
 // Friendlies never touch standings, league progression, Development Points or missions.
 if(f.kind!=='league')return;
 for(const [clubId,gf,ga] of [[f.home_club_id,result.homeGoals,result.awayGoals],[f.away_club_id,result.awayGoals,result.homeGoals]]){
  const win=gf>ga,draw=gf===ga,loss=gf<ga;
  await client.query('UPDATE league_members SET played=played+1,wins=wins+$3,draws=draws+$4,losses=losses+$5,goals_for=goals_for+$6,goals_against=goals_against+$7,points=points+$8 WHERE league_id=$1 AND club_id=$2',
   [f.league_id,clubId,win?1:0,draw?1:0,loss?1:0,gf,ga,win?3:draw?1:0]);
  await awardDevelopmentPoints(client,clubId,2,'match_reward',f.id);
  await progressMission(client,clubId,'matches_played',1);
  await progressMission(client,clubId,'wins',win?1:0);
  await progressMission(client,clubId,'goals_scored',gf);
  await progressMission(client,clubId,'clean_sheets',ga===0?1:0);
 }
 await client.query("UPDATE leagues SET status='completed',completed_at=NOW() WHERE id=$1 AND status='active' AND NOT EXISTS(SELECT 1 FROM fixtures WHERE league_id=$1 AND status='scheduled')",[f.league_id]);
}
// Settles every fixture whose match has finished, oldest first, one transaction per fixture.
// SKIP LOCKED plus the status check make this safe to run from several server instances at once.
export async function settleDueFixtures(){
 let settled=0;
 for(;;){
  const done=await inTransaction(async client=>{
   const f=(await client.query("SELECT * FROM fixtures WHERE status='scheduled' AND kickoff_at<=NOW()-make_interval(secs=>$1) ORDER BY kickoff_at,id LIMIT 1 FOR UPDATE SKIP LOCKED",[MATCH_DURATION_SECONDS])).rows[0];
   if(!f)return false;
   await settleFixture(client,f);return true;
  });
  if(!done)break;
  settled++;
 }
 await requireDb().query("UPDATE friendly_requests SET status='expired',responded_at=NOW() WHERE status='pending' AND proposed_kickoff_at<=NOW()");
 return settled;
}
// Runs inside the server process, independent of any request or user session. It sleeps until the next
// fixture is due (re-checking at least every maxIdleMs) and settles everything overdue at start-up.
export function startScheduler({maxIdleMs=15000,log=console}={}){
 let timer=null,stopped=false,checked=false;
 async function tick(){
  if(stopped)return;
  let delay=maxIdleMs;
  try{
   if(!checked){await assertIsolatedDatabase(requireDb());checked=true;}
   const settled=await settleDueFixtures();
   if(settled)log.log('Scheduler settled '+settled+' fixture(s)');
   const next=await requireDb().query("SELECT EXTRACT(EPOCH FROM (MIN(kickoff_at)+make_interval(secs=>$1)-NOW()))*1000 AS ms FROM fixtures WHERE status='scheduled' AND kickoff_at IS NOT NULL",[MATCH_DURATION_SECONDS]);
   if(next.rows[0].ms!==null)delay=Math.max(200,Math.min(maxIdleMs,Number(next.rows[0].ms)+25));
  }catch(error){log.error('Scheduler error',error);delay=5000;}
  if(!stopped){timer=setTimeout(tick,delay);timer.unref?.();}
 }
 tick();
 return {stop(){stopped=true;clearTimeout(timer);}};
}

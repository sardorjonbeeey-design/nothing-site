// League seasons: creation of the schedule, automatic rollover and the waiting-list stipend.
// Everything here runs inside a caller-supplied transaction and is safe to call repeatedly.
import {leagueSchedule,LEAGUE_TIMEZONE,LEAGUE_KICKOFF_TIME,MATCH_DURATION_SECONDS} from './league.js';
import {WAITING_STIPEND_UZS,STARTING_SQUAD_SIZE,MINIMUM_GOALKEEPERS} from './economy.js';\nimport {chargeSquadWages} from './competition.js';
export const LEAGUE_LOCK=8111001;
export const LEAGUE_SIZE=10;
export const REST_DAYS_BETWEEN_SEASONS=2;
const SEASON_DAYS=19;
// Inserts one season: league row, members with empty records and the 90 fixtures with their 20:00 Tashkent kick-offs.
// Returns null when that season number already exists (unique index), so concurrent callers create it only once.
async function createSeason(client,seasonNumber,clubIds,startsOnSql,params){
 const league=(await client.query("INSERT INTO leagues(name,season_number,status,starts_on) VALUES('ZAMIN FK League',$1,'active',"+startsOnSql+") ON CONFLICT (season_number) WHERE starts_on IS NOT NULL DO NOTHING RETURNING id,starts_on::text AS starts_on",[seasonNumber,...params])).rows[0];
 if(!league)return null;
 for(const id of clubIds)await client.query('INSERT INTO league_members(league_id,club_id) VALUES($1,$2)',[league.id,id]);
 for(const fixture of leagueSchedule(clubIds)){
  await client.query("INSERT INTO fixtures(league_id,kind,round_number,day_number,home_club_id,away_club_id,kickoff_at) VALUES($1,'league',$2,$3::int,$4,$5,(($6::date+($3::int-1))+$7::time) AT TIME ZONE $8)",
   [league.id,fixture.roundNumber,fixture.dayNumber,fixture.homeClubId,fixture.awayClubId,league.starts_on,LEAGUE_KICKOFF_TIME,LEAGUE_TIMEZONE]);
 }
 // A friendly accepted earlier gives way to a league match in the same one-minute slot.
 await client.query("WITH c AS (UPDATE fixtures fr SET status='cancelled' WHERE fr.kind='friendly' AND fr.status='scheduled' AND EXISTS(SELECT 1 FROM fixtures l WHERE l.league_id=$1 AND (l.home_club_id IN (fr.home_club_id,fr.away_club_id) OR l.away_club_id IN (fr.home_club_id,fr.away_club_id)) AND l.kickoff_at>fr.kickoff_at-make_interval(secs=>$2) AND l.kickoff_at<fr.kickoff_at+make_interval(secs=>$2)) RETURNING fr.id) UPDATE friendly_requests SET status='cancelled',responded_at=NOW() WHERE fixture_id IN (SELECT id FROM c)",[league.id,MATCH_DURATION_SECONDS]);
 return league.id;
}
// Season 1: created once 10 clubs exist, from the 10 oldest clubs. Day 1 is the next calendar day in Asia/Tashkent.
export async function ensureLeague(client){
 await client.query('SELECT pg_advisory_xact_lock($1)',[LEAGUE_LOCK]);
 const existing=await client.query('SELECT id FROM leagues WHERE starts_on IS NOT NULL ORDER BY season_number DESC LIMIT 1');
 if(existing.rowCount)return existing.rows[0].id;
 const clubs=await client.query(`SELECT c.id FROM clubs c JOIN players p ON p.club_id=c.id JOIN lineups l ON l.club_id=c.id GROUP BY c.id,c.created_at,l.starters,l.substitutes HAVING COUNT(p.id)>=$2 AND COUNT(*) FILTER (WHERE p.position='GK')>=$3 AND cardinality(l.starters)=11 AND cardinality(l.substitutes)=7 AND cardinality(ARRAY(SELECT DISTINCT x FROM unnest(l.starters||l.substitutes) AS x))=$2 ORDER BY c.created_at ASC,c.id ASC LIMIT $1`,[LEAGUE_SIZE,STARTING_SQUAD_SIZE,MINIMUM_GOALKEEPERS]);
 if(clubs.rowCount<LEAGUE_SIZE)return null;
 return createSeason(client,1,clubs.rows.map(r=>r.id),'(NOW() AT TIME ZONE $2)::date+1',[LEAGUE_TIMEZONE]);
}
// Rollover: every completed season without a successor gets one. The same clubs keep their places, standings start
// from zero, and nothing else about a club is touched. Day 1 follows the previous season's day 19 after the rest days;
// if the server was down for longer than that, the new season starts on the next Tashkent day instead of in the past.
export async function ensureNextSeasons(client){
 await client.query('SELECT pg_advisory_xact_lock($1)',[LEAGUE_LOCK]);
 const done=await client.query("SELECT l.id,l.season_number,l.starts_on::text AS starts_on FROM leagues l WHERE l.status='completed' AND l.starts_on IS NOT NULL AND NOT EXISTS(SELECT 1 FROM leagues n WHERE n.starts_on IS NOT NULL AND n.season_number=l.season_number+1) ORDER BY l.season_number");
 let created=0;
 for(const league of done.rows){
  const members=await client.query('SELECT lm.club_id FROM league_members lm JOIN clubs c ON c.id=lm.club_id WHERE lm.league_id=$1 ORDER BY c.created_at,c.id',[league.id]);
  if(members.rowCount!==LEAGUE_SIZE)continue;
  const id=await createSeason(client,league.season_number+1,members.rows.map(r=>r.club_id),'GREATEST($2::date+$3::int,(NOW() AT TIME ZONE $4)::date+1)',[league.starts_on,SEASON_DAYS+REST_DAYS_BETWEEN_SEASONS,LEAGUE_TIMEZONE]);
  if(id)created++;
 }
 return created;
}
// Waiting-list stipend: when every fixture of a league matchday has been played, each club that is not a member of
// that league receives one payment. The stipend_runs row is the once-only marker for the matchday; stipend_payments
// has a primary key per club and matchday as a second guard. Clubs created later never receive earlier matchdays.
export async function payWaitingStipends(client){
 const due=await client.query("SELECT f.league_id,f.day_number FROM fixtures f WHERE f.kind='league' AND f.day_number IS NOT NULL GROUP BY f.league_id,f.day_number HAVING bool_and(f.status='played') AND NOT EXISTS(SELECT 1 FROM stipend_runs s WHERE s.league_id=f.league_id AND s.day_number=f.day_number) ORDER BY MIN(f.kickoff_at)");
 let paid=0;
 for(const day of due.rows){
  const marker=await client.query('INSERT INTO stipend_runs(league_id,day_number) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING league_id',[day.league_id,day.day_number]);
  if(!marker.rowCount)continue;
  const waiting=await client.query('SELECT c.id FROM clubs c WHERE NOT EXISTS(SELECT 1 FROM league_members lm WHERE lm.league_id=$1 AND lm.club_id=c.id) ORDER BY c.id FOR UPDATE OF c',[day.league_id]);
  for(const club of waiting.rows){
   const payment=await client.query('INSERT INTO stipend_payments(league_id,day_number,club_id,amount_uzs) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING club_id',[day.league_id,day.day_number,club.id,WAITING_STIPEND_UZS.toString()]);
   if(!payment.rowCount)continue;
   const balance=(await client.query('UPDATE clubs SET budget_uzs=budget_uzs+$2 WHERE id=$1 RETURNING budget_uzs',[club.id,WAITING_STIPEND_UZS.toString()])).rows[0].budget_uzs;
   await client.query("INSERT INTO money_ledger(club_id,amount_uzs,balance_after_uzs,reason,reference_id) VALUES($1,$2,$3,'waiting_stipend',$4)",[club.id,WAITING_STIPEND_UZS.toString(),balance,day.league_id]);\n   await chargeSquadWages(client,club.id,day.league_id);
   paid++;
  }
 }
 return paid;
}

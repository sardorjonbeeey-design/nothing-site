import {leagueSchedule,seasonDays,placeClubs,LEAGUE_TIMEZONE,LEAGUE_KICKOFF_TIME,MATCH_DURATION_SECONDS,MAIN_LEAGUE_MIN,SECOND_LEAGUE_MIN,PROMOTION_PLACES,RELEGATION_PLACES} from './league.js';
import {WAITING_STIPEND_UZS,STARTING_SQUAD_SIZE} from './economy.js';
import {leagueStandings} from './competition.js';
// League seasons: divisions, promotion and relegation, the schedule, automatic rollover and the waiting-list stipend.
export const LEAGUE_LOCK=8111001;
export const MAIN_DIVISION=1, SECOND_DIVISION=2;
export const REST_DAYS_BETWEEN_SEASONS=2;

// Inserts one division of one season: league row, members with empty records and every fixture with its 20:00 kick-off.
// startsOnSql receives the league timezone as $3 and any extra params after it. Returns null when that division of
// that season already exists (unique index), so concurrent callers create it only once.
async function createSeason(client,seasonNumber,division,clubIds,startsOnSql,params){
 const league=(await client.query("INSERT INTO leagues(name,season_number,division,status,starts_on) VALUES(CASE WHEN $2::int=1 THEN 'ZAMIN FK League' ELSE 'ZAMIN FK Second League' END,$1,$2,'active',"+startsOnSql+") ON CONFLICT (division,season_number) WHERE starts_on IS NOT NULL DO NOTHING RETURNING id,starts_on::text AS starts_on",[seasonNumber,division,...params])).rows[0];
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

// Eligible clubs (full XI and at least 14 players) that are not yet in the given season, oldest first.
async function waitingClubs(client,seasonNumber){
 return (await client.query(`SELECT c.id FROM clubs c JOIN players p ON p.club_id=c.id JOIN lineups l ON l.club_id=c.id
  WHERE NOT EXISTS(SELECT 1 FROM league_members lm JOIN leagues lg ON lg.id=lm.league_id WHERE lg.starts_on IS NOT NULL AND lg.season_number=$1 AND lm.club_id=c.id)
  GROUP BY c.id,c.created_at,l.starters,l.substitutes HAVING COUNT(p.id)>=$2 ORDER BY c.created_at ASC,c.id ASC`,[seasonNumber,STARTING_SQUAD_SIZE])).rows.map(r=>r.id);
}

// Season 1: created once 10 eligible clubs exist. The oldest 18 form the main league and the rest form the second league
// when five or more are left. Day 1 is the next calendar day in Asia/Tashkent. Returns the main league id.
export async function ensureLeague(client){
 await client.query('SELECT pg_advisory_xact_lock($1)',[LEAGUE_LOCK]);
 const existing=await client.query('SELECT id FROM leagues WHERE starts_on IS NOT NULL ORDER BY season_number DESC, division ASC LIMIT 1');
 if(existing.rowCount)return existing.rows[0].id;
 const placed=placeClubs({waiting:await waitingClubs(client,1)});
 if(placed.main.length<MAIN_LEAGUE_MIN)return null;
 const startsOn=['(NOW() AT TIME ZONE $3)::date+1',[LEAGUE_TIMEZONE]];
 const mainId=await createSeason(client,1,MAIN_DIVISION,placed.main,startsOn[0],startsOn[1]);
 if(placed.second.length>=SECOND_LEAGUE_MIN)await createSeason(client,1,SECOND_DIVISION,placed.second,startsOn[0],startsOn[1]);
 return mainId;
}

// Rollover, once every league of a season is completed and the next season does not exist yet.
// Promotion and relegation run only when a second league exists: the top 3 of the second league rise, the bottom 3
// of the main league drop. Clubs waiting since the last season then fill the main league up to 18 and the second league.
// Standings start from zero, and the next season starts after the previous season's last matchday plus rest days.
export async function ensureNextSeasons(client){
 await client.query('SELECT pg_advisory_xact_lock($1)',[LEAGUE_LOCK]);
 const done=await client.query(`SELECT l.season_number,MIN(l.starts_on)::text AS starts_on,MAX(f.day_number) AS last_day
  FROM leagues l JOIN fixtures f ON f.league_id=l.id
  WHERE l.starts_on IS NOT NULL AND NOT EXISTS(SELECT 1 FROM leagues x WHERE x.starts_on IS NOT NULL AND x.season_number=l.season_number AND x.status<>'completed')
   AND NOT EXISTS(SELECT 1 FROM leagues n WHERE n.starts_on IS NOT NULL AND n.season_number=l.season_number+1)
  GROUP BY l.season_number ORDER BY l.season_number`);
 let created=0;
 for(const season of done.rows){
  const leagues=(await client.query("SELECT id,division FROM leagues WHERE starts_on IS NOT NULL AND season_number=$1",[season.season_number])).rows;
  const main=leagues.find(l=>l.division===MAIN_DIVISION),second=leagues.find(l=>l.division===SECOND_DIVISION);
  if(!main)continue;
  const mainOrder=(await leagueStandings(client,main.id)).map(r=>r.club_id);
  let mainCarry=mainOrder,secondCarry=[];
  if(second){
   const secondOrder=(await leagueStandings(client,second.id)).map(r=>r.club_id);
   if(secondOrder.length>=SECOND_LEAGUE_MIN){
    const promoted=secondOrder.slice(0,PROMOTION_PLACES),relegated=mainOrder.slice(mainOrder.length-RELEGATION_PLACES);
    mainCarry=[...mainOrder.slice(0,mainOrder.length-RELEGATION_PLACES),...promoted];
    secondCarry=[...secondOrder.slice(PROMOTION_PLACES),...relegated];
   }
  }
  const placed=placeClubs({main:mainCarry,second:secondCarry,waiting:await waitingClubs(client,season.season_number)});
  const startsOn='GREATEST($3::date+$4::int,(NOW() AT TIME ZONE $5)::date+1)',params=[season.starts_on,Number(season.last_day)+REST_DAYS_BETWEEN_SEASONS,LEAGUE_TIMEZONE];
  const nextNumber=season.season_number+1;
  if(await createSeason(client,nextNumber,MAIN_DIVISION,placed.main,startsOn,params))created++;
  if(placed.second.length>=SECOND_LEAGUE_MIN&&await createSeason(client,nextNumber,SECOND_DIVISION,placed.second,startsOn,params))created++;
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
  const waiting=await client.query('SELECT c.id FROM clubs c WHERE NOT EXISTS(SELECT 1 FROM league_members lm JOIN leagues l ON l.id=lm.league_id WHERE l.starts_on IS NOT NULL AND l.season_number=(SELECT season_number FROM leagues WHERE id=$1) AND lm.club_id=c.id) ORDER BY c.id FOR UPDATE OF c',[day.league_id]);
  for(const club of waiting.rows){
   const payment=await client.query('INSERT INTO stipend_payments(league_id,day_number,club_id,amount_uzs) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING club_id',[day.league_id,day.day_number,club.id,WAITING_STIPEND_UZS.toString()]);
   if(!payment.rowCount)continue;
   const balance=(await client.query('UPDATE clubs SET budget_uzs=budget_uzs+$2 WHERE id=$1 RETURNING budget_uzs',[club.id,WAITING_STIPEND_UZS.toString()])).rows[0].budget_uzs;
   await client.query("INSERT INTO money_ledger(club_id,amount_uzs,balance_after_uzs,reason,reference_id) VALUES($1,$2,$3,'waiting_stipend',$4)",[club.id,WAITING_STIPEND_UZS.toString(),balance,day.league_id]);
   paid++;
  }
 }
 return paid;
}

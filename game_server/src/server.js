import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {config} from './config.js';
import {requireDb,inTransaction,assertIsolatedDatabase,assertGameSchema,pool} from './db.js';
import {authenticate,telegramLogin} from './auth.js';
import {json,readJson,HttpError,safeString,colour,uuid} from './http.js';
import {saveCrest,readCrest} from './uploads.js';
import {leagueSchedule,LEAGUE_TIMEZONE,LEAGUE_KICKOFF_TIME,MATCH_DURATION_SECONDS} from './league.js';
import {awardDevelopmentPoints,startScheduler} from './matches.js';
import {saleValueUzs,upgradeCost,qualityForOverall,marketValueUzs} from './economy.js';

const db=()=>requireDb();
const clientRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../game_client');
const staticFiles={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/styles.css':'styles.css','/config.js':'config.js'};
const staticTypes={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
const pathModule=path;
const formationPattern=/^(4-3-3|4-4-2|4-2-3-1|3-5-2|4-1-4-1)$/;
const rateBuckets=new Map();
function clientIp(req){const forwarded=req.headers['x-forwarded-for'];return (typeof forwarded==='string'?forwarded.split(',')[0].trim():'')||req.socket.remoteAddress||'unknown';}
function rateLimit(key,limit=60,windowMs=60000){
 const now=Date.now(),entry=rateBuckets.get(key);
 if(!entry||now-entry.start>windowMs){if(rateBuckets.size>5000){for(const [oldKey,value] of rateBuckets)if(now-value.start>windowMs*2)rateBuckets.delete(oldKey);if(rateBuckets.size>10000)rateBuckets.delete(rateBuckets.keys().next().value);}rateBuckets.set(key,{start:now,count:1});return true;}
 entry.count++;return entry.count<=limit;
}
function cors(req,res){
 const origin=req.headers.origin;
 if(origin&&config.webOrigin&&origin===config.webOrigin){res.setHeader('access-control-allow-origin',origin);res.setHeader('vary','Origin');res.setHeader('access-control-allow-headers','authorization,content-type,x-dev-user-id');res.setHeader('access-control-allow-methods','GET,POST,OPTIONS');}
 res.setHeader('content-security-policy',"frame-ancestors https://web.telegram.org https://*.telegram.org https://t.me");res.setHeader('referrer-policy','no-referrer');res.setHeader('permissions-policy','camera=(),microphone=(),geolocation=()');
}
async function ownedClub(clientOrDb,clubId,userId,lock=false){
 const result=await clientOrDb.query('SELECT * FROM clubs WHERE id=$1 AND owner_user_id=$2'+(lock?' FOR UPDATE':''),[clubId,userId]);
 if(!result.rowCount)throw new HttpError(404,'Club not found');
 return result.rows[0];
}
async function makeClub(userId,input){
 const name=safeString(input.name,28,'Club name');
 const shortName=safeString(input.shortName,5,'Short name').toUpperCase();
 if(!/^[A-Z0-9]{2,5}$/.test(shortName))throw new HttpError(400,'Short name must contain 2–5 letters or numbers');
 const primary=colour(input.primaryColour||'#167A55','Primary colour');
 const secondary=colour(input.secondaryColour||'#F0C75E','Secondary colour');
 const crest=input.crestUrl||null;
 if(crest&&!/^\/uploads\/[0-9a-f-]{36}\.(png|jpg|webp)$/.test(crest))throw new HttpError(400,'Crest must be uploaded through the game server');
 return inTransaction(async client=>{
  const c=await client.query('INSERT INTO clubs(owner_user_id,name,short_name,primary_colour,secondary_colour,crest_url,budget_uzs) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[userId,name,shortName,primary,secondary,crest,config.startingBudgetUzs.toString()]);
  const club=c.rows[0];
  const pool=await client.query('SELECT * FROM players WHERE club_id IS NULL ORDER BY overall DESC,full_name ASC LIMIT 200 FOR UPDATE SKIP LOCKED');
  const counts={GK:1,CB:2,LB:1,RB:1,DM:1,CM:2,LW:1,RW:1,ST:1};
  const selected=[];
  for(const [pos,count] of Object.entries(counts)){
   for(let i=0;i<count;i++){const idx=pool.rows.findIndex(p=>p.position===pos);if(idx>=0)selected.push(pool.rows.splice(idx,1)[0]);}
  }
  if(config.startingSquadSize>11){const backupKeeper=pool.rows.findIndex(p=>p.position==='GK');if(backupKeeper>=0)selected.push(pool.rows.splice(backupKeeper,1)[0]);}
  for(const p of pool.rows){if(selected.length>=config.startingSquadSize)break;selected.push(p);}
  if(selected.length<11)throw new HttpError(503,'Not enough free-agent players are available to create a squad');
  const ids=selected.slice(0,config.startingSquadSize).map(p=>p.id);
  await client.query('UPDATE players SET club_id=$1 WHERE id=ANY($2::uuid[])',[club.id,ids]);
  const actualStarters=selected.slice(0,11).map(p=>p.id);
  const substitutes=selected.slice(11).map(p=>p.id);
  await client.query('INSERT INTO lineups(club_id,formation,starters,substitutes) VALUES($1,$2,$3,$4)',[club.id,'4-3-3',actualStarters,substitutes]);
  await client.query('INSERT INTO money_ledger(club_id,amount_uzs,balance_after_uzs,reason) VALUES($1,$2,$2,$3)',[club.id,config.startingBudgetUzs.toString(),'club_created']);
  await client.query('INSERT INTO club_missions(club_id,mission_id) SELECT $1,id FROM missions WHERE active=true ON CONFLICT DO NOTHING',[club.id]);
  await ensureLeague(client);
  return {club,players:selected};
 });
}
const LEAGUE_LOCK=8111001;
// Creates the single league season once 10 clubs exist. Day 1 is the next calendar day in Asia/Tashkent;
// every fixture gets its fixed 20:00 Tashkent kick-off here and is later settled only by the scheduler.
async function ensureLeague(client){
 await client.query('SELECT pg_advisory_xact_lock($1)',[LEAGUE_LOCK]);
 const existing=await client.query('SELECT id FROM leagues WHERE starts_on IS NOT NULL ORDER BY created_at DESC LIMIT 1');
 if(existing.rowCount)return existing.rows[0].id;
 const clubs=await client.query('SELECT id FROM clubs ORDER BY created_at ASC,id ASC LIMIT 10');
 const total=await client.query('SELECT COUNT(*)::int AS count FROM clubs');
 if(Number(total.rows[0].count)<10)return null;
 const league=(await client.query("INSERT INTO leagues(name,season_number,status,starts_on) VALUES('ZAMIN FK League',1,'active',(NOW() AT TIME ZONE $1)::date+1) RETURNING id,starts_on::text AS starts_on",[LEAGUE_TIMEZONE])).rows[0];
 const ids=clubs.rows.map(r=>r.id);
 for(const id of ids)await client.query('INSERT INTO league_members(league_id,club_id) VALUES($1,$2)',[league.id,id]);
 for(const fixture of leagueSchedule(ids)){
  await client.query("INSERT INTO fixtures(league_id,kind,round_number,day_number,home_club_id,away_club_id,kickoff_at) VALUES($1,'league',$2,$3::int,$4,$5,(($6::date+($3::int-1))+$7::time) AT TIME ZONE $8)",
   [league.id,fixture.roundNumber,fixture.dayNumber,fixture.homeClubId,fixture.awayClubId,league.starts_on,LEAGUE_KICKOFF_TIME,LEAGUE_TIMEZONE]);
 }
 // A friendly accepted before the league existed gives way to a league match in the same slot.
 await client.query("WITH c AS (UPDATE fixtures fr SET status='cancelled' WHERE fr.kind='friendly' AND fr.status='scheduled' AND EXISTS(SELECT 1 FROM fixtures l WHERE l.league_id=$1 AND (l.home_club_id IN (fr.home_club_id,fr.away_club_id) OR l.away_club_id IN (fr.home_club_id,fr.away_club_id)) AND l.kickoff_at>fr.kickoff_at-make_interval(secs=>$2) AND l.kickoff_at<fr.kickoff_at+make_interval(secs=>$2)) RETURNING fr.id) UPDATE friendly_requests SET status='cancelled',responded_at=NOW() WHERE fixture_id IN (SELECT id FROM c)",[league.id,MATCH_DURATION_SECONDS]);
 return league.id;
}
const fixtureColumns="f.id,f.kind,f.league_id,f.round_number,f.day_number,f.kickoff_at,f.status,f.home_club_id,f.away_club_id,f.home_goals,f.away_goals,f.played_at,CASE WHEN f.status='scheduled' AND f.kickoff_at<=NOW() THEN 'live' WHEN f.status='scheduled' THEN 'upcoming' ELSE f.status END AS phase,h.name AS home_name,h.short_name AS home_short_name,h.crest_url AS home_crest_url,h.primary_colour AS home_colour,a.name AS away_name,a.short_name AS away_short_name,a.crest_url AS away_crest_url,a.primary_colour AS away_colour";
const fixtureJoins=' FROM fixtures f JOIN clubs h ON h.id=f.home_club_id JOIN clubs a ON a.id=f.away_club_id';
// Completed matches of one club, newest first, with the result from that club's side and its server-side viewed flag.
function resultsSql(withEvents,filter){
 return "SELECT x.*,CASE WHEN x.home_goals=x.away_goals THEN 'draw' WHEN (x.home_club_id=$1::uuid)=(x.home_goals>x.away_goals) THEN 'win' ELSE 'loss' END AS outcome,(v.fixture_id IS NOT NULL) AS viewed FROM (SELECT "+fixtureColumns+(withEvents?',f.events':'')+fixtureJoins+" WHERE f.status='played' AND (f.home_club_id=$1::uuid OR f.away_club_id=$1::uuid)"+filter+') x LEFT JOIN fixture_result_views v ON v.fixture_id=x.id AND v.club_id=$1::uuid ORDER BY x.kickoff_at DESC NULLS LAST,x.played_at DESC,x.id';
}
async function unviewedCount(clientOrDb,clubId){
 const r=await clientOrDb.query("SELECT COUNT(*)::int AS count FROM fixtures f WHERE f.status='played' AND (f.home_club_id=$1 OR f.away_club_id=$1) AND NOT EXISTS(SELECT 1 FROM fixture_result_views v WHERE v.fixture_id=f.id AND v.club_id=$1)",[clubId]);
 return Number(r.rows[0].count);
}
// A match occupies [kick-off, kick-off + 60 s). Two matches of the same club conflict when those intervals overlap.
async function clubsBusy(client,clubIds,kickoff){
 const r=await client.query("SELECT 1 FROM fixtures WHERE status='scheduled' AND (home_club_id=ANY($1::uuid[]) OR away_club_id=ANY($1::uuid[])) AND kickoff_at>$2::timestamptz-make_interval(secs=>$3) AND kickoff_at<$2::timestamptz+make_interval(secs=>$3) LIMIT 1",[clubIds,kickoff,MATCH_DURATION_SECONDS]);
 return r.rowCount>0;
}
const friendlySelect="SELECT r.id,r.status,r.proposed_kickoff_at,r.fixture_id,r.created_at,r.responded_at,r.from_club_id,r.to_club_id,CASE WHEN r.to_club_id=$1 THEN 'incoming' ELSE 'outgoing' END AS direction,fc.name AS from_name,fc.short_name AS from_short_name,fc.crest_url AS from_crest_url,fc.primary_colour AS from_colour,tc.name AS to_name,tc.short_name AS to_short_name,tc.crest_url AS to_crest_url,tc.primary_colour AS to_colour FROM friendly_requests r JOIN clubs fc ON fc.id=r.from_club_id JOIN clubs tc ON tc.id=r.to_club_id";
async function clubSquad(clubId){
 const r=await db().query('SELECT p.*,l.formation,l.starters,l.substitutes FROM players p LEFT JOIN lineups l ON l.club_id=p.club_id WHERE p.club_id=$1 ORDER BY p.position,p.overall DESC',[clubId]);
 return r.rows;
}
async function handle(req,res){
 cors(req,res);
 if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
 const url=new URL(req.url,'http://localhost'),path=url.pathname;
 if(req.method==='GET'&&staticFiles[path]){const file=staticFiles[path],bytes=await fs.readFile(pathModule.join(clientRoot,file));res.writeHead(200,{'content-type':staticTypes[pathModule.extname(file)],'cache-control':file==='index.html'?'no-cache':'public,max-age=300','x-content-type-options':'nosniff'});return res.end(bytes);}
 if(req.method==='GET'&&path==='/health')return json(res,200,{ok:true,service:'zamin-fk-game-server'});
 if(req.method==='GET'&&path==='/ready'){await assertGameSchema(db());return json(res,200,{ok:true,database:true,schema:true,seeded:true});}
 if(req.method==='GET'&&path.startsWith('/uploads/')){const file=await readCrest(path.slice('/uploads/'.length));res.writeHead(200,{'content-type':file.type,'cache-control':'public,max-age=31536000,immutable','x-content-type-options':'nosniff'});return res.end(file.bytes);}
 if(req.method==='POST'&&path==='/api/auth/telegram'){
  if(!rateLimit(clientIp(req),12))throw new HttpError(429,'Too many login attempts');
  const body=await readJson(req);return json(res,200,await telegramLogin(body.initData));
 }
 const user=await authenticate(req);
 if(req.method==='POST'&&path==='/api/uploads/crest'){if(!rateLimit(clientIp(req)+':crest',10))throw new HttpError(429,'Too many crest uploads');const body=await readJson(req,3_100_000);const crestUrl=await saveCrest(body.dataUrl);return json(res,201,{crestUrl});}
 if(req.method==='GET'&&path==='/api/market'){
  const r=await db().query('SELECT id,full_name,nationality,age,position,quality,overall,potential,market_value_uzs,attributes FROM players WHERE club_id IS NULL ORDER BY overall DESC LIMIT 100');
  return json(res,200,{players:r.rows});
 }
 if(req.method==='GET'&&path==='/api/clubs'){
  const r=await db().query('SELECT * FROM clubs WHERE owner_user_id=$1 ORDER BY created_at',[user.id]);return json(res,200,{clubs:r.rows});
 }
 if(req.method==='POST'&&path==='/api/clubs'){
  const body=await readJson(req);const result=await makeClub(user.id,body);
  return json(res,201,{club:result.club,squad:result.players});
 }
 const parts=path.split('/').filter(Boolean);
 if(parts[0]==='api'&&parts[1]==='clubs'&&parts[2]){
  const clubId=uuid(parts[2],'Club ID');
  const club=await ownedClub(db(),clubId,user.id);
  if(req.method==='GET'&&parts.length===3)return json(res,200,{club});
  if(req.method==='POST'&&parts[3]==='identity'){
   const body=await readJson(req),name=safeString(body.name,28,'Club name'),shortName=safeString(body.shortName,5,'Short name').toUpperCase();
   if(!/^[A-Z0-9]{2,5}$/.test(shortName))throw new HttpError(400,'Short name must contain 2–5 letters or numbers');
   const primary=colour(body.primaryColour,'Primary colour'),secondary=colour(body.secondaryColour,'Secondary colour');
   const crest=body.crestUrl===undefined?club.crest_url:body.crestUrl;
   if(crest&&!/^\/uploads\/[0-9a-f-]{36}\.(png|jpg|webp)$/.test(crest))throw new HttpError(400,'Crest must be uploaded through the game server');
   const updated=await inTransaction(async client=>{await ownedClub(client,clubId,user.id,true);return (await client.query('UPDATE clubs SET name=$2,short_name=$3,primary_colour=$4,secondary_colour=$5,crest_url=$6 WHERE id=$1 RETURNING *',[clubId,name,shortName,primary,secondary,crest])).rows[0];});
   return json(res,200,{club:updated});
  }
  if(req.method==='GET'&&parts[3]==='squad')return json(res,200,{players:await clubSquad(clubId)});
  if(req.method==='GET'&&parts[3]==='lineup'){const r=await db().query('SELECT * FROM lineups WHERE club_id=$1',[clubId]);return json(res,200,{lineup:r.rows[0]||null});}
  if(req.method==='GET'&&parts[3]==='league'){const r=await db().query('SELECT lm.*,c.name,c.short_name,c.primary_colour,c.crest_url FROM league_members lm JOIN clubs c ON c.id=lm.club_id WHERE lm.league_id=(SELECT league_id FROM league_members WHERE club_id=$1 ORDER BY league_id DESC LIMIT 1) ORDER BY lm.points DESC,(lm.goals_for-lm.goals_against) DESC,lm.goals_for DESC',[clubId]);return json(res,200,{table:r.rows});}
  if(req.method==='GET'&&parts[3]==='development-ledger'){const r=await db().query('SELECT amount_dp,balance_after_dp,reason,created_at FROM development_ledger WHERE club_id=$1 ORDER BY created_at DESC LIMIT 30',[clubId]);return json(res,200,{transactions:r.rows});}
  if(req.method==='GET'&&parts[3]==='ledger'){const r=await db().query('SELECT amount_uzs,balance_after_uzs,reason,created_at FROM money_ledger WHERE club_id=$1 ORDER BY created_at DESC LIMIT 30',[clubId]);return json(res,200,{transactions:r.rows});}
  if(req.method==='GET'&&parts[3]==='missions'){
   const r=await db().query('SELECT m.*,cm.progress,cm.completed_at,cm.claimed_at FROM club_missions cm JOIN missions m ON m.id=cm.mission_id WHERE cm.club_id=$1 ORDER BY m.id',[clubId]);
   return json(res,200,{missions:r.rows});
  }
  if(req.method==='POST'&&parts[3]==='lineup'){
   const body=await readJson(req),formation=safeString(body.formation,8,'Formation');
   if(!formationPattern.test(formation))throw new HttpError(400,'Unsupported formation');
   if(!Array.isArray(body.starters)||body.starters.length!==11||new Set(body.starters).size!==11)throw new HttpError(400,'Select exactly 11 unique starters');
   const subs=body.substitutes===undefined?[]:body.substitutes;
   if(!Array.isArray(subs)||subs.length>7||new Set(subs).size!==subs.length)throw new HttpError(400,'Invalid substitutes');
   const all=body.starters.concat(subs).map(id=>uuid(id,'Player ID'));
   const owned=await db().query('SELECT id,position FROM players WHERE club_id=$1 AND id=ANY($2::uuid[])',[clubId,all]);
   if(owned.rowCount!==all.length)throw new HttpError(400,'Lineup contains a player outside this club');
   if(!owned.rows.some(p=>p.position==='GK'&&body.starters.includes(p.id)))throw new HttpError(400,'Your Starting XI must include a goalkeeper');
   await db().query('INSERT INTO lineups(club_id,formation,starters,substitutes,updated_at) VALUES($1,$2,$3,$4,NOW()) ON CONFLICT(club_id) DO UPDATE SET formation=EXCLUDED.formation,starters=EXCLUDED.starters,substitutes=EXCLUDED.substitutes,updated_at=NOW()',[clubId,formation,body.starters,subs]);
   return json(res,200,{ok:true});
  }
  if(req.method==='POST'&&parts[3]==='players'&&parts[4]==='sign'){
   const body=await readJson(req),playerId=uuid(body.playerId,'Player ID');
   const result=await inTransaction(async client=>{
    const c=await ownedClub(client,clubId,user.id,true);
    const p=(await client.query('SELECT * FROM players WHERE id=$1 AND club_id IS NULL FOR UPDATE',[playerId])).rows[0];
    if(!p)throw new HttpError(404,'Free agent not found');
    const fee=BigInt(p.market_value_uzs);
    if(BigInt(c.budget_uzs)<fee)throw new HttpError(400,'Insufficient club budget');
    await client.query('UPDATE clubs SET budget_uzs=budget_uzs-$2 WHERE id=$1',[clubId,fee.toString()]);
    await client.query('UPDATE players SET club_id=$2 WHERE id=$1',[playerId,clubId]);
    const bal=(BigInt(c.budget_uzs)-fee).toString();
    await client.query('INSERT INTO money_ledger(club_id,amount_uzs,balance_after_uzs,reason,reference_id) VALUES($1,$2,$3,$4,$5)',[clubId,(-fee).toString(),bal,'player_signing',playerId]);
    return {player:p,budgetUzs:bal};
   });
   return json(res,200,result);
  }
  if(req.method==='POST'&&parts[3]==='players'&&parts[4]==='sell'){
   const body=await readJson(req),playerId=uuid(body.playerId,'Player ID');
   const result=await inTransaction(async client=>{
    const c=await ownedClub(client,clubId,user.id,true);
    const p=(await client.query('SELECT * FROM players WHERE id=$1 AND club_id=$2 FOR UPDATE',[playerId,clubId])).rows[0];
    if(!p)throw new HttpError(404,'Player not found');
    const count=await client.query('SELECT COUNT(*)::int AS count FROM players WHERE club_id=$1',[clubId]);
    if(Number(count.rows[0].count)<=11)throw new HttpError(400,'A club must keep at least 11 players');
    if(p.position==='GK'){const keepers=await client.query("SELECT COUNT(*)::int AS count FROM players WHERE club_id=$1 AND position='GK'",[clubId]);if(Number(keepers.rows[0].count)<=1)throw new HttpError(400,'A club must keep at least one goalkeeper');}
    const fee=saleValueUzs(p.market_value_uzs),bal=(BigInt(c.budget_uzs)+fee).toString();
    await client.query('UPDATE players SET club_id=NULL WHERE id=$1',[playerId]);
    await client.query('UPDATE clubs SET budget_uzs=budget_uzs+$2 WHERE id=$1',[clubId,fee.toString()]);
    await client.query('UPDATE lineups SET starters=array_remove(starters,$2::uuid),substitutes=array_remove(substitutes,$2::uuid) WHERE club_id=$1',[clubId,playerId]);
    await client.query('INSERT INTO money_ledger(club_id,amount_uzs,balance_after_uzs,reason,reference_id) VALUES($1,$2,$3,$4,$5)',[clubId,fee.toString(),bal,'player_sale',playerId]);
    return {player:p,budgetUzs:bal};
   });
   return json(res,200,result);
  }
  if(req.method==='POST'&&parts[3]==='players'&&parts[4]==='upgrade'){
   const body=await readJson(req),playerId=uuid(body.playerId,'Player ID'),attribute=safeString(body.attribute,20,'Attribute');
   const levels=Math.max(1,Math.min(5,Number(body.levels||1)));
   if(!['pace','shooting','passing','dribbling','defending','physical'].includes(attribute)||!Number.isInteger(levels))throw new HttpError(400,'Invalid upgrade');
   const result=await inTransaction(async client=>{
    const c=await ownedClub(client,clubId,user.id,true);
    const p=(await client.query('SELECT * FROM players WHERE id=$1 AND club_id=$2 FOR UPDATE',[playerId,clubId])).rows[0];
    if(!p)throw new HttpError(404,'Player not found');
    const attrs={...p.attributes},start=Number(attrs[attribute]||1),end=Math.min(Number(p.potential),start+levels);
    const actual=end-start;if(actual<1)throw new HttpError(400,'Player has reached the upgrade cap for this attribute');
    const cost=upgradeCost(start,actual);
    if(Number(c.development_points)<cost)throw new HttpError(400,'Not enough development points');
    attrs[attribute]=end;
    const avg=Object.values(attrs).reduce((a,b)=>a+Number(b),0)/6;
    const overall=Math.min(Number(p.potential),Math.max(Number(p.overall),Math.round(avg)));
    const quality=qualityForOverall(overall);
    const marketValue=marketValueUzs(overall);
    await client.query('UPDATE players SET attributes=$2::jsonb,overall=$3,quality=$4,market_value_uzs=$5 WHERE id=$1',[playerId,JSON.stringify(attrs),overall,quality,marketValue]);
    const dp=await client.query('UPDATE clubs SET development_points=development_points-$2 WHERE id=$1 RETURNING development_points',[clubId,cost]);
    await client.query('INSERT INTO development_ledger(club_id,amount_dp,balance_after_dp,reason,reference_id) VALUES($1,$2,$3,$4,$5)',[clubId,-cost,dp.rows[0].development_points,'player_upgrade',playerId]);
    return {player:{...p,attributes:attrs,overall},spentDp:cost,remainingDp:Number(c.development_points)-cost};
   });
   return json(res,200,result);
  }
  if(req.method==='POST'&&parts[3]==='leagues'&&parts[4]==='ensure'){
   const id=await inTransaction(client=>ensureLeague(client));
   return json(res,200,{leagueId:id,created:Boolean(id)});
  }
  if(req.method==='GET'&&parts[3]==='fixtures'){
   const r=await db().query('SELECT '+fixtureColumns+',NOW() AS server_time'+fixtureJoins+' WHERE (f.home_club_id=$1 OR f.away_club_id=$1) AND f.kickoff_at IS NOT NULL ORDER BY f.kickoff_at,f.id',[clubId]);
   return json(res,200,{fixtures:r.rows,timezone:LEAGUE_TIMEZONE,matchDurationSeconds:MATCH_DURATION_SECONDS});
  }
  if(parts[3]==='results'){
   if(req.method==='GET'&&parts.length===4){
    const limit=Math.max(1,Math.min(50,Number(url.searchParams.get('limit'))||20));
    const r=await db().query(resultsSql(false,'')+' LIMIT $2',[clubId,limit]);
    return json(res,200,{results:r.rows,unviewedCount:await unviewedCount(db(),clubId),timezone:LEAGUE_TIMEZONE});
   }
   if(req.method==='POST'&&parts[4]==='viewed'&&parts.length===5){
    const body=await readJson(req);let ids=null;
    if(body.all!==true){
     if(!Array.isArray(body.fixtureIds)||!body.fixtureIds.length||body.fixtureIds.length>100)throw new HttpError(400,'Provide fixtureIds or all');
     ids=body.fixtureIds.map(id=>uuid(id,'Fixture ID'));
    }
    await db().query("INSERT INTO fixture_result_views(club_id,fixture_id) SELECT $1,f.id FROM fixtures f WHERE f.status='played' AND (f.home_club_id=$1 OR f.away_club_id=$1) AND ($2::uuid[] IS NULL OR f.id=ANY($2::uuid[])) ON CONFLICT DO NOTHING",[clubId,ids]);
    return json(res,200,{unviewedCount:await unviewedCount(db(),clubId)});
   }
   if(req.method==='GET'&&parts.length===5){
    const fixtureId=uuid(parts[4],'Fixture ID');
    const r=await db().query(resultsSql(true,' AND f.id=$2::uuid'),[clubId,fixtureId]);
    if(!r.rowCount)throw new HttpError(404,'Result not found');
    return json(res,200,{result:r.rows[0],timezone:LEAGUE_TIMEZONE});
   }
  }
  if(req.method==='GET'&&parts[3]==='opponents'&&parts.length===4){
   const r=await db().query('SELECT id,name,short_name,crest_url,primary_colour FROM clubs WHERE owner_user_id<>$1 ORDER BY name,id LIMIT 200',[user.id]);
   return json(res,200,{clubs:r.rows});
  }
  if(parts[3]==='friendlies'){
   if(req.method==='GET'&&parts.length===4){
    const r=await db().query(friendlySelect+' WHERE r.from_club_id=$1 OR r.to_club_id=$1 ORDER BY r.created_at DESC LIMIT 50',[clubId]);
    return json(res,200,{requests:r.rows,timezone:LEAGUE_TIMEZONE,matchDurationSeconds:MATCH_DURATION_SECONDS});
   }
   if(req.method==='POST'&&parts.length===4){
    const body=await readJson(req),opponentId=uuid(body.opponentClubId,'Opponent club ID');
    if(typeof body.kickoffAt!=='string'||body.kickoffAt.length>40||Number.isNaN(Date.parse(body.kickoffAt)))throw new HttpError(400,'Kick-off date and time are invalid');
    const proposed=new Date(Date.parse(body.kickoffAt)).toISOString();
    const request=await inTransaction(async client=>{
     const opponent=(await client.query('SELECT id,owner_user_id FROM clubs WHERE id=$1',[opponentId])).rows[0];
     if(!opponent)throw new HttpError(404,'Opponent club not found');
     if(opponent.owner_user_id===user.id)throw new HttpError(400,'You cannot challenge one of your own clubs');
     const t=(await client.query("SELECT k,k>=NOW()+interval '2 minutes' AS late_enough,k<=NOW()+interval '30 days' AS soon_enough FROM (SELECT date_trunc('minute',$1::timestamptz) AS k) q",[proposed])).rows[0];
     if(!t.late_enough)throw new HttpError(400,'Kick-off must be at least 2 minutes in the future');
     if(!t.soon_enough)throw new HttpError(400,'Kick-off must be within the next 30 days');
     const pending=await client.query("SELECT COUNT(*)::int AS count FROM friendly_requests WHERE from_club_id=$1 AND status='pending'",[clubId]);
     if(Number(pending.rows[0].count)>=10)throw new HttpError(409,'Too many pending friendly requests');
     if(await clubsBusy(client,[clubId,opponentId],t.k))throw new HttpError(409,'One of the clubs already has a match at that time');
     const inserted=await client.query("INSERT INTO friendly_requests(from_club_id,to_club_id,proposed_kickoff_at) VALUES($1,$2,$3) ON CONFLICT (from_club_id,to_club_id,proposed_kickoff_at) WHERE status='pending' DO NOTHING RETURNING *",[clubId,opponentId,t.k]);
     if(!inserted.rowCount)throw new HttpError(409,'This friendly request already exists');
     return inserted.rows[0];
    });
    return json(res,201,{request});
   }
   if(req.method==='POST'&&parts.length===6&&['accept','decline','cancel'].includes(parts[5])){
    const requestId=uuid(parts[4],'Request ID'),action=parts[5];
    const result=await inTransaction(async client=>{
     // The same lock as league creation, so a friendly can never slip into a slot a new league is taking.
     if(action==='accept')await client.query('SELECT pg_advisory_xact_lock($1)',[LEAGUE_LOCK]);
     const r=(await client.query('SELECT r.*,(r.proposed_kickoff_at>NOW()) AS in_future FROM friendly_requests r WHERE r.id=$1 AND '+(action==='cancel'?'r.from_club_id':'r.to_club_id')+'=$2 FOR UPDATE OF r',[requestId,clubId])).rows[0];
     if(!r)throw new HttpError(404,'Friendly request not found');
     if(r.status!=='pending')throw new HttpError(409,'This request is already '+r.status);
     if(action!=='accept')return {request:(await client.query('UPDATE friendly_requests SET status=$2,responded_at=NOW() WHERE id=$1 RETURNING *',[requestId,action==='decline'?'declined':'cancelled'])).rows[0]};
     if(!r.in_future)throw new HttpError(409,'The proposed kick-off time has passed');
     if(await clubsBusy(client,[r.from_club_id,r.to_club_id],r.proposed_kickoff_at))throw new HttpError(409,'One of the clubs already has a match at that time');
     const fixture=(await client.query("INSERT INTO fixtures(kind,home_club_id,away_club_id,kickoff_at) VALUES('friendly',$1,$2,$3) RETURNING id,kind,home_club_id,away_club_id,kickoff_at,status",[r.from_club_id,r.to_club_id,r.proposed_kickoff_at])).rows[0];
     const request=(await client.query("UPDATE friendly_requests SET status='accepted',responded_at=NOW(),fixture_id=$2 WHERE id=$1 RETURNING *",[requestId,fixture.id])).rows[0];
     return {request,fixture};
    });
    return json(res,200,result);
   }
  }
 }
 throw new HttpError(404,'Route not found');
}
const server=http.createServer(async(req,res)=>{
 try{
  if(req.method!=='GET'&&!rateLimit(clientIp(req),120))throw new HttpError(429,'Too many requests');
  await handle(req,res);
 }catch(error){
  const status=Number(error.status)||500;
  if(status>=500)console.error(error);
  if(!res.headersSent)json(res,status,{error:status>=500?'Internal server error':error.message});
  else res.destroy();
 }
});
server.listen(config.port,'0.0.0.0',()=>console.log('ZAMIN FK isolated game server listening on '+config.port));
// League and friendly matches are settled here, by the server alone, whether or not anyone is online.
if(pool)startScheduler({maxIdleMs:config.schedulerMaxIdleMs});
async function shutdown(){server.close(async()=>{try{await pool?.end();process.exit(0);}catch(error){console.error(error);process.exit(1);}});}
process.on('SIGTERM',shutdown);
process.on('SIGINT',shutdown);

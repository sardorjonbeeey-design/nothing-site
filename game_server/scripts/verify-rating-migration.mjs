// Check of migration 006 (rating profiles) against DISPOSABLE LOCAL databases only.
// Usage: node scripts/verify-rating-migration.mjs postgresql://postgres:local@localhost:5432
// Needs a local database named zamin_legacy. It is wiped.
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
import {marketValueUzs} from '../src/economy.js';
import {UZBEK_LEAGUE} from '../src/ratings.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const base=process.argv[2]||'';const host=new URL(base).hostname;
if(!['localhost','127.0.0.1'].includes(host)){console.error('Local databases only');process.exit(2);}
const DB='zamin_legacy';
let failed=0;const check=(name,pass,detail='')=>{if(!pass)failed++;console.log((pass?'PASS':'FAIL')+' '+name+(detail?' — '+detail:''));};
function migrate(){
 try{return {ok:true,out:execFileSync(process.execPath,['src/migrate.js'],{cwd:root,stdio:'pipe',env:{PATH:process.env.PATH,DATABASE_URL:base+'/'+DB,EXPECTED_DATABASE_NAME:DB,NODE_ENV:'development'}}).toString()};}
 catch(error){return {ok:false,out:String(error.stdout||'')+String(error.stderr||'')};}
}
const sql006=await fs.readFile(path.join(root,'db','006_rating_profiles.sql'),'utf8');
const c=new pg.Client({connectionString:base+'/'+DB});await c.connect();
const positions=['GK','CB','LB','RB','DM','CM','AM','LW','RW','ST'];
// Schema 001-005 with two clubs, their squads, lineups and ledgers, as a database looked before migration 006.
async function legacy(){
 await c.query('DROP SCHEMA public CASCADE;CREATE SCHEMA public');
 await c.query('CREATE TABLE schema_migrations (version VARCHAR(80) PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
 for(const v of ['001_initial','002_development_ledger','003_league_schedule','004_economy','005_price_rebalance']){
  await c.query(await fs.readFile(path.join(root,'db',v+'.sql'),'utf8'));
  await c.query('INSERT INTO schema_migrations(version) VALUES($1) ON CONFLICT DO NOTHING',[v]);
 }
 let i=0;const clubs=[];
 const add=async(club,overall,potential,origin='market',sold=false)=>(await c.query('INSERT INTO players(club_id,full_name,age,position,quality,overall,potential,attributes,market_value_uzs,origin,first_sale_done) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11) RETURNING id',
  [club,'Legacy Player '+(++i),17+i%20,positions[i%10],'developing',overall,potential,JSON.stringify({pace:overall,shooting:overall-1,passing:overall+1,dribbling:overall,defending:overall-2,physical:Math.min(99,overall+9)}),marketValueUzs(overall),origin,sold])).rows[0].id;
 for(const [n,budget] of [[1,'20000000'],[2,'7654321']]){
  const u=(await c.query('INSERT INTO game_users(telegram_user_id,username) VALUES($1,$2) RETURNING id',['legacy-'+n,'legacy'+n])).rows[0].id;
  const club=(await c.query('INSERT INTO clubs(owner_user_id,name,short_name,budget_uzs,development_points) VALUES($1,$2,$3,$4,$5) RETURNING id',[u,'Legacy '+n,'LG'+n,budget,n*7])).rows[0].id;clubs.push(club);
  const ids=[];for(let k=0;k<18;k++)ids.push(await add(club,40+k*2,Math.min(92,52+k*3),k%3===0?'market':'academy',k%5===0));
  await c.query('INSERT INTO lineups(club_id,formation,starters,substitutes) VALUES($1,$2,$3,$4)',[club,n===1?'4-4-2':'3-5-2',ids.slice(0,11),ids.slice(11)]);
  for(const [amount,balance,reason,ref] of [[20000000,20000000,'club_created',null],[-1320000,18680000,'player_signing',ids[3]],[530000,19210000,'player_sale',ids[5]]])
   await c.query('INSERT INTO money_ledger(club_id,amount_uzs,balance_after_uzs,reason,reference_id) VALUES($1,$2,$3,$4,$5)',[club,amount,balance,reason,ref]);
  await c.query("INSERT INTO development_ledger(club_id,amount_dp,balance_after_dp,reason) VALUES($1,7,7,'match_reward')",[club]);
 }
 // Free agents on both edges of the range, and with every potential the old rules allowed above 90.
 for(const [overall,potential] of [[40,40],[40,90],[90,90],[74,90],[74,91],[74,92],[80,92],[88,91],[90,92],[85,100]])await add(null,overall,potential);
 return clubs;
}
const q=async sql=>JSON.stringify((await c.query(sql)).rows);
const snap=async()=>({
 players:await q("SELECT to_jsonb(p)-'potential'-'category' AS row FROM players p ORDER BY id"),
 lowPotential:await q('SELECT id,potential FROM players WHERE potential<=90 ORDER BY id'),
 highPotential:await q('SELECT id FROM players WHERE potential>90 ORDER BY id'),
 clubs:await q('SELECT to_jsonb(x) AS row FROM clubs x ORDER BY id'),users:await q('SELECT to_jsonb(x) AS row FROM game_users x ORDER BY id'),
 lineups:await q('SELECT to_jsonb(x) AS row FROM lineups x ORDER BY club_id'),money:await q('SELECT to_jsonb(x) AS row FROM money_ledger x ORDER BY id'),
 dp:await q('SELECT to_jsonb(x) AS row FROM development_ledger x ORDER BY id'),
 all:await q('SELECT to_jsonb(p) AS row FROM players p ORDER BY id')
});
const rejects=async(label,sql,params=[])=>{
 let message='';try{await c.query(sql,params);}catch(error){message=error.message;}
 check(label,message!=='',message||'statement was accepted');
};
const insert="INSERT INTO players(full_name,age,position,quality,overall,potential,attributes,market_value_uzs,origin) VALUES('Probe',20,'ST','elite',$1,$2,$3::jsonb,0,'market') RETURNING id";
const attrs=(n,extra={})=>JSON.stringify({pace:n,shooting:n,passing:n,dribbling:n,defending:n,physical:n,...extra});

// 1. Legacy data inside the range: migration applies, potentials above 90 are lowered, nothing else changes.
{
 await legacy();const before=await snap();
 const highBefore=JSON.parse(before.highPotential).map(r=>r.id);
 const run=migrate();
 check('legacy: only migration 006 applied',run.ok&&run.out.includes('Applied migration 006_rating_profiles')&&(run.out.match(/Applied/g)||[]).length===1,run.ok?'':run.out.slice(-300));
 const after=await snap();
 for(const [key,label] of [['players','player ownership, overall, attributes, market value, origin, first-sale flag'],['clubs','club budgets and Development Points'],['users','users'],['lineups','lineups and formations'],['money','money ledger'],['dp','Development Points ledger']])
  check('legacy: unchanged — '+label,before[key]===after[key]);
 const lowered=(await c.query('SELECT potential FROM players WHERE id=ANY($1::uuid[])',[highBefore])).rows;
 check('legacy: '+highBefore.length+' potentials above 90 lowered to exactly 90',highBefore.length>=9&&lowered.length===highBefore.length&&lowered.every(r=>Number(r.potential)===90));
 const stillLow=JSON.parse(before.lowPotential),now=new Map((await c.query('SELECT id,potential FROM players')).rows.map(r=>[r.id,Number(r.potential)]));
 check('legacy: '+stillLow.length+' potentials of 90 or less untouched',stillLow.every(r=>now.get(r.id)===Number(r.potential)));
 check('legacy: every row is uzbek_league, overall 40-90, potential overall..90',(await c.query("SELECT 1 FROM players WHERE category<>'uzbek_league' OR overall NOT BETWEEN 40 AND 90 OR potential<overall OR potential>90")).rowCount===0);
 const profile=(await c.query('SELECT * FROM rating_profiles')).rows;
 check('profile table holds exactly the code profile',profile.length===1&&profile[0].category===UZBEK_LEAGUE.category&&profile[0].min_overall===UZBEK_LEAGUE.minOverall&&profile[0].max_overall===UZBEK_LEAGUE.maxOverall&&profile[0].max_potential===UZBEK_LEAGUE.maxPotential&&profile[0].max_attribute===UZBEK_LEAGUE.maxAttribute,JSON.stringify(profile));
 // Repeatable: the runner skips it, and the SQL itself can be executed again without changing a row.
 check('repeat: migration runner applies nothing',!migrate().out.includes('Applied'));
 const settled=await snap();await c.query(sql006);const again=await snap();
 check('repeat: running the SQL again succeeds and changes no row',JSON.stringify(settled)===JSON.stringify(again));
 check('repeat: one trigger, one profile row',(await c.query("SELECT 1 FROM pg_trigger WHERE tgrelid='players'::regclass AND NOT tgisinternal")).rowCount===1&&(await c.query('SELECT 1 FROM rating_profiles')).rowCount===1);
 // Database validation after the migration.
 for(const [overall,potential,a,label] of [[40,40,attrs(40),'overall 40'],[90,90,attrs(90),'overall 90'],[90,90,attrs(88,{physical:99,defending:99}),'attributes of 99 at overall 90']])
  check('accepted: '+label,(await c.query(insert,[overall,potential,a])).rowCount===1);
 await rejects('rejected: overall 39',insert,[39,60,attrs(39)]);
 await rejects('rejected: overall 91',insert,[91,91,attrs(90)]);
 await rejects('rejected: overall 100',insert,[100,100,attrs(99)]);
 await rejects('rejected: potential 91',insert,[80,91,attrs(80)]);
 await rejects('rejected: potential below overall',insert,[80,79,attrs(80)]);
 await rejects('rejected: attribute 100',insert,[90,90,attrs(90,{pace:100})]);
 await rejects('rejected: attribute 0',insert,[60,70,attrs(60,{pace:0})]);
 await rejects('rejected: missing attribute',insert,[60,70,JSON.stringify({pace:60})]);
 await rejects('rejected: unknown category',"INSERT INTO players(full_name,age,position,quality,overall,potential,attributes,market_value_uzs,origin,category) VALUES('Probe',20,'ST','elite',100,110,$1::jsonb,0,'market','international_iconic')",[attrs(99)]);
 const id=(await c.query('SELECT id FROM players WHERE overall=90 AND club_id IS NULL LIMIT 1')).rows[0].id;
 await rejects('rejected: UPDATE raising overall to 91','UPDATE players SET overall=91,potential=91 WHERE id=$1',[id]);
 await rejects('rejected: UPDATE raising potential to 91','UPDATE players SET potential=91 WHERE id=$1',[id]);
 await rejects('rejected: UPDATE lowering overall to 39','UPDATE players SET overall=39 WHERE id=$1',[id]);
 check('allowed: updates that do not touch ratings (ownership, price)',(await c.query('UPDATE players SET market_value_uzs=market_value_uzs WHERE id=$1',[id])).rowCount===1);
 // Future capacity, inside a transaction that is rolled back: one INSERT into rating_profiles is all a new category needs.
 await c.query('BEGIN');
 await c.query("INSERT INTO rating_profiles VALUES('international_iconic',95,115,115,125)");
 const iconic="INSERT INTO players(full_name,age,position,quality,overall,potential,attributes,market_value_uzs,origin,category) VALUES('Probe',20,'ST','elite',$1,$2,$3::jsonb,0,'market','international_iconic')";
 const made=(await c.query(iconic+' RETURNING overall',[115,115,attrs(115)])).rows[0];
 await c.query('SAVEPOINT s');let refused=false;try{await c.query(iconic,[94,115,attrs(95)]);}catch{refused=true;}await c.query('ROLLBACK TO s');
 let uzbekStill=false;try{await c.query(insert,[95,95,attrs(95)]);}catch{uzbekStill=true;}
 await c.query('ROLLBACK');
 check('future: a 95-115 profile row admits overall 115 with no schema change',made.overall===115);
 check('future: that profile refuses 94, and uzbek_league still refuses 95',refused&&uzbekStill);
 check('future: rolled back — still one profile and no player above 90',(await c.query('SELECT 1 FROM rating_profiles')).rowCount===1&&(await c.query('SELECT 1 FROM players WHERE overall>90')).rowCount===0);
}
// 2. Legacy data outside the range: the migration aborts and leaves the database exactly as it was.
for(const [overall,potential] of [[39,60],[91,95],[100,100]]){
 await legacy();
 await c.query("INSERT INTO players(full_name,age,position,quality,overall,potential,attributes,market_value_uzs,origin) VALUES('Out Of Range',20,'ST','elite',$1,$2,$3::jsonb,0,'market')",[overall,potential,attrs(Math.min(99,overall))]);
 const before=await snap(),run=migrate(),after=await snap();
 check('abort: overall '+overall+' stops migration 006',!run.ok&&/requires every player overall inside its rating profile/.test(run.out));
 check('abort: overall '+overall+' — rolled back, every row identical, potentials above 90 still present',JSON.stringify(before)===JSON.stringify(after)&&JSON.parse(after.highPotential).length>0
  &&(await c.query("SELECT 1 FROM schema_migrations WHERE version='006_rating_profiles'")).rowCount===0&&(await c.query("SELECT to_regclass('public.rating_profiles') AS t")).rows[0].t===null);
}
await c.end();
console.log(failed?failed+' check(s) FAILED':'All rating-migration checks passed');process.exit(failed?1:0);

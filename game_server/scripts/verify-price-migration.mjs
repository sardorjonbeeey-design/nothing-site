// Phase A check for migration 005 against DISPOSABLE LOCAL databases only.
// Usage: node scripts/verify-price-migration.mjs postgresql://postgres:local@localhost:5432
// Needs two empty local databases: zamin_game (fresh chain) and zamin_legacy (pre-005 rows). Both are wiped.
// The legacy case applies migration 005 on its own, so it can cover the price formula for overall 1-100;
// later migrations (rating profiles) are checked by scripts/verify-rating-migration.mjs.
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
import {marketValueUzs} from '../src/economy.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const base=process.argv[2]||'';const host=new URL(base).hostname;
if(!['localhost','127.0.0.1'].includes(host)){console.error('Local databases only');process.exit(2);}
let failed=0;const check=(name,pass,detail='')=>{if(!pass)failed++;console.log((pass?'PASS':'FAIL')+' '+name+(detail?' — '+detail:''));};
const node=(script,db)=>execFileSync(process.execPath,[script],{cwd:root,env:{PATH:process.env.PATH,DATABASE_URL:base+'/'+db,EXPECTED_DATABASE_NAME:db,NODE_ENV:'development'}}).toString();
const open=async db=>{const c=new pg.Client({connectionString:base+'/'+db});await c.connect();await c.query('DROP SCHEMA public CASCADE;CREATE SCHEMA public');return c;};
const mispriced=async c=>{
 const rows=(await c.query('SELECT id,overall,market_value_uzs FROM players')).rows;
 return {total:rows.length,bad:rows.filter(r=>Number(r.market_value_uzs)!==marketValueUzs(Number(r.overall))).length,
  overalls:[...new Set(rows.map(r=>Number(r.overall)))].sort((a,b)=>a-b)};
};
// 1. Full chain from an empty database, then the seed.
{
 const c=await open('zamin_game');
 const out=node('src/migrate.js','zamin_game');
 check('fresh: migrations 001-006 applied from empty',['001_initial','002_development_ledger','003_league_schedule','004_economy','005_price_rebalance','006_rating_profiles'].every(v=>out.includes('Applied migration '+v)));
 check('fresh: second run applies nothing',!node('src/migrate.js','zamin_game').includes('Applied'));
 node('src/seed.js','zamin_game');
 const m=await mispriced(c);
 check('fresh: every seeded player priced by the formula',m.total>0&&m.bad===0,m.total+' players, overall '+m.overalls[0]+'-'+m.overalls.at(-1)+', '+m.bad+' mispriced');
 await c.end();
}
// 2. Legacy-shaped database: schema 001-004 with rows priced by the old 30M x 1.10 curve, then migration 005 only.
{
 const c=await open('zamin_legacy');
 await c.query('CREATE TABLE schema_migrations (version VARCHAR(80) PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
 for(const v of ['001_initial','002_development_ledger','003_league_schedule','004_economy']){
  await c.query(await fs.readFile(path.join(root,'db',v+'.sql'),'utf8'));
  await c.query('INSERT INTO schema_migrations(version) VALUES($1) ON CONFLICT DO NOTHING',[v]);
 }
 const old=o=>Math.round(30_000_000*Math.pow(1.10,o-80)/10_000)*10_000;
 const attrs=o=>JSON.stringify({pace:o,shooting:o-1,passing:o+1,dribbling:o,defending:o-2,physical:o+2});
 const clubs=[];
 for(const [n,budget] of [[1,'20000000'],[2,'7654321']]){
  const u=(await c.query('INSERT INTO game_users(telegram_user_id,username) VALUES($1,$2) RETURNING id',['legacy-'+n,'legacy'+n])).rows[0].id;
  clubs.push((await c.query('INSERT INTO clubs(owner_user_id,name,short_name,budget_uzs,development_points) VALUES($1,$2,$3,$4,$5) RETURNING id',[u,'Legacy '+n,'LG'+n,budget,n*7])).rows[0].id);
 }
 const positions=['GK','CB','LB','RB','DM','CM','AM','LW','RW','ST'];let i=0;
 const add=async(club,overall,origin,sold)=>(await c.query('INSERT INTO players(club_id,full_name,age,position,quality,overall,potential,attributes,market_value_uzs,origin,first_sale_done) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11) RETURNING id',
  [club,'Legacy Player '+(++i),17+i%20,positions[i%10],'developing',overall,Math.min(100,overall+5),attrs(overall),old(overall),origin,sold])).rows[0].id;
 for(const club of clubs){
  const ids=[];for(let k=0;k<18;k++)ids.push(await add(club,46+k*2,k%3===0?'market':'academy',k%5===0));
  await c.query('INSERT INTO lineups(club_id,formation,starters,substitutes) VALUES($1,$2,$3,$4)',[club,club===clubs[0]?'4-4-2':'3-5-2',ids.slice(0,11),ids.slice(11)]);
  // Transfer history as it was booked at the old prices.
  for(const [amount,balance,reason,ref] of [[20000000,20000000,'club_created',null],[-old(60),20000000-old(60),'player_signing',ids[3]],[old(58)/2,20000000-old(60)+old(58)/2,'player_sale',ids[5]]])
   await c.query('INSERT INTO money_ledger(club_id,amount_uzs,balance_after_uzs,reason,reference_id) VALUES($1,$2,$3,$4,$5)',[club,amount,balance,reason,ref]);
  await c.query("INSERT INTO development_ledger(club_id,amount_dp,balance_after_dp,reason) VALUES($1,7,7,'match_reward')",[club]);
 }
 for(let o=1;o<=100;o++)await add(null,o,'market',false);
 const snap=async()=>{
  const q=async sql=>JSON.stringify((await c.query(sql)).rows);
  return {
   players:await q("SELECT to_jsonb(p)-'market_value_uzs' AS row FROM players p ORDER BY id"),
   clubs:await q('SELECT to_jsonb(x) AS row FROM clubs x ORDER BY id'),
   users:await q('SELECT to_jsonb(x) AS row FROM game_users x ORDER BY id'),
   lineups:await q('SELECT to_jsonb(x) AS row FROM lineups x ORDER BY club_id'),
   money:await q('SELECT to_jsonb(x) AS row FROM money_ledger x ORDER BY id'),
   dp:await q('SELECT to_jsonb(x) AS row FROM development_ledger x ORDER BY id'),
   values:await q('SELECT id,market_value_uzs FROM players ORDER BY id')
  };
 };
 const before=await snap();
 await c.query('BEGIN');await c.query(await fs.readFile(path.join(root,'db','005_price_rebalance.sql'),'utf8'));
 await c.query("INSERT INTO schema_migrations(version) VALUES('005_price_rebalance')");await c.query('COMMIT');
 check('legacy: migration 005 applied on its own',(await c.query('SELECT 1 FROM schema_migrations')).rowCount===5);
 const after=await snap();
 for(const [key,label] of [['players','player ownership, attributes, origin and first-sale flags'],['clubs','club budgets and Development Points'],['users','users'],['lineups','lineups and formations'],['money','money ledger (transfer history)'],['dp','Development Points ledger']])
  check('legacy: unchanged — '+label,before[key]===after[key]);
 check('legacy: market values did change',before.values!==after.values);
 const m=await mispriced(c);
 check('legacy: all '+m.total+' rows repriced to 11,000,000 x 1.112^(overall-80)',m.bad===0,'overall '+m.overalls[0]+'-'+m.overalls.at(-1));
 const sample=(await c.query('SELECT overall,market_value_uzs FROM players WHERE club_id IS NULL AND overall IN (1,45,58,74,80,90,100) ORDER BY overall')).rows.map(r=>r.overall+'='+r.market_value_uzs).join(', ');
 check('legacy: sample values',sample.includes('80=11000000')&&sample.includes('58=1060000')&&sample.includes('74=5820000'),sample);
 await c.end();
}
console.log(failed?failed+' check(s) FAILED':'All migration checks passed');process.exit(failed?1:0);

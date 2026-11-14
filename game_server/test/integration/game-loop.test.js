// Integration test for the complete game loop against a THROWAWAY LOCAL PostgreSQL database.
//
// Skipped unless INTEGRATION_DATABASE_URL is set. The URL must point at localhost and at a database
// named zamin_game. The test DROPS AND RECREATES the public schema of that database, so it refuses
// to run against any non-local host. Never point it at Neon or any shared/live database.
//
// Authentication uses the local-only x-dev-user-id header and a fake, locally signed Telegram
// initData payload. Nothing here contacts Telegram or any external service.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
import {upgradeCost,saleValueUzs,marketValueUzs,qualityForOverall} from '../../src/economy.js';
import {academySquadTemplate,youthSlots} from '../../src/catalog.js';
import {isValidLineup,lineupProblem} from '../../src/lineup.js';
import {FORMATION_IDS,analyseLineup} from '../../src/formations.js';
import {squadStrength} from '../../src/simulation.js';
import {UZBEK_LEAGUE} from '../../src/ratings.js';

const DB_URL=process.env.INTEGRATION_DATABASE_URL||'';
const serverRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const FAKE_BOT_TOKEN='123456:fake-token-for-local-integration-tests';
const PORT=Number(process.env.INTEGRATION_PORT||18181);
const BASE='http://127.0.0.1:'+PORT;

function assertLocalDatabase(){
 const u=new URL(DB_URL);
 if(!['localhost','127.0.0.1'].includes(u.hostname))throw new Error('Integration tests only run against a localhost database');
 if(u.pathname!=='/zamin_game')throw new Error('Integration database must be named zamin_game');
}
function childEnv(extra={}){
 return {PATH:process.env.PATH,DATABASE_URL:DB_URL,EXPECTED_DATABASE_NAME:'zamin_game',NODE_ENV:'development',ALLOW_DEV_AUTH:'true',
  SESSION_SECRET:'local-integration-session-secret-0123456789',TELEGRAM_BOT_TOKEN:FAKE_BOT_TOKEN,PORT:String(PORT),
  // A deliberately foreign process timezone: kick-off times must come from Asia/Tashkent, never from the server's local zone.
  TZ:'America/New_York',SCHEDULER_MAX_IDLE_MS:'300',...extra};
}
function run(script,env=childEnv()){
 return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[script],{cwd:serverRoot,env});let out='';
  child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>out+=d);
  child.on('exit',code=>code===0?resolve(out):reject(new Error(script+' exited '+code+'\n'+out)));
 });
}
async function startServer(env){
 const child=spawn(process.execPath,['src/server.js'],{cwd:serverRoot,env});let log='';
 child.stdout.on('data',d=>log+=d);child.stderr.on('data',d=>log+=d);
 const base='http://127.0.0.1:'+env.PORT;
 for(let i=0;i<50;i++){
  try{if((await fetch(base+'/health')).ok)return {child,base,log:()=>log};}catch{}
  await new Promise(r=>setTimeout(r,100));
 }
 child.kill();throw new Error('Server did not start\n'+log);
}
// Each simulated user gets its own forwarded IP so the per-IP rate limiter treats them separately.
async function call(user,method,route,body,base=BASE){
 const headers={'content-type':'application/json'};
 if(user?.token)headers.authorization='Bearer '+user.token;
 else if(user?.dev)headers['x-dev-user-id']=String(user.dev);
 if(user?.dev)headers['x-forwarded-for']='10.0.0.'+user.dev;
 const res=await fetch(base+route,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
 let data=null;try{data=await res.json();}catch{}
 return {status:res.status,data,headers:res.headers};
}
const ok=async(user,method,route,body)=>{const r=await call(user,method,route,body);assert.ok(r.status>=200&&r.status<300,method+' '+route+' -> '+r.status+' '+JSON.stringify(r.data));return r.data;};
function signedInitData(telegramId){
 const params=new URLSearchParams();
 params.set('auth_date',String(Math.floor(Date.now()/1000)));
 params.set('user',JSON.stringify({id:telegramId,first_name:'Integration',username:'integration_user'}));
 const data=[...params.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+'='+v).join('\n');
 const key=crypto.createHmac('sha256','WebAppData').update(FAKE_BOT_TOKEN).digest();
 params.set('hash',crypto.createHmac('sha256',key).update(data).digest('hex'));
 return params.toString();
}
const users=Array.from({length:14},(_,i)=>({dev:i+1}));
const clubs=[];
const uploaded=[];
let server,server2,db,friendlyB,leagueSlot;
const logs=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function waitFor(check,label,timeout=20000){const end=Date.now()+timeout;for(;;){if(await check())return;if(Date.now()>end)throw new Error('Timed out waiting for '+label);await sleep(150);}}
const one=async(sql,params=[])=>(await db.query(sql,params)).rows[0];
const iso=v=>new Date(v).toISOString();
const inMinutes=n=>new Date(Math.floor(Date.now()/60000)*60000+n*60000).toISOString();
const clubPath=i=>'/api/clubs/'+clubs[i].id;
const budgetOf=async i=>BigInt((await one('SELECT budget_uzs FROM clubs WHERE id=$1',[clubs[i].id])).budget_uzs);
const ledgerRows=async(i,reason)=>(await db.query('SELECT amount_uzs,reference_id FROM money_ledger WHERE club_id=$1 AND reason=$2',[clubs[i].id,reason])).rows;
// Every club's budget must equal the sum of its ledger, and the last ledger balance must equal the budget.
async function assertLedgersConsistent(){
 const rows=(await db.query('SELECT c.id,c.budget_uzs,(SELECT COALESCE(SUM(amount_uzs),0) FROM money_ledger m WHERE m.club_id=c.id) AS total FROM clubs c')).rows;
 for(const r of rows)assert.equal(r.total,r.budget_uzs,'ledger sum equals budget for club '+r.id);
}
async function assertLineupValid(i){
 const players=(await db.query('SELECT id,position,overall FROM players WHERE club_id=$1',[clubs[i].id])).rows;
 const lineup=await one('SELECT starters,substitutes FROM lineups WHERE club_id=$1',[clubs[i].id]);
 assert.ok(isValidLineup(lineup.starters,players),'club '+i+' has a valid XI');
 assert.ok(lineup.substitutes.every(id=>players.some(p=>p.id===id)&&!lineup.starters.includes(id)));
 return {players,lineup};
}

test('complete game loop against isolated local PostgreSQL',{skip:DB_URL?false:'INTEGRATION_DATABASE_URL is not set'},async t=>{
 assertLocalDatabase();
 db=new pg.Pool({connectionString:DB_URL,max:2});
 t.after(async()=>{
  server?.child.kill();server2?.child.kill();
  await db.end();
  for(const url of uploaded)await fs.rm(path.join(serverRoot,url.slice(1)),{force:true});
 });

 await t.test('migrations and seed run on a clean database and are repeatable',async()=>{
  await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  const first=await run('src/migrate.js');
  assert.match(first,/Applied migration 001_initial/);assert.match(first,/Applied migration 002_development_ledger/);
  const second=await run('src/migrate.js');
  assert.match(second,/Skipped migration 001_initial/);assert.match(second,/Skipped migration 002_development_ledger/);
  await run('src/seed.js');await run('src/seed.js');
  assert.match(first,/Applied migration 003_league_schedule/);assert.match(first,/Applied migration 004_economy/);assert.match(first,/Applied migration 005_price_rebalance/);assert.match(first,/Applied migration 006_rating_profiles/);assert.match(second,/Skipped migration 004_economy/);assert.match(second,/Skipped migration 005_price_rebalance/);assert.match(second,/Skipped migration 006_rating_profiles/);
  const counts=(await db.query("SELECT (SELECT COUNT(*)::int FROM players WHERE origin='market') AS market,(SELECT COUNT(*)::int FROM players WHERE origin='generated') AS generated,(SELECT COUNT(*)::int FROM players WHERE origin='academy') AS academy,(SELECT COUNT(DISTINCT catalog_key)::int FROM players) AS keys,(SELECT COUNT(*)::int FROM missions) AS missions")).rows[0];
  assert.deepEqual(counts,{market:360,generated:12,academy:0,keys:360,missions:5},'seeding twice creates nothing twice');
  // The migration's SQL price formula and the server's JavaScript formula agree for every rating.
  const sqlPrices=(await db.query("SELECT o::int AS overall,(ROUND(11000000*POWER(1.112::numeric,o-80)/10000)*10000)::bigint AS price FROM generate_series(1,100) o")).rows;
  for(const r of sqlPrices)assert.equal(Number(r.price),marketValueUzs(r.overall),'overall '+r.overall);
  assert.equal((await db.query("SELECT 1 FROM players WHERE market_value_uzs<>(ROUND(11000000*POWER(1.112::numeric,overall-80)/10000)*10000)::bigint")).rowCount,0);
 });

 await t.test('database isolation guard refuses a differently named database',async()=>{
  await assert.rejects(()=>run('src/migrate.js',childEnv({EXPECTED_DATABASE_NAME:'some_other_database'})),/Refusing database connection/);
 });

 await t.test('server starts, is ready and serves the game client',async()=>{
  server=await startServer(childEnv({SUPER_ADMIN_TELEGRAM_ID:'dev-1'}));logs.push(server.log);
  assert.equal((await call(null,'GET','/health')).status,200);
  const ready=await call(null,'GET','/ready');assert.equal(ready.status,200);assert.equal(ready.data.seeded,true);
  for(const [route,type] of [['/','text/html'],['/index.html','text/html'],['/app.js','text/javascript'],['/styles.css','text/css'],['/config.js','text/javascript']]){
   const res=await fetch(BASE+route);assert.equal(res.status,200,route);assert.ok(res.headers.get('content-type').startsWith(type),route);
   assert.ok((await res.text()).length>50,route);
  }
 });

 await t.test('frame headers allow Telegram embedding and do not conflict',async()=>{
  const res=await fetch(BASE+'/');
  assert.equal(res.headers.get('x-frame-options'),null);
  assert.match(res.headers.get('content-security-policy'),/frame-ancestors https:\/\/web\.telegram\.org https:\/\/\*\.telegram\.org https:\/\/t\.me/);
 });

 await t.test('API requires authentication',async()=>{
  assert.equal((await call(null,'GET','/api/clubs')).status,401);
  assert.equal((await call(null,'GET','/api/market')).status,401);
  assert.equal((await call({token:'not.a-valid-token'},'GET','/api/clubs')).status,401);
 });

 await t.test('dev authentication is rejected outside NODE_ENV=development',async()=>{
  const prod=await startServer(childEnv({NODE_ENV:'production',PORT:String(PORT+1)}));
  try{assert.equal((await call({dev:1},'GET','/api/clubs',undefined,prod.base)).status,401);}
  finally{prod.child.kill();}
 });

 await t.test('locally signed mock Telegram initData issues a working session token',async()=>{
  const login=await call(null,'POST','/api/auth/telegram',{initData:signedInitData(987654321)});
  assert.equal(login.status,200);assert.ok(login.data.token);
  const mine=await call({token:login.data.token},'GET','/api/clubs');
  assert.equal(mine.status,200);assert.deepEqual(mine.data.clubs,[]);
  const tampered=await call(null,'POST','/api/auth/telegram',{initData:signedInitData(987654321).replace('Integration','Tampered')});
  assert.equal(tampered.status,401);
 });

 await t.test('crest upload and club creation assign a starter squad and lineup',async()=>{
  const png=Buffer.alloc(32);Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]).copy(png);
  const up=await ok(users[0],'POST','/api/uploads/crest',{dataUrl:'data:image/png;base64,'+png.toString('base64')});
  uploaded.push(up.crestUrl);
  assert.equal((await call(users[0],'POST','/api/uploads/crest',{dataUrl:'data:image/svg+xml;base64,PHN2Zz4='})).status,400);
  assert.equal((await call(users[0],'POST','/api/clubs',{name:'Bad Colour',shortName:'BAD',primaryColour:'red',secondaryColour:'#FFFFFF'})).status,400);
  assert.equal((await call(users[0],'POST','/api/clubs',{name:'Bad Short',shortName:'TOO-LONG',primaryColour:'#111111',secondaryColour:'#FFFFFF'})).status,400);
  assert.equal((await call(users[0],'POST','/api/clubs',{name:'Bad Crest',shortName:'BCR',crestUrl:'https://example.com/x.png'})).status,400);
  const created=await ok(users[0],'POST','/api/clubs',{name:'Integration One',shortName:'INT1',primaryColour:'#167a55',secondaryColour:'#f0c75e',crestUrl:up.crestUrl});
  clubs[0]=created.club;
  assert.equal(created.club.crest_url,up.crestUrl);assert.equal(created.club.budget_uzs,'20000000');assert.equal(created.club.development_points,0);
  const crest=await fetch(BASE+up.crestUrl);assert.equal(crest.status,200);assert.equal(crest.headers.get('content-type'),'image/png');
  const squad=(await ok(users[0],'GET','/api/clubs/'+clubs[0].id+'/squad')).players;
  assert.equal(squad.length,18);
  // Player classification and the approved distribution: every starter-squad player is an academy product.
  const key=p=>p.position+':'+p.overall;
  assert.deepEqual(squad.map(key).sort(),academySquadTemplate.map(([position,overall])=>position+':'+overall).sort());
  for(const p of squad){
   assert.equal(p.origin,'academy');assert.equal(p.first_sale_done,false);assert.equal(p.catalog_key,null);
   assert.equal(Number(p.market_value_uzs),marketValueUzs(p.overall));assert.equal(p.quality,qualityForOverall(p.overall));
   assert.equal(Object.values(p.attributes).reduce((a,b)=>a+b,0),p.overall*6,'attributes average exactly to overall');
  }
  assert.equal(squad.reduce((n,p)=>n+Number(p.market_value_uzs),0),10520000);
  const lineup=(await ok(users[0],'GET','/api/clubs/'+clubs[0].id+'/lineup')).lineup;
  assert.equal(lineup.formation,'4-3-3');assert.equal(lineup.starters.length,11);assert.equal(lineup.substitutes.length,7);
  assert.ok(squad.some(p=>p.position==='GK'&&lineup.starters.includes(p.id)));
  const ledger=(await ok(users[0],'GET','/api/clubs/'+clubs[0].id+'/ledger')).transactions;
  assert.equal(ledger.length,1);assert.equal(ledger[0].reason,'club_created');assert.equal(ledger[0].amount_uzs,'20000000');assert.equal(ledger[0].balance_after_uzs,'20000000');
  const starters=squad.filter(p=>lineup.starters.includes(p.id)).map(p=>p.overall).sort((a,b)=>b-a);
  assert.deepEqual(starters,[58,56,56,54,54,54,54,52,52,52,52],'the XI holds the eleven strongest players');
  // One club per user.
  const second=await call(users[0],'POST','/api/clubs',{name:'Second Club',shortName:'SEC',primaryColour:'#111111',secondaryColour:'#ffffff'});
  assert.equal(second.status,409);assert.match(second.data.error,/already manage a club/);
  assert.equal(Number((await one('SELECT COUNT(*)::int AS n FROM players WHERE club_id IS NOT NULL')).n),18,'the refused request created no players');
  assert.equal((await ok(users[0],'GET','/api/clubs/'+clubs[0].id+'/missions')).missions.length,5);
  assert.equal((await ok(users[0],'GET','/api/clubs')).clubs.length,1);
 });

 await t.test('ownership checks hide another user\'s club',async()=>{
  assert.equal((await call(users[1],'GET','/api/clubs/'+clubs[0].id)).status,404);
  assert.equal((await call(users[1],'GET','/api/clubs/'+clubs[0].id+'/squad')).status,404);
  assert.equal((await call(users[1],'POST','/api/clubs/'+clubs[0].id+'/identity',{name:'Stolen',shortName:'STL',primaryColour:'#000000',secondaryColour:'#FFFFFF'})).status,404);
  assert.equal((await call(users[0],'GET','/api/clubs/not-a-uuid')).status,400);
 });

 await t.test('identity can be edited and keeps the crest when omitted',async()=>{
  const r=await ok(users[0],'POST','/api/clubs/'+clubs[0].id+'/identity',{name:'Integration Prime',shortName:'intp',primaryColour:'#112233',secondaryColour:'#aabbcc'});
  assert.equal(r.club.name,'Integration Prime');assert.equal(r.club.short_name,'INTP');assert.equal(r.club.primary_colour,'#112233');
  assert.equal(r.club.crest_url,clubs[0].crest_url);
 });

 await t.test('lineup validation and saving',async()=>{
  const id=clubs[0].id,squad=(await ok(users[0],'GET','/api/clubs/'+id+'/squad')).players;
  const lineup=(await ok(users[0],'GET','/api/clubs/'+id+'/lineup')).lineup;
  const route='/api/clubs/'+id+'/lineup';
  assert.equal((await call(users[0],'POST',route,{formation:'4-3-3',starters:lineup.starters.slice(0,10)})).status,400);
  assert.equal((await call(users[0],'POST',route,{formation:'9-9-9',starters:lineup.starters})).status,400);
  const outfield=squad.filter(p=>p.position!=='GK').slice(0,11).map(p=>p.id);
  assert.equal((await call(users[0],'POST',route,{formation:'4-3-3',starters:outfield})).status,400);
  const foreign=(await ok(users[0],'GET','/api/market')).players[0].id;
  assert.equal((await call(users[0],'POST',route,{formation:'4-3-3',starters:lineup.starters.slice(0,10).concat(foreign)})).status,400);
  // Position mapping: an eleven with six attackers cannot play 5-4-1 (one striker's place), and the saved lineup is left alone.
  const pick=(position,n)=>squad.filter(p=>p.position===position).slice(0,n).map(p=>p.id);
  const attacking=[...pick('GK',1),...pick('CB',3),...pick('CM',1),...pick('AM',1),...pick('LW',1),...pick('RW',1),...pick('ST',3)];assert.equal(attacking.length,11);
  const wrongShape=await call(users[0],'POST',route,{formation:'5-4-1',starters:attacking});
  assert.equal(wrongShape.status,400);assert.match(wrongShape.data.error,/5-4-1 cannot be filled.*ST.*out of position/);
  assert.deepEqual((await ok(users[0],'GET',route)).lineup,lineup);
  // The very same eleven is a legitimate, if poorly suited, 4-3-3: wingers cover at full-back, strikers on the wings.
  const asFront=await ok(users[0],'POST',route,{formation:'4-3-3',starters:attacking});
  assert.equal(asFront.analysis.valid,true);assert.ok(asFront.analysis.cover>=5);assert.ok(asFront.analysis.fitBonus<1&&asFront.analysis.fitBonus>=-4);
  await ok(users[0],'POST',route,{formation:'4-4-2',starters:lineup.starters,substitutes:lineup.substitutes});
  assert.equal((await ok(users[0],'GET',route)).lineup.formation,'4-4-2');
  await ok(users[0],'POST',route,{formation:'4-3-3',starters:lineup.starters,substitutes:lineup.substitutes});
 });

 await t.test('all 12 formations: the server validates every lineup itself and a refused request changes nothing',async()=>{
  const id=clubs[0].id,route='/api/clubs/'+id+'/lineup',squad=(await ok(users[0],'GET','/api/clubs/'+id+'/squad')).players,byId=new Map(squad.map(p=>[p.id,p]));
  const original=(await ok(users[0],'GET',route)).lineup;
  const stored=async()=>JSON.stringify(await one('SELECT formation,starters,substitutes,updated_at FROM lineups WHERE club_id=$1',[id]));
  const info=await ok(users[0],'GET','/api/clubs/'+id+'/formations');
  assert.deepEqual(info.formations.map(f=>f.id),FORMATION_IDS);assert.equal(info.formations.length,12);
  assert.equal(info.current.formation,'4-3-3');assert.equal(info.current.valid,true);assert.equal(info.current.fit,11);assert.equal(info.current.fitBonus,4);
  assert.equal(info.current.strength,squadStrength(original.starters.map(x=>byId.get(x)),'4-3-3'));
  assert.equal((await call(users[1]||{dev:99},'GET','/api/clubs/'+id+'/formations')).status,404,'another user cannot read this club');
  // Every formation: the suggested XI is accepted, stored and read back, and the report is computed by the server.
  for(const f of info.formations){
   assert.equal(f.slots.length,11);assert.equal(f.best.valid,true,f.id);assert.equal(new Set(f.best.starters).size,11);
   const saved=await ok(users[0],'POST',route,{formation:f.id,starters:f.best.starters,substitutes:f.best.substitutes,fitBonus:99,strength:999,analysis:{valid:true,fit:11},slots:[]});
   const xi=f.best.starters.map(x=>byId.get(x)),expected=analyseLineup(xi,f.id);
   assert.equal(saved.analysis.fit,expected.fit,f.id);assert.equal(saved.analysis.fitBonus,Number(expected.fitBonus.toFixed(2)));assert.ok(saved.analysis.fitBonus<=4);
   assert.equal(saved.analysis.strength,Number(squadStrength(xi,f.id).toFixed(1)),f.id+' strength is the server\'s own');
   assert.equal(f.best.strength,saved.analysis.strength);
   assert.equal(new Set(saved.analysis.slots.map(x=>x.playerId)).size,11,f.id+' no player in two slots');
   const read=(await ok(users[0],'GET',route)).lineup;
   assert.equal(read.formation,f.id);assert.deepEqual(read.starters,f.best.starters);assert.deepEqual(read.substitutes,f.best.substitutes);
   assert.equal((await ok(users[0],'GET','/api/clubs/'+id+'/formations')).current.formation,f.id);
   await assertLineupValid(0);
  }
  assert.equal(Number((await one('SELECT COUNT(*)::int AS n FROM players WHERE club_id=$1',[id])).n),18,'changing formation never adds or drops a player');
  await ok(users[0],'POST',route,{formation:'4-3-3',starters:original.starters,substitutes:original.substitutes});
  // Direct requests that try to get around the rules. None may change the stored lineup.
  const before=await stored(),xi=original.starters,subs=original.substitutes;
  const keeper=xi.find(x=>byId.get(x).position==='GK'),spareKeeper=squad.find(p=>p.position==='GK'&&p.id!==keeper).id,outfield=xi.filter(x=>x!==keeper);
  const otherClub=(await db.query('SELECT id FROM players WHERE club_id IS NOT NULL AND club_id<>$1 LIMIT 1',[id])).rows[0]?.id;
  const freeAgent=(await ok(users[0],'GET','/api/market')).players[0].id;
  const pick=(position,n)=>squad.filter(p=>p.position===position).slice(0,n).map(p=>p.id);
  const attacking=[...pick('GK',1),...pick('CB',3),...pick('CM',1),...pick('AM',1),...pick('LW',1),...pick('RW',1),...pick('ST',3)];
  const attempts={
   'unknown formation':{formation:'4-5-1',starters:xi},'formation with spaces':{formation:' 4-3-3',starters:xi},'formation as array':{formation:['4-3-3'],starters:xi},
   'formation as object':{formation:{id:'4-3-3'},starters:xi},'prototype key':{formation:'constructor',starters:xi},'missing formation':{starters:xi},'SQL in formation':{formation:"4-3-3'--",starters:xi},
   'ten starters':{formation:'4-3-3',starters:xi.slice(0,10)},'twelve starters':{formation:'4-3-3',starters:xi.concat(subs[0])},'starters not an array':{formation:'4-3-3',starters:{length:11}},
   'duplicate starter':{formation:'4-3-3',starters:xi.slice(0,10).concat(xi[0])},'duplicate in another letter case':{formation:'4-3-3',starters:xi.slice(0,10).concat(xi[0].toUpperCase())},
   'not a UUID':{formation:'4-3-3',starters:xi.slice(0,10).concat('1')},'free agent':{formation:'4-3-3',starters:xi.slice(0,10).concat(freeAgent)},
   'no goalkeeper':{formation:'4-3-3',starters:outfield.concat(subs.find(x=>byId.get(x).position!=='GK'))},'two goalkeepers':{formation:'4-3-3',starters:xi.slice(0,10).concat(spareKeeper)},
   'six attackers in a back five':{formation:'5-4-1',starters:attacking},'six attackers in 4-1-4-1':{formation:'4-1-4-1',starters:attacking},
   'starter repeated on the bench':{formation:'4-3-3',starters:xi,substitutes:[xi[3]]},'duplicate substitute':{formation:'4-3-3',starters:xi,substitutes:[subs[0],subs[0]]},
   'eight substitutes':{formation:'4-3-3',starters:xi,substitutes:subs.concat(subs[0])},'foreign substitute':{formation:'4-3-3',starters:xi,substitutes:[freeAgent]}
  };
  if(otherClub)attempts['player of another club']={formation:'4-3-3',starters:xi.slice(0,10).concat(otherClub)};
  for(const [label,body] of Object.entries(attempts)){
   const r=await call(users[0],'POST',route,{...body,fitBonus:4,valid:true});
   assert.equal(r.status,400,label+' -> '+r.status+' '+JSON.stringify(r.data));
   assert.equal(await stored(),before,label+' left the stored lineup untouched');
  }
  assert.match(lineupProblem('5-4-1',attacking,squad),/cannot be filled/);assert.match(lineupProblem('4-1-4-1',attacking,squad),/cannot be filled/);
  assert.equal((await call(users[1]||{dev:99},'POST',route,{formation:'4-3-3',starters:xi})).status,404,'another user cannot save this lineup');
  assert.equal(await stored(),before);
  // Backward compatibility: a lineup stored before roles were validated (the old rules took any eleven with a goalkeeper).
  // The club must be able to save it again unchanged and to improve it, but not to make it worse.
  await db.query("UPDATE lineups SET formation='4-1-4-1',starters=$2 WHERE club_id=$1",[id,attacking]);
  const legacy={formation:'4-1-4-1',starters:attacking},team=ids=>ids.map(x=>byId.get(x)),wrongBefore=analyseLineup(team(attacking),'4-1-4-1');
  assert.equal(wrongBefore.valid,false);
  const legacyInfo=await ok(users[0],'GET','/api/clubs/'+id+'/formations');
  assert.equal(legacyInfo.current.valid,false);assert.equal(legacyInfo.current.outOfPosition,wrongBefore.outOfPosition);
  assert.equal((await call(users[0],'POST',route,legacy)).status,200,'the legacy lineup can be saved again unchanged');
  assert.equal((await call(users[0],'POST',route,{formation:'4-1-4-1',starters:attacking.slice().reverse()})).status,200,'in any order');
  assert.equal((await call(users[0],'POST',route,{formation:'5-4-1',starters:attacking})).status,400,'the allowance does not carry to another formation');
  // Improving it: the first XI with a spare striker for a centre-back has fewer players out of position, though still not none.
  const firstCb=xi.find(x=>byId.get(x).position==='CB'),spareStriker=squad.find(p=>p.position==='ST'&&!xi.includes(p.id)).id,mild=xi.map(x=>x===firstCb?spareStriker:x);
  const mildWrong=analyseLineup(team(mild),'4-1-4-1').outOfPosition;
  assert.ok(mildWrong>0&&mildWrong<wrongBefore.outOfPosition);
  assert.match(lineupProblem('4-1-4-1',mild,squad),/cannot be filled/,'not acceptable for a club without the legacy lineup');
  assert.equal(lineupProblem('4-1-4-1',mild,squad,legacy),null);
  assert.equal((await call(users[0],'POST',route,{formation:'4-1-4-1',starters:mild})).status,200,'the legacy lineup can be improved step by step');
  // Making it worse again is refused, and the stored lineup stays as it was.
  const kept=await stored(),refused=await call(users[0],'POST',route,legacy);
  assert.equal(refused.status,400);assert.match(refused.data.error,/cannot be filled/);assert.equal(await stored(),kept);
  await ok(users[0],'POST',route,{formation:'4-3-3',starters:original.starters,substitutes:original.substitutes});
  const restored=(await ok(users[0],'GET',route)).lineup;assert.equal(restored.formation,original.formation);assert.deepEqual(restored.starters,original.starters);assert.deepEqual(restored.substitutes,original.substitutes);
 });

 await t.test('transfer market: rebalanced price curve, classification, 80-rated signing affordability, youth supply',async()=>{
  const market=await ok(users[0],'GET','/api/market');
  assert.deepEqual(market.squadLimits,{min:13,max:26});
  assert.ok(market.players.length>0&&market.players.length<=100);
  for(const p of market.players.concat(market.youth))assert.equal(Number(p.market_value_uzs),marketValueUzs(p.overall),'price follows the curve');
  assert.ok(market.players.every(p=>p.origin==='market'),'the top of the market is the seeded catalogue');
  // Generated youth: every slot is covered, all rated 45-50, none of them from the catalogue.
  const need={};for(const pos of youthSlots)need[pos]=(need[pos]||0)+1;
  for(const [pos,n] of Object.entries(need))assert.ok(market.youth.filter(p=>p.position===pos).length>=n,'youth stock for '+pos);
  assert.ok(market.youth.every(p=>p.origin==='generated'&&p.overall>=45&&p.overall<=50));
  assert.equal(Number((await one("SELECT COUNT(*)::int AS n FROM players WHERE origin='generated'")).n),12,'exactly the standing stock exists, no more');
  const capped=(await ok(users[0],'GET','/api/market?maxValue=3000000')).players;
  assert.ok(capped.length>0&&capped.every(p=>BigInt(p.market_value_uzs)<=3000000n));
  assert.equal((await call(users[0],'GET','/api/market?maxValue=abc')).status,400);
  // An 80-rated player costs 11,000,000 UZS: one fits the opening budget, two do not.
  const elite=(await one("INSERT INTO players(full_name,age,position,quality,overall,potential,attributes,market_value_uzs,origin) VALUES('Test Elite',27,'ST','elite',80,84,'{\"pace\":82,\"shooting\":88,\"passing\":76,\"dribbling\":81,\"defending\":70,\"physical\":83}',$1,'market') RETURNING id",[marketValueUzs(80)])).id;
  assert.equal(marketValueUzs(80),11000000);
  assert.ok(marketValueUzs(80)<=20000000);
  assert.ok(2*marketValueUzs(80)>20000000);
  assert.equal(await budgetOf(0),20000000n);
  // Buying a youth player goes through the normal signing rules and is replaced by exactly one new youth player.
  const youth=market.youth.find(p=>p.position==='CM');
  const signed=await ok(users[0],'POST',clubPath(0)+'/players/sign',{playerId:youth.id});
  assert.equal(signed.budgetUzs,(20000000n-BigInt(youth.market_value_uzs)).toString());
  const after=(await ok(users[0],'GET','/api/market')).youth;
  assert.ok(!after.some(p=>p.id===youth.id));assert.ok(after.filter(p=>p.position==='CM').length>=need.CM,'the slot is filled again');
  assert.equal(Number((await one("SELECT COUNT(*)::int AS n FROM players WHERE origin='generated'")).n),13);
  assert.equal(Number((await one("SELECT COUNT(*)::int AS n FROM players WHERE origin='generated' AND club_id IS NULL")).n),12);
  assert.equal((await call(users[0],'POST',clubPath(0)+'/players/sign',{playerId:youth.id})).status,404,'a signed player cannot be signed twice');
  clubs[0].youthId=youth.id;clubs[0].eliteId=elite;
 });

 await t.test('no league exists below 10 clubs',async()=>{
  for(let i=1;i<9;i++)clubs[i]=(await ok(users[i],'POST','/api/clubs',{name:'Integration Club '+(i+1),shortName:'IC'+(i+1),primaryColour:'#225588',secondaryColour:'#ffffff'})).club;
  assert.deepEqual(await ok(users[0],'GET',clubPath(0)+'/league'),{leagueExists:false,table:[],season:null,previous:null});
  assert.deepEqual((await ok(users[0],'GET',clubPath(0)+'/fixtures')).fixtures,[]);
  assert.deepEqual((await ok(users[0],'GET',clubPath(0)+'/results')).results,[]);
  assert.deepEqual(await ok(users[0],'POST',clubPath(0)+'/leagues/ensure',{}),{leagueId:null,created:false});
 });

 await t.test('peer-to-peer transfer market: list, browse, purchase atomically and preserve club lineups/ledgers',async()=>{
  const sellerId=clubs[0].id,buyerId=clubs[1].id,sellerRoute=clubPath(0)+'/transfers',buyerRoute=clubPath(1)+'/transfers';
  const sellerSquad=(await ok(users[0],'GET',clubPath(0)+'/squad')).players;
  const player=sellerSquad.find(p=>p.position!=='GK');
  assert.ok(player,'seller has an outfield player to list');
  // Snapshot seeded clubs because this integration scenario must not affect later baseline tests.
  const sellerLineupBefore=await one('SELECT formation,starters,substitutes FROM lineups WHERE club_id=$1',[sellerId]);
  const buyerLineupBefore=await one('SELECT formation,starters,substitutes FROM lineups WHERE club_id=$1',[buyerId]);
  const playerBefore=await one('SELECT club_id,first_sale_done FROM players WHERE id=$1',[player.id]);
  const price='1000000',sellerBefore=await budgetOf(0),buyerBefore=await budgetOf(1);
  const created=await ok(users[0],'POST',sellerRoute,{playerId:player.id,askingPriceUzs:price});
  assert.equal(created.listing.status,'listed');assert.equal(created.listing.asking_price_uzs,price);
  assert.equal((await call(users[0],'POST',sellerRoute,{playerId:player.id,askingPriceUzs:'2000000'})).status,409,'same player cannot be listed twice');
  assert.equal((await call(users[0],'POST',clubPath(0)+'/players/sell',{playerId:player.id})).status,409,'listed player cannot be sold to free-agent market');
  const market=(await ok(users[1],'GET','/api/transfers?limit=100')).listings;
  const visible=market.find(l=>l.listing_id===created.listing.id);
  assert.ok(visible,'other club can browse the listing');
  assert.equal(visible.seller_club_id,sellerId);assert.equal(visible.seller_club_short_name,(await one('SELECT short_name FROM clubs WHERE id=$1',[sellerId])).short_name);
  assert.equal((await call(users[2],'GET',sellerRoute)).status,404,'another manager cannot inspect seller-owned listings');
  const bought=await ok(users[1],'POST',buyerRoute+'/'+created.listing.id+'/buy',{});
  assert.equal(bought.priceUzs,price);assert.equal(bought.buyerBalanceUzs,(buyerBefore-BigInt(price)).toString());assert.equal(bought.sellerBalanceUzs,(sellerBefore+BigInt(price)).toString());
  assert.equal((await call(users[1],'POST',buyerRoute+'/'+created.listing.id+'/buy',{})).status,409,'duplicate purchase is refused');
  assert.deepEqual(await one('SELECT club_id,first_sale_done FROM players WHERE id=$1',[player.id]),{club_id:buyerId,first_sale_done:true},'ownership and resale history changed to buyer');
  assert.equal((await one("SELECT status,buyer_club_id FROM player_transfer_listings WHERE id=$1",[created.listing.id])).status,'sold');
  assert.equal(Number((await one('SELECT COUNT(*)::int AS n FROM player_transfer_history WHERE listing_id=$1',[created.listing.id])).n),1,'transfer history is exactly once');
  assert.equal((await ok(users[0],'GET',sellerRoute)).listings.find(l=>l.listing_id===created.listing.id).status,'sold');
  assert.equal((await call(users[0],'POST',sellerRoute+'/'+created.listing.id+'/cancel',{})).status,404,'sold listing cannot be cancelled');
  assert.equal((await ok(users[0],'GET','/api/transfers?limit=100')).listings.some(l=>l.listing_id===created.listing.id),false,'sold listing is removed from public market');
  assert.equal((await ok(users[0],'GET',clubPath(0)+'/squad')).players.length,sellerSquad.length-1);
  assert.equal((await ok(users[1],'GET',clubPath(1)+'/squad')).players.length,19);
  await assertLineupValid(0);await assertLineupValid(1);
  // Restore fixture data after asserting the completed transaction, keeping unrelated integration tests independent.
  await db.query('UPDATE players SET club_id=$2,first_sale_done=$3 WHERE id=$1',[player.id,playerBefore.club_id,playerBefore.first_sale_done]);
  await db.query('UPDATE clubs SET budget_uzs=$2 WHERE id=$1',[sellerId,sellerBefore.toString()]);
  await db.query('UPDATE clubs SET budget_uzs=$2 WHERE id=$1',[buyerId,buyerBefore.toString()]);
  await db.query('UPDATE lineups SET formation=$2,starters=$3,substitutes=$4 WHERE club_id=$1',[sellerId,sellerLineupBefore.formation,sellerLineupBefore.starters,sellerLineupBefore.substitutes]);
  await db.query('UPDATE lineups SET formation=$2,starters=$3,substitutes=$4 WHERE club_id=$1',[buyerId,buyerLineupBefore.formation,buyerLineupBefore.starters,buyerLineupBefore.substitutes]);
  await db.query("DELETE FROM money_ledger WHERE reference_id=$1 AND reason IN ('player_transfer_purchase','player_transfer_sale')",[player.id]);
  await db.query('DELETE FROM player_transfer_history WHERE listing_id=$1',[created.listing.id]);
  await db.query('DELETE FROM player_transfer_listings WHERE id=$1',[created.listing.id]);
  await assertLedgersConsistent();
 });
 
 await t.test('friendly challenges: validation, one-minute slots, accept, decline and cancel',async()=>{
  leagueSlot=iso((await one("SELECT (((NOW() AT TIME ZONE 'Asia/Tashkent')::date+1)+time '20:00') AT TIME ZONE 'Asia/Tashkent' AS k")).k);
  const post=(i,body)=>call(users[i],'POST',clubPath(i)+'/friendlies',body);
  const act=(i,id,verb)=>call(users[i],'POST',clubPath(i)+'/friendlies/'+id+'/'+verb,{});
  const opponents=(await ok(users[0],'GET',clubPath(0)+'/opponents')).clubs;
  assert.ok(opponents.some(c=>c.id===clubs[1].id));assert.ok(!opponents.some(c=>c.id===clubs[0].id));
  assert.equal((await post(0,{opponentClubId:clubs[0].id,kickoffAt:inMinutes(60)})).status,400,'own club');
  assert.equal((await post(0,{opponentClubId:crypto.randomUUID(),kickoffAt:inMinutes(60)})).status,404);
  assert.equal((await post(0,{opponentClubId:clubs[1].id,kickoffAt:'tomorrow'})).status,400);
  assert.equal((await post(0,{opponentClubId:clubs[1].id,kickoffAt:inMinutes(-5)})).status,400,'past');
  assert.equal((await post(0,{opponentClubId:clubs[1].id,kickoffAt:inMinutes(1)})).status,400,'too soon');
  assert.equal((await post(0,{opponentClubId:clubs[1].id,kickoffAt:inMinutes(60*24*31)})).status,400,'too far');
  assert.equal((await call(users[1],'POST',clubPath(0)+'/friendlies',{opponentClubId:clubs[2].id,kickoffAt:inMinutes(60)})).status,404,'not the owner');
  // Request A sits exactly on tomorrow's 20:00 Tashkent slot; the league does not exist yet, so it is allowed.
  const a=await post(0,{opponentClubId:clubs[1].id,kickoffAt:leagueSlot});
  assert.equal(a.status,201);assert.equal(a.data.request.status,'pending');assert.equal(iso(a.data.request.proposed_kickoff_at),leagueSlot);
  assert.equal((await post(0,{opponentClubId:clubs[1].id,kickoffAt:leagueSlot})).status,409,'duplicate');
  assert.equal(Number((await one("SELECT COUNT(*)::int AS n FROM fixtures")).n),0,'a request alone creates no fixture');
  const incoming=(await ok(users[1],'GET',clubPath(1)+'/friendlies')).requests;
  assert.equal(incoming.length,1);assert.equal(incoming[0].direction,'incoming');assert.equal(incoming[0].from_club_id,clubs[0].id);assert.ok(incoming[0].from_name&&incoming[0].to_name);
  assert.equal((await act(0,a.data.request.id,'accept')).status,404,'the sender cannot accept');
  assert.equal((await act(2,a.data.request.id,'accept')).status,404,'a third club cannot accept');
  const accepted=await act(1,a.data.request.id,'accept');
  assert.equal(accepted.status,200);assert.equal(accepted.data.fixture.kind,'friendly');assert.equal(accepted.data.fixture.home_club_id,clubs[0].id);
  assert.equal((await act(1,a.data.request.id,'accept')).status,409);
  // Club 1 is now busy for [slot, slot+60s): the same minute is refused, the next minute is free.
  const half=new Date(Date.parse(leagueSlot)+30000).toISOString(),next=new Date(Date.parse(leagueSlot)+60000).toISOString(),before=new Date(Date.parse(leagueSlot)-60000).toISOString();
  assert.equal((await post(2,{opponentClubId:clubs[1].id,kickoffAt:leagueSlot})).status,409);
  assert.equal((await post(2,{opponentClubId:clubs[1].id,kickoffAt:half})).status,409,'30 seconds later overlaps');
  assert.equal((await post(2,{opponentClubId:clubs[0].id,kickoffAt:leagueSlot})).status,409,'the home club is busy too');
  assert.equal((await post(3,{opponentClubId:clubs[2].id,kickoffAt:leagueSlot})).status,201,'two other clubs can use the same slot');
  const adjacent=await post(2,{opponentClubId:clubs[1].id,kickoffAt:next});
  assert.equal(adjacent.status,201,'the minute after is free');
  assert.equal((await post(2,{opponentClubId:clubs[1].id,kickoffAt:before})).status,201,'the minute before is free');
  assert.equal((await act(1,adjacent.data.request.id,'decline')).data.request.status,'declined');
  assert.equal((await act(1,adjacent.data.request.id,'accept')).status,409);
  const c=await post(0,{opponentClubId:clubs[4].id,kickoffAt:inMinutes(90)});
  assert.equal((await act(4,c.data.request.id,'cancel')).status,404,'only the sender can cancel');
  assert.equal((await act(0,c.data.request.id,'cancel')).data.request.status,'cancelled');
  // Two pending requests for one slot: only the first acceptance creates a fixture.
  const p1=await post(5,{opponentClubId:clubs[6].id,kickoffAt:inMinutes(120)}),p2=await post(7,{opponentClubId:clubs[6].id,kickoffAt:inMinutes(120)});
  assert.equal(p1.status,201);assert.equal(p2.status,201);
  const [r1,r2]=await Promise.all([act(6,p1.data.request.id,'accept'),act(6,p2.data.request.id,'accept')]);
  assert.deepEqual([r1.status,r2.status].sort(),[200,409]);
  // Friendly B (club 0 at home to club 2) is settled later in this test.
  const b=await post(0,{opponentClubId:clubs[2].id,kickoffAt:inMinutes(60)});
  friendlyB=(await act(2,b.data.request.id,'accept')).data.fixture;
  const mine=(await ok(users[0],'GET',clubPath(0)+'/fixtures')).fixtures;
  assert.equal(mine.length,2);assert.ok(mine.every(f=>f.kind==='friendly'&&f.phase==='upcoming'&&f.round_number===null));
  assert.equal(Number((await one("SELECT COUNT(*)::int AS n FROM fixtures WHERE kind='friendly'")).n),3);
 });

 await t.test('the 10th club creates an 18-round, 19-day league with 20:00 Asia/Tashkent kick-offs',async()=>{
  clubs[9]=(await ok(users[9],'POST','/api/clubs',{name:'Integration Club 10',shortName:'IC10',primaryColour:'#225588',secondaryColour:'#ffffff'})).club;
  const table=(await ok(users[0],'GET',clubPath(0)+'/league')).table;
  assert.equal(table.length,10);assert.ok(table.every(r=>r.played===0&&r.points===0));
  const league=await one("SELECT id,status,starts_on::text AS starts_on,((NOW() AT TIME ZONE 'Asia/Tashkent')::date+1)::text AS tomorrow FROM leagues");
  assert.equal(league.status,'active');assert.equal(league.starts_on,league.tomorrow,'day 1 is the next Tashkent calendar day');
  const rows=(await db.query("SELECT round_number,day_number,home_club_id,away_club_id,f.status,kickoff_at,to_char(kickoff_at AT TIME ZONE 'Asia/Tashkent','YYYY-MM-DD HH24:MI:SS') AS local,to_char(kickoff_at AT TIME ZONE 'UTC','HH24:MI:SS') AS utc,(l.starts_on+(day_number-1))::text AS expected_date FROM fixtures f JOIN leagues l ON l.id=f.league_id WHERE kind='league' ORDER BY round_number")).rows;
  assert.equal(rows.length,90);
  for(const f of rows){
   assert.equal(f.local,f.expected_date+' 20:00:00');assert.equal(f.utc,'15:00:00');assert.equal(f.status,'scheduled');
   assert.equal(f.day_number,f.round_number<=9?f.round_number:f.round_number+1);
  }
  assert.deepEqual([...new Set(rows.map(f=>f.day_number))],[1,2,3,4,5,6,7,8,9,11,12,13,14,15,16,17,18,19]);
  assert.equal(new Set(rows.map(f=>iso(f.kickoff_at))).size,18,'all five fixtures of a matchday share one kick-off');
  for(const day of new Set(rows.map(f=>f.day_number))){
   const today=rows.filter(f=>f.day_number===day),playing=today.flatMap(f=>[f.home_club_id,f.away_club_id]);
   assert.equal(today.length,5);assert.equal(new Set(playing).size,10,'every club plays exactly once on matchday '+day);
  }
  const ordered=new Map();for(const f of rows)ordered.set(f.home_club_id+'>'+f.away_club_id,(ordered.get(f.home_club_id+'>'+f.away_club_id)||0)+1);
  assert.equal(ordered.size,90,'every ordered home/away pairing appears exactly once');
  for(let i=0;i<10;i++){
   const mine=rows.filter(f=>f.home_club_id===clubs[i].id||f.away_club_id===clubs[i].id);
   assert.equal(mine.length,18);assert.equal(mine.filter(f=>f.home_club_id===clubs[i].id).length,9);
  }
  const span=await one("SELECT (MAX(kickoff_at)-MIN(kickoff_at)) = interval '18 days' AS ok FROM fixtures WHERE kind='league'");
  assert.equal(span.ok,true,'first to last kick-off spans 19 calendar days');
  const api=(await ok(users[0],'GET',clubPath(0)+'/fixtures'));
  assert.equal(api.timezone,'Asia/Tashkent');assert.equal(api.matchDurationSeconds,60);
  assert.equal(api.fixtures.filter(f=>f.kind==='league').length,18);assert.ok(api.fixtures.every(f=>f.events===undefined));
 });

 await t.test('league creation cancels a friendly in a league slot; new friendlies must avoid league slots',async()=>{
  const cancelled=(await db.query("SELECT f.status,r.status AS request_status FROM fixtures f JOIN friendly_requests r ON r.fixture_id=f.id WHERE f.kind='friendly' AND f.kickoff_at=$1",[leagueSlot])).rows;
  assert.deepEqual(cancelled,[{status:'cancelled',request_status:'cancelled'}]);
  assert.equal((await one('SELECT status FROM fixtures WHERE id=$1',[friendlyB.id])).status,'scheduled');
  const post=(i,body)=>call(users[i],'POST',clubPath(i)+'/friendlies',body);
  assert.equal((await post(0,{opponentClubId:clubs[1].id,kickoffAt:leagueSlot})).status,409,'[20:00,20:01) is taken by the league match');
  const pendingInSlot=(await ok(users[2],'GET',clubPath(2)+'/friendlies')).requests.find(r=>r.status==='pending'&&r.direction==='incoming'&&iso(r.proposed_kickoff_at)===leagueSlot);
  assert.equal((await call(users[2],'POST',clubPath(2)+'/friendlies/'+pendingInSlot.id+'/accept',{})).status,409,'an older pending request cannot be accepted into a league slot');
  const after=await post(0,{opponentClubId:clubs[1].id,kickoffAt:new Date(Date.parse(leagueSlot)+60000).toISOString()});
  assert.equal(after.status,201,'20:01 is free again');
  // A club outside the league is not blocked by league slots.
  await ok(users[0],'POST',clubPath(0)+'/friendlies/'+after.data.request.id+'/cancel',{});
 });

 await t.test('later clubs wait outside the league; concurrent registration creates one club per user',async()=>{
  clubs[10]=(await ok(users[10],'POST','/api/clubs',{name:'Integration Club 11',shortName:'IC11',primaryColour:'#225588',secondaryColour:'#ffffff'})).club;
  assert.deepEqual((await ok(users[10],'GET',clubPath(10)+'/fixtures')).fixtures,[]);
  assert.deepEqual((await ok(users[10],'GET',clubPath(10)+'/results')),{results:[],unviewedCount:0,timezone:'Asia/Tashkent'});
  assert.equal(Number((await one('SELECT COUNT(*)::int AS n FROM leagues')).n),1);
  const body=n=>({name:'Integration Club '+n,shortName:'IC'+n,primaryColour:'#225588',secondaryColour:'#ffffff'});
  const race=await Promise.all([call(users[11],'POST','/api/clubs',body(12)),call(users[11],'POST','/api/clubs',body(12)),call(users[11],'POST','/api/clubs',body(12))]);
  assert.deepEqual(race.map(r=>r.status).sort(),[201,409,409],'exactly one of three simultaneous requests creates the club');
  clubs[11]=race.find(r=>r.status===201).data.club;
  assert.equal(Number((await one('SELECT COUNT(*)::int AS n FROM clubs WHERE owner_user_id=$1',[clubs[11].owner_user_id])).n),1);
  assert.equal(Number((await one('SELECT COUNT(*)::int AS n FROM players WHERE club_id=$1',[clubs[11].id])).n),18);
  assert.equal((await db.query('SELECT owner_user_id FROM clubs GROUP BY owner_user_id HAVING COUNT(*)>1')).rowCount,0);
  await assert.rejects(db.query('INSERT INTO clubs(owner_user_id,name,short_name) VALUES($1,$2,$3)',[clubs[11].owner_user_id,'Direct','DIR']),/clubs_one_per_owner/,'the database itself refuses a second club');
 });

 await t.test('resale rates, automatic lineup replacement, squad limits and a consistent ledger',async()=>{
  const id=clubs[0].id,sell=playerId=>call(users[0],'POST',clubPath(0)+'/players/sell',{playerId}),sign=playerId=>call(users[0],'POST',clubPath(0)+'/players/sign',{playerId});
  const squad=(await ok(users[0],'GET',clubPath(0)+'/squad')).players,lineup=(await ok(users[0],'GET',clubPath(0)+'/lineup')).lineup;
  assert.equal(squad.length,19);
  const bench=(pos,overall)=>squad.find(p=>!lineup.starters.includes(p.id)&&p.position===pos&&p.overall===overall&&p.origin==='academy');
  let budget=await budgetOf(0);
  // 1. Academy player, first sale: 50%.
  const cb=bench('CB',50),first=await sell(cb.id);
  assert.equal(first.status,200);assert.equal(first.data.resaleRatePercent,50);assert.equal(first.data.feeUzs,saleValueUzs(cb.market_value_uzs,50).toString());assert.equal(first.data.feeUzs,'230000');
  budget+=230000n;assert.equal(first.data.budgetUzs,budget.toString());assert.deepEqual(first.data.promoted,[],'selling a substitute promotes nobody');
  assert.equal((await sell(cb.id)).status,404);
  const listed=await one('SELECT club_id,origin,first_sale_done,market_value_uzs FROM players WHERE id=$1',[cb.id]);
  assert.deepEqual(listed,{club_id:null,origin:'academy',first_sale_done:true,market_value_uzs:String(marketValueUzs(50))},'the sold academy player stays on the market at full price');
  assert.ok((await ok(users[0],'GET','/api/market?maxValue=1000000')).players.some(p=>p.id===cb.id));
  // 2. Buying him back costs the full price; selling him again pays 80%: the 50% rate applies once only.
  assert.equal((await sign(cb.id)).status,200);budget-=460000n;
  const again=await sell(cb.id);assert.equal(again.data.resaleRatePercent,80);assert.equal(again.data.feeUzs,'368000');budget+=368000n;
  // 3. A generated youth player is a transfer-market player: 80%.
  const youth=squad.find(p=>p.id===clubs[0].youthId),soldYouth=await sell(youth.id);
  assert.equal(soldYouth.data.resaleRatePercent,80);assert.equal(soldYouth.data.feeUzs,saleValueUzs(youth.market_value_uzs,80).toString());budget+=BigInt(soldYouth.data.feeUzs);
  assert.equal(Number((await one("SELECT COUNT(*)::int AS n FROM players WHERE origin='generated'")).n),13,'selling a youth player back creates no new one');
  // 4. A catalogue player bought and sold: 80%.
  const target=(await ok(users[0],'GET','/api/market?maxValue=5000000')).players.find(p=>p.origin==='market');
  assert.equal((await sign(target.id)).status,200);budget-=BigInt(target.market_value_uzs);
  assert.equal((await call(users[1],'POST',clubPath(1)+'/players/sign',{playerId:target.id})).status,404,'a signed player is no longer a free agent');
  const soldTarget=await sell(target.id);assert.equal(soldTarget.data.resaleRatePercent,80);assert.equal(soldTarget.data.feeUzs,saleValueUzs(target.market_value_uzs,80).toString());budget+=BigInt(soldTarget.data.feeUzs);
  assert.equal(await budgetOf(0),budget);
  // 5. Selling a starter: the best player in the same position is promoted and the XI stays valid.
  const striker=squad.find(p=>lineup.starters.includes(p.id)&&p.position==='ST');
  const soldStriker=await sell(striker.id);
  assert.equal(soldStriker.data.resaleRatePercent,50);assert.equal(soldStriker.data.promoted.length,1);assert.equal(soldStriker.data.promoted[0].position,'ST');
  let state=await assertLineupValid(0);
  assert.ok(state.lineup.starters.includes(soldStriker.data.promoted[0].id));assert.ok(!state.lineup.starters.includes(striker.id));assert.ok(!state.lineup.substitutes.includes(soldStriker.data.promoted[0].id));
  // 6. Selling the starting goalkeeper promotes the other goalkeeper; the last goalkeeper cannot be sold.
  const keeper=squad.find(p=>lineup.starters.includes(p.id)&&p.position==='GK');
  const soldKeeper=await sell(keeper.id);
  assert.equal(soldKeeper.data.promoted[0].position,'GK');state=await assertLineupValid(0);
  const lastKeeper=await sell(soldKeeper.data.promoted[0].id);
  assert.equal(lastKeeper.status,400);assert.match(lastKeeper.data.error,/at least one goalkeeper/);
  // 7. Minimum squad of 13: two more sales are allowed, the next is refused. The XI is valid after every sale.
  assert.equal(state.players.length,15);
  for(const p of [bench('CM',50),bench('AM',50)]){assert.equal((await sell(p.id)).status,200);await assertLineupValid(0);}
  state=await assertLineupValid(0);assert.equal(state.players.length,13);
  const tooFew=await sell(state.lineup.substitutes[0]||state.lineup.starters[10]);
  assert.equal(tooFew.status,400);assert.match(tooFew.data.error,/at least 13 players/);
  assert.equal(Number((await one('SELECT COUNT(*)::int AS n FROM players WHERE club_id=$1',[id])).n),13);
  // 8. Maximum squad of 26, also for generated youth players. Club 1 is filled to 26 directly in the database.
  await db.query("INSERT INTO players(club_id,full_name,age,position,quality,overall,potential,attributes,market_value_uzs,origin) SELECT $1,'Filler '||g,20,'CM','academy',45,55,'{\"pace\":43,\"shooting\":43,\"passing\":50,\"dribbling\":47,\"defending\":43,\"physical\":44}',$2,'generated' FROM generate_series(1,8) g",[clubs[1].id,marketValueUzs(45)]);
  const anyYouth=(await ok(users[1],'GET','/api/market')).youth[0],before=await budgetOf(1);
  const full=await call(users[1],'POST',clubPath(1)+'/players/sign',{playerId:anyYouth.id});
  assert.equal(full.status,400);assert.match(full.data.error,/at most 26 players/);assert.equal(await budgetOf(1),before);
  assert.equal((await one('SELECT club_id FROM players WHERE id=$1',[anyYouth.id])).club_id,null);
  await db.query("DELETE FROM players WHERE club_id=$1 AND full_name LIKE 'Filler %'",[clubs[1].id]);
  assert.equal((await call(users[1],'POST',clubPath(1)+'/players/sign',{playerId:anyYouth.id})).status,200,'at 18 players the same signing succeeds');
  // 9. No free money: the ledger explains every som, and the round trips above lost money.
  await assertLedgersConsistent();
  const ledger=(await ok(users[0],'GET',clubPath(0)+'/ledger')).transactions;
  assert.equal(ledger[0].balance_after_uzs,(await budgetOf(0)).toString());
  assert.ok(ledger.every(x=>BigInt(x.balance_after_uzs)>=0n));
 });

 await t.test('upgrades are refused without Development Points',async()=>{
  const p=(await ok(users[0],'GET','/api/clubs/'+clubs[0].id+'/squad')).players[0];
  const r=await call(users[0],'POST','/api/clubs/'+clubs[0].id+'/players/upgrade',{playerId:p.id,attribute:'pace',levels:1});
  assert.equal(r.status,400);assert.match(r.data.error,/Not enough development points/);
  assert.equal((await call(users[0],'POST','/api/clubs/'+clubs[0].id+'/players/upgrade',{playerId:p.id,attribute:'luck',levels:1})).status,400);
 });


 const playedCount=async(where="kind='league'")=>Number((await one("SELECT COUNT(*)::int AS n FROM fixtures WHERE status='played' AND "+where)).n);
 const snapshot=async()=>JSON.stringify((await db.query('SELECT lm.*,c.development_points,c.budget_uzs,(SELECT json_agg(m.progress ORDER BY m.mission_id) FROM club_missions m WHERE m.club_id=c.id) AS missions FROM league_members lm JOIN clubs c ON c.id=lm.club_id ORDER BY lm.club_id')).rows);

 await t.test('users cannot start, accelerate, replay or settle a league match',async()=>{
  const first=(await ok(users[0],'GET',clubPath(0)+'/fixtures')).fixtures.find(f=>f.kind==='league');
  for(const [method,route] of [['POST','/api/fixtures/'+first.id+'/play'],['POST','/api/fixtures/'+first.id+'/settle'],['POST',clubPath(0)+'/fixtures'],['POST',clubPath(0)+'/fixtures/'+first.id+'/play'],['PUT','/api/fixtures/'+first.id],['POST',clubPath(0)+'/results'],['POST',clubPath(0)+'/stipend'],['POST',clubPath(0)+'/income'],['POST','/api/leagues/rollover'],['POST',clubPath(10)+'/stipend'],['DELETE','/api/fixtures/'+first.id]]){
   assert.equal((await call(users[0],method,route,{kickoffAt:inMinutes(0),status:'played'})).status,404,method+' '+route);
  }
  // Reading every screen the client loads on opening settles nothing either.
  for(const route of ['/fixtures','/results','/league','/friendlies','/missions'])await ok(users[0],'GET',clubPath(0)+route);
  await sleep(1200);
  assert.equal(await playedCount("TRUE"),0);
  assert.equal((await one('SELECT status FROM fixtures WHERE id=$1',[first.id])).status,'scheduled');
 });

 await t.test('a matchday is live for 60 seconds and all five matches are settled by the server at kick-off + 60s',async()=>{
  // Move matchday 1 so that it kicked off 57 seconds ago (database clock). No HTTP request is made while waiting for settlement.
  await db.query("UPDATE fixtures SET kickoff_at=date_trunc('milliseconds',NOW())-interval '57 seconds' WHERE kind='league' AND day_number=1");
  const live=(await ok(users[0],'GET',clubPath(0)+'/fixtures')).fixtures.find(f=>f.day_number===1);
  assert.equal(live.phase,'live');assert.equal(live.status,'scheduled');assert.equal(live.home_goals,null);
  await sleep(1500);
  assert.equal(await playedCount(),0,'nothing is settled before the 60 seconds are over');
  await waitFor(async()=>await playedCount()===5,'matchday 1 settlement',8000);
  const timing=await one("SELECT MIN(played_at-kickoff_at)>=interval '60 seconds' AS not_early,MAX(played_at-kickoff_at)<interval '63 seconds' AS on_time,COUNT(DISTINCT kickoff_at)::int AS kickoffs FROM fixtures WHERE status='played'");
  assert.deepEqual(timing,{not_early:true,on_time:true,kickoffs:1});
  const table=(await ok(users[0],'GET',clubPath(0)+'/league')).table;
  assert.ok(table.every(r=>r.played===1),'standings updated automatically for all ten clubs');
  const rewards=await one("SELECT COUNT(*)::int AS n,COUNT(DISTINCT club_id)::int AS clubs FROM development_ledger WHERE reason='match_reward'");
  assert.deepEqual(rewards,{n:10,clubs:10});
  // Income: 750,000 UZS per completed league match for league clubs, the same stipend for waiting clubs.
  await waitFor(async()=>Number((await one('SELECT COUNT(*)::int AS n FROM stipend_runs')).n)===1,'stipend run for matchday 1',5000);
  for(let i=0;i<10;i++){
   const income=await ledgerRows(i,'league_match_income');
   assert.equal(income.length,1);assert.equal(income[0].amount_uzs,'750000');
   const row=table.find(x=>x.club_id===clubs[i].id),bonus=await ledgerRows(i,'match_result_bonus');
   const expected=row.wins?250000n:row.draws?100000n:0n;
   assert.equal(bonus.reduce((n,x)=>n+BigInt(x.amount_uzs),0n),expected,'match-result bonus follows the official result');
   assert.equal((await ledgerRows(i,'waiting_stipend')).length,0,'a league club never receives the stipend');
  }
  for(const i of [10,11]){
   const stipend=await ledgerRows(i,'waiting_stipend');
   assert.equal(stipend.length,1);assert.equal(stipend[0].amount_uzs,'750000');assert.equal(await budgetOf(i),20750000n);
   assert.equal((await ledgerRows(i,'league_match_income')).length,0);
  }
  const club2Bonus=(await ledgerRows(2,'match_result_bonus')).reduce((n,x)=>n+BigInt(x.amount_uzs),0n);
  assert.equal(await budgetOf(2),20750000n+club2Bonus);
  await assertLedgersConsistent();
  const done=(await ok(users[0],'GET',clubPath(0)+'/fixtures')).fixtures.find(f=>f.day_number===1);
  assert.equal(done.phase,'played');assert.equal(typeof done.home_goals,'number');
 });

 await t.test('two server instances settle each fixture exactly once',async()=>{
  server2=await startServer(childEnv({PORT:String(PORT+1)}));logs.push(server2.log);
  await db.query("UPDATE fixtures SET kickoff_at=NOW()-interval '5 minutes' WHERE kind='league' AND day_number=2");
  await waitFor(async()=>await playedCount()===10,'matchday 2 settlement');
  await sleep(700);
  const table=(await ok(users[0],'GET',clubPath(0)+'/league')).table;
  assert.ok(table.every(r=>r.played===2&&r.wins+r.draws+r.losses===2));
  const doubles=await db.query("SELECT 1 FROM development_ledger WHERE reason='match_reward' GROUP BY club_id,reference_id HAVING COUNT(*)>1");
  assert.equal(doubles.rowCount,0);
  assert.equal(Number((await one("SELECT COUNT(*)::int AS n FROM development_ledger WHERE reason='match_reward'")).n),20);
  // Neither income nor the stipend can be paid twice, even with two schedulers racing.
  await waitFor(async()=>Number((await one('SELECT COUNT(*)::int AS n FROM stipend_runs')).n)===2,'stipend run for matchday 2',5000);
  await sleep(500);
  assert.equal((await db.query("SELECT 1 FROM money_ledger WHERE reason='league_match_income' GROUP BY club_id,reference_id HAVING COUNT(*)>1")).rowCount,0);
  assert.equal(Number((await one("SELECT COUNT(*)::int AS n FROM money_ledger WHERE reason='league_match_income'")).n),20);
  assert.deepEqual(await one("SELECT COUNT(*)::int AS payments,COUNT(DISTINCT club_id)::int AS clubs,SUM(amount_uzs)::int AS total FROM stipend_payments"),{payments:4,clubs:2,total:3000000});
  assert.equal(Number((await one("SELECT COUNT(*)::int AS n FROM money_ledger WHERE reason='waiting_stipend'")).n),4);
  assert.equal((await db.query('SELECT 1 FROM stipend_payments s JOIN league_members lm ON lm.league_id=s.league_id AND lm.club_id=s.club_id')).rowCount,0,'no league member was ever paid a stipend');
  await assertLedgersConsistent();
  // A club registered now is not paid for matchdays that are already over.
  clubs[12]=(await ok(users[12],'POST','/api/clubs',{name:'Integration Club 13',shortName:'IC13',primaryColour:'#225588',secondaryColour:'#ffffff'})).club;
  await sleep(700);
  assert.equal((await ledgerRows(12,'waiting_stipend')).length,0);assert.equal(await budgetOf(12),20000000n);
  server2.child.kill();server2=null;
 });

 await t.test('matches missed during downtime are settled in kick-off order when the server starts',async()=>{
  server.child.kill();await sleep(300);
  await db.query("UPDATE fixtures SET kickoff_at=NOW()-make_interval(hours=>(6-day_number)) WHERE kind='league' AND day_number IN (3,4,5)");
  await sleep(500);
  assert.equal(await playedCount(),10,'nothing is settled while no server is running');
  server=await startServer(childEnv({SUPER_ADMIN_TELEGRAM_ID:'dev-1'}));logs.push(server.log);
  await waitFor(async()=>await playedCount()===25,'catch-up settlement');
  const order=(await db.query("SELECT day_number FROM fixtures WHERE kind='league' AND day_number IN (3,4,5) ORDER BY played_at,kickoff_at")).rows.map(r=>r.day_number);
  assert.deepEqual(order,order.slice().sort((a,b)=>a-b));
  assert.ok((await ok(users[0],'GET',clubPath(0)+'/league')).table.every(r=>r.played===5));
  await waitFor(async()=>Number((await one('SELECT COUNT(*)::int AS n FROM stipend_runs')).n)===5,'stipend runs after catch-up',5000);
  assert.equal((await ledgerRows(10,'waiting_stipend')).length,5);assert.equal((await ledgerRows(12,'waiting_stipend')).length,3,'the late club is paid only for matchdays completed after it registered');
  assert.equal((await ledgerRows(3,'league_match_income')).length,5);await assertLedgersConsistent();
 });

 await t.test('a friendly is settled by the scheduler without touching standings, DP or missions; stale requests expire',async()=>{
  const stale=await ok(users[8],'POST',clubPath(8)+'/friendlies',{opponentClubId:clubs[9].id,kickoffAt:inMinutes(30)});
  // Both sides save a formation other than the default; settlement must use what is stored for each club.
  const sides=[[friendlyB.home_club_id,'5-4-1'],[friendlyB.away_club_id,'3-4-3']];
  for(const [clubId,formation] of sides){
   const i=clubs.findIndex(c=>c.id===clubId),best=(await ok(users[i],'GET',clubPath(i)+'/formations')).formations.find(f=>f.id===formation).best;
   await ok(users[i],'POST',clubPath(i)+'/lineup',{formation,starters:best.starters,substitutes:best.substitutes});
  }
  const before=await snapshot();
  await db.query("UPDATE friendly_requests SET proposed_kickoff_at=NOW()-interval '1 minute' WHERE id=$1",[stale.request.id]);
  await db.query("UPDATE fixtures SET kickoff_at=NOW()-interval '61 seconds' WHERE id=$1",[friendlyB.id]);
  await waitFor(async()=>await playedCount("kind='friendly'")===1,'friendly settlement');
  await waitFor(async()=>(await one('SELECT status FROM friendly_requests WHERE id=$1',[stale.request.id])).status==='expired','request expiry');
  assert.equal((await call(users[9],'POST',clubPath(9)+'/friendlies/'+stale.request.id+'/accept',{})).status,409);
  assert.equal(await snapshot(),before);
  const f=await one('SELECT * FROM fixtures WHERE id=$1',[friendlyB.id]);
  assert.equal(f.league_id,null);assert.equal(f.events.filter(e=>e.type==='goal').length,f.home_goals+f.away_goals);
  assert.equal(f.events.filter(e=>e.type==='kickoff').length,0,'no extra kickoff event');
  for(const [clubId,formation] of sides)assert.equal((await one('SELECT formation FROM lineups WHERE club_id=$1',[clubId])).formation,formation,'settlement does not reset the formation');
  assert.equal(Number((await one("SELECT COUNT(*)::int AS n FROM development_ledger WHERE reference_id=$1",[friendlyB.id])).n),0);
 });

 await t.test('result history and viewed state are stored on the server',async()=>{
  const first=await ok(users[0],'GET',clubPath(0)+'/results');
  assert.equal(first.results.length,6);assert.equal(first.unviewedCount,6);assert.ok(first.results.every(r=>r.viewed===false&&r.events===undefined));
  assert.equal(first.results[0].id,friendlyB.id,'the newest completed match comes first');assert.equal(first.results[0].kind,'friendly');
  const times=first.results.map(r=>Date.parse(r.kickoff_at));assert.deepEqual(times,times.slice().sort((a,b)=>b-a));
  for(const r of first.results){
   const mine=r.home_club_id===clubs[0].id?[r.home_goals,r.away_goals]:[r.away_goals,r.home_goals];
   assert.equal(r.outcome,mine[0]>mine[1]?'win':mine[0]<mine[1]?'loss':'draw');
   assert.ok(r.home_name&&r.away_name&&r.home_short_name&&r.away_colour&&r.kickoff_at&&r.played_at);
  }
  assert.deepEqual(await ok(users[0],'GET',clubPath(0)+'/results'),first,'reading results does not mark them viewed');
  assert.equal((await ok(users[0],'GET',clubPath(0)+'/results?limit=2')).results.length,2);
  const latest=first.results[1],report=(await ok(users[0],'GET',clubPath(0)+'/results/'+latest.id)).result;
  assert.equal(report.events.filter(e=>e.type==='goal').length,report.home_goals+report.away_goals);assert.equal(report.outcome,latest.outcome);
  assert.equal((await call(users[1],'GET',clubPath(0)+'/results')).status,404,'another user cannot read this club\'s results');
  const foreign=(await one("SELECT id FROM fixtures WHERE status='played' AND home_club_id<>$1 AND away_club_id<>$1 LIMIT 1",[clubs[0].id])).id;
  assert.equal((await call(users[0],'GET',clubPath(0)+'/results/'+foreign)).status,404);
  const upcoming=(await one("SELECT id FROM fixtures WHERE status='scheduled' AND (home_club_id=$1 OR away_club_id=$1) LIMIT 1",[clubs[0].id])).id;
  assert.equal((await call(users[0],'GET',clubPath(0)+'/results/'+upcoming)).status,404);
  const viewed=p=>call(users[0],'POST',clubPath(0)+'/results/viewed',p);
  assert.equal((await viewed({})).status,400);assert.equal((await viewed({fixtureIds:['nope']})).status,400);
  assert.equal((await viewed({fixtureIds:[foreign,upcoming]})).data.unviewedCount,6,'only this club\'s completed matches can be marked');
  assert.equal((await viewed({fixtureIds:[latest.id]})).data.unviewedCount,5);
  assert.equal((await viewed({fixtureIds:[latest.id]})).data.unviewedCount,5,'idempotent');
  // "Another device" is simply another request by the same user: the state comes from the database.
  const second=await ok(users[0],'GET',clubPath(0)+'/results');
  assert.deepEqual(second.results.filter(r=>r.viewed).map(r=>r.id),[latest.id]);assert.equal(second.unviewedCount,5);
  const opponent=clubs.findIndex(c=>c.id===(latest.home_club_id===clubs[0].id?latest.away_club_id:latest.home_club_id));
  assert.equal((await ok(users[opponent],'GET',clubPath(opponent)+'/results')).results.find(r=>r.id===latest.id).viewed,false,'viewed state is per club');
  assert.equal((await viewed({all:true})).data.unviewedCount,0);
  assert.ok((await ok(users[0],'GET',clubPath(0)+'/results')).results.every(r=>r.viewed));
  // A newly settled match arrives unviewed and first.
  await db.query("UPDATE fixtures SET kickoff_at=NOW()-interval '61 seconds' WHERE kind='league' AND day_number=6");
  await waitFor(async()=>await playedCount()===30,'matchday 6 settlement');
  const third=await ok(users[0],'GET',clubPath(0)+'/results');
  assert.equal(third.unviewedCount,1);assert.equal(third.results[0].viewed,false);assert.equal(third.results[0].day_number,6);assert.ok(third.results.slice(1).every(r=>r.viewed));
 });

 const assets=async()=>JSON.stringify((await db.query("SELECT c.id,c.name,c.crest_url,(SELECT json_agg(json_build_array(p.id,p.overall,p.attributes,p.origin,p.first_sale_done) ORDER BY p.id) FROM players p WHERE p.club_id=c.id) AS squad,(SELECT json_build_array(l.formation,l.starters,l.substitutes) FROM lineups l WHERE l.club_id=c.id) AS lineup FROM clubs c ORDER BY c.id")).rows);
 const wealth=async()=>JSON.stringify((await db.query('SELECT id,budget_uzs,development_points FROM clubs ORDER BY id')).rows);

 await t.test('owner activity warnings and inactivity forfeits are evaluated at scheduled kick-off',async()=>{
  const first=(await one("SELECT * FROM fixtures WHERE kind='league' AND status='scheduled' ORDER BY kickoff_at,id LIMIT 1"));
  const homeIndex=clubs.findIndex(c=>c.id===first.home_club_id),awayIndex=clubs.findIndex(c=>c.id===first.away_club_id);
  assert.ok(homeIndex>=0&&awayIndex>=0);
  await db.query("UPDATE owner_activity_events SET activity_at=NOW()-interval '49 hours' WHERE user_id=(SELECT owner_user_id FROM clubs WHERE id=$1)",[first.home_club_id]);
  await db.query("UPDATE owner_activity_events SET activity_at=NOW()-interval '24 hours' WHERE user_id=(SELECT owner_user_id FROM clubs WHERE id=$1)",[first.away_club_id]);
  const firstWarning=await ok(users[awayIndex],'GET',clubPath(awayIndex)+'/activity');
  assert.equal(firstWarning.activity.warningLevel,24,'the first warning appears at 24 hours idle');
  await db.query("UPDATE owner_activity_events SET activity_at=NOW()-interval '46 hours' WHERE user_id=(SELECT owner_user_id FROM clubs WHERE id=$1)",[first.away_club_id]);
  const warning=await ok(users[awayIndex],'GET',clubPath(awayIndex)+'/activity');
  assert.equal(warning.activity.warningLevel,2,'the final warning appears at 46 hours idle');
  await db.query("UPDATE fixtures SET kickoff_at=NOW()-interval '61 seconds' WHERE id=$1",[first.id]);
  await waitFor(async()=>(await one('SELECT status FROM fixtures WHERE id=$1',[first.id])).status==='played','single inactivity forfeit');
  const single=await one('SELECT home_goals,away_goals,events FROM fixtures WHERE id=$1',[first.id]);
  assert.equal(single.home_goals,0);assert.equal(single.away_goals,3);
  assert.equal(single.events[0].reason,'owner_inactivity');assert.equal(single.events[0].forfeit,'single');
  assert.equal((await ledgerRows(awayIndex,'match_result_bonus')).some(x=>x.reference_id===first.id),true,'active opponent receives the win bonus');
  assert.equal((await ledgerRows(homeIndex,'match_result_bonus')).some(x=>x.reference_id===first.id),false,'inactive owner receives no result bonus');

  const second=(await one("SELECT * FROM fixtures WHERE kind='league' AND status='scheduled' AND id<>$1 ORDER BY kickoff_at,id LIMIT 1",[first.id]));
  const h2=clubs.findIndex(c=>c.id===second.home_club_id),a2=clubs.findIndex(c=>c.id===second.away_club_id);
  const pointsBefore=await db.query('SELECT club_id,points,losses,played FROM league_members WHERE league_id=$1 AND club_id=ANY($2::uuid[])',[second.league_id,[second.home_club_id,second.away_club_id]]);
  for(const clubId of [second.home_club_id,second.away_club_id])await db.query("UPDATE owner_activity_events SET activity_at=NOW()-interval '49 hours' WHERE user_id=(SELECT owner_user_id FROM clubs WHERE id=$1)",[clubId]);
  const warning24=await ok(users[h2],'GET',clubPath(h2)+'/activity');
  assert.equal(warning24.activity.inactive,true,'owner is already beyond the inactivity threshold');
  await db.query("UPDATE fixtures SET kickoff_at=NOW()-interval '61 seconds' WHERE id=$1",[second.id]);
  await waitFor(async()=>(await one('SELECT status FROM fixtures WHERE id=$1',[second.id])).status==='played','double inactivity forfeit');
  const double=await one('SELECT home_goals,away_goals,events FROM fixtures WHERE id=$1',[second.id]);
  assert.equal(double.home_goals,0);assert.equal(double.away_goals,0);
  assert.equal(double.events[0].forfeit,'double');
  for(const r of pointsBefore.rows){
   const after=await one('SELECT points,losses,played FROM league_members WHERE league_id=$1 AND club_id=$2',[second.league_id,r.club_id]);
   assert.equal(after.points,r.points,'double-forfeit clubs receive no league points');
   assert.equal(after.losses,r.losses+1);assert.equal(after.played,r.played+1);
  }
  assert.equal((await ledgerRows(h2,'match_result_bonus')).some(x=>x.reference_id===second.id),false);
  assert.equal((await ledgerRows(a2,'match_result_bonus')).some(x=>x.reference_id===second.id),false);
  await assertLedgersConsistent();
 });

 await t.test('the whole season is settled automatically, pays income, result bonuses and top-three prizes',async()=>{
  const before=await assets(),budgetsBefore=await Promise.all(clubs.map((_,i)=>budgetOf(i)));
  server2=await startServer(childEnv({PORT:String(PORT+1)}));logs.push(server2.log);
  // Seed qualifying actions at the accelerated fixture times before making fixtures overdue,
  // so the live scheduler cannot race between the timestamp shift and the activity inserts.
  await db.query("INSERT INTO owner_activity_events(user_id,activity_at) SELECT c.owner_user_id,f.kickoff_at-interval '40 days 1 hour' FROM fixtures f JOIN clubs c ON c.id IN (f.home_club_id,f.away_club_id) WHERE f.kind='league' AND f.status='scheduled'");
  await db.query("UPDATE fixtures SET kickoff_at=kickoff_at-interval '40 days' WHERE kind='league' AND status='scheduled'");
  await waitFor(async()=>await playedCount()===90,'season settlement',40000);
  const s1=await one('SELECT id FROM leagues WHERE season_number=1');
  const played=await one("SELECT SUM(home_goals)::int AS hg,SUM(away_goals)::int AS ag FROM fixtures WHERE status='played' AND league_id=$1",[s1.id]);
  const table=(await db.query('SELECT * FROM league_members WHERE league_id=$1 ORDER BY points DESC',[s1.id])).rows;
  assert.equal(table.length,10);
  for(const r of table){assert.equal(r.played,18);assert.equal(r.wins+r.draws+r.losses,18);assert.equal(r.points,r.wins*3+r.draws);}
  const sum=k=>table.reduce((n,r)=>n+r[k],0);
  const doubleForfeits=Number((await one("SELECT COUNT(*)::int AS n FROM fixtures WHERE league_id=$1 AND events->0->>'forfeit'='double'",[s1.id])).n);
  assert.equal(sum('losses')-sum('wins'),doubleForfeits*2,'double forfeits count as two losses and no win');assert.equal(sum('draws')%2,0);
  assert.equal(sum('goals_for'),sum('goals_against'));assert.equal(sum('goals_for'),played.hg+played.ag);
  const order=(await db.query("SELECT day_number FROM fixtures WHERE league_id=$1 AND day_number>6 ORDER BY played_at,kickoff_at",[s1.id])).rows.map(r=>r.day_number);
  assert.deepEqual(order,order.slice().sort((a,b)=>a-b),'matchdays are settled in order');
  await waitFor(async()=>(await one('SELECT status FROM leagues WHERE season_number=1')).status==='completed','league completion',3000);
  assert.ok((await one('SELECT completed_at FROM leagues WHERE season_number=1')).completed_at);
  // Season income: 18 x 750,000 = 13,500,000 UZS per league club, and the same in stipends for a club that waited all season.
  await waitFor(async()=>Number((await one('SELECT COUNT(*)::int AS n FROM stipend_runs WHERE league_id=$1',[s1.id])).n)===18,'all 18 stipend runs',5000);
  await sleep(600);
  for(let i=0;i<10;i++){
   const income=await ledgerRows(i,'league_match_income');
   assert.equal(income.length,18);assert.equal(new Set(income.map(x=>x.reference_id)).size,18);assert.equal(income.reduce((n,x)=>n+BigInt(x.amount_uzs),0n),13500000n);
   assert.equal((await ledgerRows(i,'waiting_stipend')).length,0);
  }
  for(let i=0;i<10;i++){
   const bonus=(await ledgerRows(i,'match_result_bonus')).reduce((n,x)=>n+BigInt(x.amount_uzs),0n);
   const record=await one('SELECT wins,draws FROM league_members WHERE league_id=$1 AND club_id=$2',[s1.id,clubs[i].id]);
   assert.equal(bonus,BigInt(record.wins)*250000n+BigInt(record.draws)*100000n,'bonuses match the final win/draw record');
   const prize=BigInt((await one('SELECT COALESCE(SUM(amount_uzs),0)::text AS n FROM season_prize_payments WHERE league_id=$1 AND club_id=$2',[s1.id,clubs[i].id])).n);
   assert.ok(prize>=0n);
  }
  const prizeSummary=await one('SELECT COUNT(*)::int AS payments,COALESCE(SUM(amount_uzs),0)::text AS total,MAX(place)::int AS max_place FROM season_prize_payments WHERE league_id=$1',[s1.id]);
  assert.equal(BigInt(prizeSummary.total),22000000n,'top-three prize pool paid once, including tied-place splits');
  assert.ok(prizeSummary.payments>=3);assert.ok(prizeSummary.max_place<=3);
  for(const [i,n] of [[10,18],[11,18],[12,16]]){
   const stipend=await ledgerRows(i,'waiting_stipend');
   assert.equal(stipend.length,n);assert.equal(await budgetOf(i),20000000n+750000n*BigInt(n));assert.equal((await ledgerRows(i,'league_match_income')).length,0);
  }
  assert.equal(Number((await one('SELECT COUNT(*)::int AS n FROM stipend_payments')).n),52);
  assert.equal((await db.query('SELECT 1 FROM stipend_payments s JOIN league_members lm ON lm.league_id=s.league_id AND lm.club_id=s.club_id')).rowCount,0);
  await assertLedgersConsistent();
  assert.equal(await assets(),before,'a season of matches changes no squad, lineup or club identity');
 });

 await t.test('season 2 is created automatically, exactly once, and clubs keep everything',async()=>{
  await waitFor(async()=>Number((await one('SELECT COUNT(*)::int AS n FROM leagues')).n)===2,'season 2',5000);
  const s1=await one('SELECT id,starts_on::text AS starts_on FROM leagues WHERE season_number=1');
  const s2=await one("SELECT id,status,starts_on::text AS starts_on,GREATEST($1::date+21,(NOW() AT TIME ZONE 'Asia/Tashkent')::date+1)::text AS expected FROM leagues WHERE season_number=2",[s1.starts_on]);
  assert.equal(s2.status,'active');assert.equal(s2.starts_on,s2.expected,'day 1 follows day 19 after two rest days');
  assert.equal((await one('SELECT ($2::date-$1::date) AS gap',[s1.starts_on,s2.starts_on])).gap,21);
  const members=async id=>(await db.query('SELECT club_id FROM league_members WHERE league_id=$1 ORDER BY club_id',[id])).rows.map(r=>r.club_id);
  assert.deepEqual(await members(s2.id),await members(s1.id),'the same ten clubs keep their places');
  for(const i of [10,11,12])assert.ok(!(await members(s2.id)).includes(clubs[i].id),'waiting clubs keep waiting');
  assert.ok((await db.query('SELECT * FROM league_members WHERE league_id=$1',[s2.id])).rows.every(r=>r.played===0&&r.points===0&&r.goals_for===0));
  const fixtures=(await db.query("SELECT day_number,status,home_club_id,away_club_id,to_char(kickoff_at AT TIME ZONE 'Asia/Tashkent','YYYY-MM-DD HH24:MI:SS') AS local,($2::date+(day_number-1))::text AS expected_date FROM fixtures WHERE league_id=$1",[s2.id,s2.starts_on])).rows;
  assert.equal(fixtures.length,90);
  for(const f of fixtures){assert.equal(f.status,'scheduled');assert.equal(f.local,f.expected_date+' 20:00:00');}
  assert.deepEqual([...new Set(fixtures.map(f=>f.day_number))].sort((a,b)=>a-b),[1,2,3,4,5,6,7,8,9,11,12,13,14,15,16,17,18,19]);
  assert.equal(new Set(fixtures.map(f=>f.home_club_id+'>'+f.away_club_id)).size,90);
  // Idempotent: two running schedulers, a restart, the ensure route and a direct duplicate insert create nothing more.
  const assetsBefore=await assets(),wealthBefore=await wealth();
  server.child.kill();await sleep(300);server=await startServer(childEnv({SUPER_ADMIN_TELEGRAM_ID:'dev-1'}));logs.push(server.log);
  await ok(users[0],'POST',clubPath(0)+'/leagues/ensure',{});await ok(users[10],'POST',clubPath(10)+'/leagues/ensure',{});
  await sleep(1500);
  assert.equal(Number((await one('SELECT COUNT(*)::int AS n FROM leagues')).n),2);
  assert.equal(Number((await one("SELECT COUNT(*)::int AS n FROM fixtures WHERE kind='league'")).n),180);
  assert.equal(Number((await one('SELECT COUNT(*)::int AS n FROM league_members')).n),20);
  await assert.rejects(db.query("INSERT INTO leagues(name,season_number,status,starts_on) VALUES('Duplicate',2,'active',CURRENT_DATE)"),/leagues_season_unique/);
  server2.child.kill();server2=null;
  // Clubs retain cash, Development Points, squads, upgrades, lineups and history.
  assert.equal(await assets(),assetsBefore);assert.equal(await wealth(),wealthBefore,'the rollover itself moves no money and no points');
  const league=await ok(users[0],'GET',clubPath(0)+'/league');
  assert.equal(league.season.number,2);assert.equal(league.season.status,'active');assert.ok(league.table.every(r=>r.played===0));
  assert.equal(league.previous.season.number,1);assert.equal(league.previous.season.status,'completed');assert.ok(league.previous.table.every(r=>r.played===18));
  const results=await ok(users[0],'GET',clubPath(0)+'/results?limit=50');
  assert.equal(results.results.length,19,'18 league results and one friendly are still in the history');
  assert.equal((await ok(users[0],'GET',clubPath(0)+'/fixtures')).fixtures.filter(f=>f.season_number===2&&f.phase==='upcoming').length,18);
  assert.ok((await ok(users[0],'GET',clubPath(0)+'/ledger')).transactions.length>0);
  const waiting=await ok(users[10],'GET',clubPath(10)+'/league');
  assert.deepEqual(waiting,{leagueExists:true,table:[],season:null,previous:null});
  await assertLedgersConsistent();
 });

 await t.test('matches and missions award Development Points with a consistent ledger',async()=>{
  for(let i=0;i<10;i++){
   const id=clubs[i].id,club=(await ok(users[i],'GET','/api/clubs/'+id)).club;
   const missions=(await ok(users[i],'GET','/api/clubs/'+id+'/missions')).missions;
   const byId=Object.fromEntries(missions.map(m=>[m.id,m]));
   assert.ok(byId.play_1.completed_at);assert.ok(byId.play_3.completed_at);
   const expected=36+missions.filter(m=>m.completed_at).reduce((n,m)=>n+m.reward_dp,0);
   assert.equal(club.development_points,expected);
   const total=(await db.query('SELECT COALESCE(SUM(amount_dp),0)::int AS n,COUNT(*) FILTER (WHERE reason=\'match_reward\')::int AS matches FROM development_ledger WHERE club_id=$1',[id])).rows[0];
   assert.equal(total.n,club.development_points);assert.equal(total.matches,18);
   for(const m of missions){assert.ok(m.progress<=m.target);assert.equal(Boolean(m.completed_at),m.progress>=m.target);}
  }
 });

 await t.test('attribute upgrades spend DP, respect potential and are logged',async()=>{
  const id=clubs[0].id,before=(await ok(users[0],'GET','/api/clubs/'+id)).club;
  const squad=(await ok(users[0],'GET','/api/clubs/'+id+'/squad')).players;
  const player=squad.find(p=>p.attributes.pace<p.potential);
  const start=player.attributes.pace,cost=upgradeCost(start,1);
  const r=await ok(users[0],'POST','/api/clubs/'+id+'/players/upgrade',{playerId:player.id,attribute:'pace',levels:1});
  assert.equal(r.spentDp,cost);assert.equal(r.remainingDp,before.development_points-cost);assert.equal(r.player.attributes.pace,start+1);
  const after=(await ok(users[0],'GET','/api/clubs/'+id)).club;
  assert.equal(after.development_points,before.development_points-cost);
  const stored=(await ok(users[0],'GET','/api/clubs/'+id+'/squad')).players.find(p=>p.id===player.id);
  assert.equal(stored.attributes.pace,start+1);assert.ok(stored.overall>=player.overall&&stored.overall<=stored.potential);
  const dp=(await ok(users[0],'GET','/api/clubs/'+id+'/development-ledger')).transactions;
  assert.equal(dp[0].reason,'player_upgrade');assert.equal(dp[0].amount_dp,-cost);assert.equal(dp[0].balance_after_dp,after.development_points);
  assert.equal((await call(users[1],'POST','/api/clubs/'+clubs[1].id+'/players/upgrade',{playerId:player.id,attribute:'pace',levels:1})).status,404);
  await db.query("UPDATE players SET attributes=jsonb_set(attributes,'{shooting}',to_jsonb(potential::int)) WHERE id=$1",[player.id]);
  const capped=await call(users[0],'POST','/api/clubs/'+id+'/players/upgrade',{playerId:player.id,attribute:'shooting',levels:1});
  assert.equal(capped.status,400);assert.match(capped.data.error,/upgrade cap/);
 });


 await t.test('six attribute points raise overall by exactly one and reprice the player',async()=>{
  const squad=(await ok(users[5],'GET',clubPath(5)+'/squad')).players,p=squad.find(x=>x.overall===47&&x.position==='ST');
  assert.equal(Object.values(p.attributes).reduce((a,b)=>a+b,0),47*6);
  const names=['pace','shooting','passing','dribbling','defending','physical'];
  for(let i=0;i<6;i++){
   const r=await ok(users[5],'POST',clubPath(5)+'/players/upgrade',{playerId:p.id,attribute:names[i],levels:1});
   assert.equal(r.player.overall,i<5?47:48,'after '+(i+1)+' point(s)');
  }
  const stored=await one('SELECT overall,market_value_uzs,quality,attributes FROM players WHERE id=$1',[p.id]);
  assert.equal(stored.overall,48);assert.equal(Number(stored.market_value_uzs),marketValueUzs(48));assert.equal(stored.quality,qualityForOverall(48));
  assert.equal(Object.values(stored.attributes).reduce((a,b)=>a+b,0),48*6);
 });

 await t.test('season 2 plays, pays and counts on its own while season 1 stays final',async()=>{
  const s1=await one('SELECT id FROM leagues WHERE season_number=1'),s2=await one('SELECT id FROM leagues WHERE season_number=2');
  const finalTable=JSON.stringify((await db.query('SELECT * FROM league_members WHERE league_id=$1 ORDER BY club_id',[s1.id])).rows);
  const before=await budgetOf(3),waitingBefore=await budgetOf(10);
  await db.query("INSERT INTO owner_activity_events(user_id,activity_at) SELECT owner_user_id,NOW()-interval '1 hour' FROM clubs WHERE id IN (SELECT home_club_id FROM fixtures WHERE league_id=$1 AND day_number=1 UNION SELECT away_club_id FROM fixtures WHERE league_id=$1 AND day_number=1)",[s2.id]);
  await db.query("UPDATE fixtures SET kickoff_at=NOW()-interval '61 seconds' WHERE league_id=$1 AND day_number=1",[s2.id]);
  await waitFor(async()=>Number((await one("SELECT COUNT(*)::int AS n FROM fixtures WHERE league_id=$1 AND status='played'",[s2.id])).n)===5,'season 2 matchday 1');
  await waitFor(async()=>Number((await one('SELECT COUNT(*)::int AS n FROM stipend_runs WHERE league_id=$1',[s2.id])).n)===1,'season 2 stipend run',5000);
  await sleep(500);
  assert.ok((await db.query('SELECT played FROM league_members WHERE league_id=$1',[s2.id])).rows.every(r=>r.played===1));
  assert.equal(JSON.stringify((await db.query('SELECT * FROM league_members WHERE league_id=$1 ORDER BY club_id',[s1.id])).rows),finalTable);
  const fixture3=(await one("SELECT id FROM fixtures WHERE league_id=$1 AND day_number=1 AND (home_club_id=$2 OR away_club_id=$2)",[s2.id,clubs[3].id])).id;
  const bonus3=BigInt((await one("SELECT COALESCE(SUM(amount_uzs),0)::text AS n FROM money_ledger WHERE club_id=$1 AND reason='match_result_bonus' AND reference_id=$2",[clubs[3].id,fixture3])).n);
  assert.equal(await budgetOf(3),before+750000n+bonus3);assert.equal(await budgetOf(10),waitingBefore+750000n);
  assert.equal((await ledgerRows(10,'waiting_stipend')).length,19);
  const newest=(await ok(users[0],'GET',clubPath(0)+'/results?limit=1')).results[0];
  assert.equal(newest.season_number,2);assert.equal(newest.day_number,1);assert.equal(newest.viewed,false);
  assert.equal(Number((await one('SELECT COUNT(*)::int AS n FROM leagues')).n),2,'an unfinished season creates no successor');
  await assertLedgersConsistent();
  for(let i=0;i<13;i++)await assertLineupValid(i);
 });

 await t.test('rating profile: every stored player is an Uzbek League player rated 40-90 with potential up to 90',async()=>{
  const profile=await one('SELECT * FROM rating_profiles');
  assert.deepEqual(profile,{category:'uzbek_league',min_overall:UZBEK_LEAGUE.minOverall,max_overall:UZBEK_LEAGUE.maxOverall,max_potential:UZBEK_LEAGUE.maxPotential,max_attribute:UZBEK_LEAGUE.maxAttribute});
  assert.equal(Number((await one('SELECT COUNT(*)::int AS n FROM rating_profiles')).n),1);
  const stats=await one("SELECT COUNT(*)::int AS n,MIN(overall)::int AS low,MAX(overall)::int AS high,MAX(potential)::int AS potential,COUNT(*) FILTER (WHERE category<>'uzbek_league')::int AS foreign_rows,COUNT(*) FILTER (WHERE potential<overall)::int AS inverted FROM players");
  assert.ok(stats.n>500);assert.ok(stats.low>=40&&stats.high<=90&&stats.potential<=90);assert.equal(stats.foreign_rows,0);assert.equal(stats.inverted,0);
  // The seeded catalogue was not extended: its best player is still 74, and nine potentials sit at the 90 cap.
  const catalogue=await one("SELECT MAX(overall)::int AS high,MIN(overall)::int AS low,COUNT(*)::int AS n,COUNT(*) FILTER (WHERE potential=90)::int AS capped FROM players WHERE catalog_key IS NOT NULL");
  assert.equal(catalogue.n,360);assert.equal(catalogue.low,46);assert.ok(catalogue.capped>=9);
  const bad=(await db.query("SELECT 1 FROM players p,jsonb_each_text(p.attributes) a WHERE a.value::numeric NOT BETWEEN 1 AND 99")).rowCount;
  assert.equal(bad,0);
  const insert="INSERT INTO players(full_name,age,position,quality,overall,potential,attributes,market_value_uzs,origin) VALUES('Rating Probe',22,'ST','elite',$1,$2,$3::jsonb,0,'market') RETURNING id";
  const attrs=(n,extra={})=>JSON.stringify({pace:n,shooting:n,passing:n,dribbling:n,defending:n,physical:n,...extra});
  const probes=[];
  for(const [o,pot,a] of [[40,40,attrs(40)],[90,90,attrs(90)],[90,90,attrs(88,{physical:99,defending:99})]])probes.push((await one(insert,[o,pot,a])).id);
  await assert.rejects(()=>db.query(insert,[39,60,attrs(39)]),/outside 40-90/);
  await assert.rejects(()=>db.query(insert,[91,91,attrs(91)]),/outside 40-90/);
  await assert.rejects(()=>db.query(insert,[80,91,attrs(80)]),/Potential 91 is above 90/);
  await assert.rejects(()=>db.query(insert,[80,79,attrs(80)]),/players_potential_not_below_overall/);
  await assert.rejects(()=>db.query(insert,[90,90,attrs(90,{pace:100})]),/outside 1-99/);
  await assert.rejects(()=>db.query('UPDATE players SET overall=91,potential=91 WHERE id=$1',[probes[1]]),/outside 40-90/);
  await assert.rejects(()=>db.query("UPDATE players SET category='international_iconic' WHERE id=$1",[probes[1]]),/international_iconic|foreign key/);
  await db.query('DELETE FROM players WHERE id=ANY($1::uuid[])',[probes]);
 });

 await t.test('upgrades can never push a player past overall 90, and attributes stop at potential',async()=>{
  const id=clubs[0].id,path=clubPath(0)+'/players/upgrade',names=['pace','shooting','passing','dribbling','defending','physical'];
  const cost=upgradeCost(89,1),budget=await budgetOf(0);
  // Development Points for the test are booked through the ledger so the balance stays consistent.
  const dp=(await one('UPDATE clubs SET development_points=development_points+$2 WHERE id=$1 RETURNING development_points',[id,cost*6+50])).development_points;
  await db.query("INSERT INTO development_ledger(club_id,amount_dp,balance_after_dp,reason) VALUES($1,$2,$3,'test_grant')",[id,cost*6+50,dp]);
  const flat=n=>JSON.stringify(Object.fromEntries(names.map(k=>[k,n])));
  const star=(await one("INSERT INTO players(club_id,full_name,age,position,quality,overall,potential,attributes,market_value_uzs,origin) VALUES($1,'Rating Ceiling',24,'CM','elite',89,90,$2::jsonb,$3,'market') RETURNING id",[id,flat(89),marketValueUzs(89)])).id;
  for(let i=0;i<6;i++){
   // Asking for five levels still stops each attribute at the potential of 90.
   const r=await ok(users[0],'POST',path,{playerId:star,attribute:names[i],levels:5});
   assert.equal(r.player.attributes[names[i]],90);assert.equal(r.spentDp,cost);assert.equal(r.player.overall,i<5?89:90);
  }
  const stored=await one('SELECT overall,potential,attributes,market_value_uzs,quality,category FROM players WHERE id=$1',[star]);
  assert.equal(stored.overall,90);assert.equal(stored.potential,90);assert.equal(stored.category,'uzbek_league');
  assert.equal(Number(stored.market_value_uzs),marketValueUzs(90));assert.equal(Number(stored.market_value_uzs),31800000);
  assert.ok(Object.values(stored.attributes).every(v=>v===90));
  const spent=(await one('SELECT development_points FROM clubs WHERE id=$1',[id])).development_points;
  for(const attribute of names){
   const more=await call(users[0],'POST',path,{playerId:star,attribute,levels:5});
   assert.equal(more.status,400);assert.match(more.data.error,/upgrade cap/);
  }
  // A 90-rated player whose attribute is already 99 cannot be raised either.
  await db.query("UPDATE players SET attributes=jsonb_set(jsonb_set(attributes,'{physical}','99'),'{defending}','81') WHERE id=$1",[star]);
  assert.equal((await call(users[0],'POST',path,{playerId:star,attribute:'physical',levels:1})).status,400);
  const end=await one('SELECT overall,potential,attributes FROM players WHERE id=$1',[star]);
  assert.equal(end.overall,90);assert.equal(end.attributes.physical,99);
  assert.equal((await one('SELECT development_points FROM clubs WHERE id=$1',[id])).development_points,spent,'refused upgrades cost nothing');
  assert.equal(Number((await one('SELECT COUNT(*)::int AS n FROM players WHERE overall>90 OR potential>90')).n),0);
  // Money is untouched by upgrades, and removing the test player leaves the squad as it was.
  assert.equal(await budgetOf(0),budget);
  await db.query('DELETE FROM players WHERE id=$1',[star]);
  await assertLedgersConsistent();await assertLineupValid(0);
 });

 await t.test('single-owner super-admin routes enforce identity and audit admin mutations',async()=>{
  const owner=users[0],other=users[1];
  assert.equal((await call(null,'GET','/admin')).status,200);
  assert.equal((await call(null,'GET','/admin.js')).status,200);
  assert.equal((await call(owner,'GET','/api/admin/overview')).status,200);
  assert.equal((await call(other,'GET','/api/admin/overview')).status,403);
  const clubId=clubs[0].id;
  const before=await budgetOf(0);
  const funds=await ok(owner,'POST','/api/admin/funds',{clubId,amountUzs:'123456',reason:'integration admin adjustment'});
  assert.equal(BigInt(funds.budgetUzs),before+123456n);
  assert.equal(Number((await one("SELECT COUNT(*)::int AS n FROM money_ledger WHERE club_id=$1 AND reason='admin_adjustment'",[clubId])).n),1);
  const recipient=(await one("SELECT id FROM game_users WHERE telegram_user_id='dev-2'")).id;
  await ok(owner,'POST','/api/admin/entitlement',{userId:recipient,feature:'gold',active:true,reason:'integration gold grant'});
  assert.ok((await call(other,'GET','/api/account/entitlements')).data.entitlements.some(e=>e.feature==='gold'));
  assert.equal((await one("SELECT revoked_at FROM user_entitlements WHERE user_id=$1 AND feature='gold'",[recipient])).revoked_at,null);
  await ok(owner,'POST','/api/admin/entitlement',{userId:recipient,feature:'gold',active:false,reason:'integration gold revoke'});
  assert.equal((await call(other,'GET','/api/account/entitlements')).data.entitlements.some(e=>e.feature==='gold'),false);
  assert.ok((await one("SELECT revoked_at FROM user_entitlements WHERE user_id=$1 AND feature='gold'",[recipient])).revoked_at);
  await ok(owner,'POST','/api/admin/competition-setting',{key:'integration.reward.top1',value:{uzs:5000000},reason:'integration reward setting'});
  assert.deepEqual((await one("SELECT setting_value FROM competition_settings WHERE setting_key='integration.reward.top1'")).setting_value,{uzs:5000000});
  const giftTarget=(await one('SELECT c.id FROM clubs c WHERE (SELECT COUNT(*) FROM players p WHERE p.club_id=c.id)<26 ORDER BY c.created_at LIMIT 1')).id;
  const giftTargetIndex=clubs.findIndex(c=>c.id===giftTarget);assert.ok(giftTargetIndex>=0);
  const freePlayer=(await one("SELECT id FROM players WHERE club_id IS NULL AND origin='market' ORDER BY id LIMIT 1")).id;
  await ok(owner,'POST','/api/admin/player-gift',{playerId:freePlayer,targetClubId:giftTarget,reason:'integration player gift'});
  assert.equal((await one('SELECT club_id FROM players WHERE id=$1',[freePlayer])).club_id,giftTarget);
  const actions=(await db.query("SELECT action FROM admin_audit_log WHERE actor_telegram_user_id='dev-1' ORDER BY id")).rows.map(x=>x.action);
  assert.ok(actions.includes('funds_adjusted'));assert.ok(actions.includes('gold_granted'));assert.ok(actions.includes('gold_revoked'));assert.ok(actions.includes('setting_updated'));assert.ok(actions.includes('player_gifted'));
  const auditId=(await one('SELECT MIN(id) AS id FROM admin_audit_log')).id;
  await assert.rejects(()=>db.query('UPDATE admin_audit_log SET reason=$2 WHERE id=$1',[auditId,'tamper']),/append-only/);
  assert.equal((await call(owner,'POST','/api/admin/funds',{clubId,amountUzs:'-999999999999999',reason:'negative test'})).status,409);
  assert.equal((await call(owner,'POST','/api/admin/funds',{clubId,amountUzs:'1',reason:''})).status,400);
  await assertLedgersConsistent();await assertLineupValid(giftTargetIndex);
 });
 await t.test('no request or scheduler run produced a server error',()=>{
  for(const log of logs)assert.doesNotMatch(log(),/Error/);
 });
});

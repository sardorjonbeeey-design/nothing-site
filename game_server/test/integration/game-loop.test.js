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
import {upgradeCost,saleValueUzs} from '../../src/economy.js';

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
const users=Array.from({length:12},(_,i)=>({dev:i+1}));
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
  const counts=(await db.query('SELECT (SELECT COUNT(*)::int FROM players) AS players,(SELECT COUNT(*)::int FROM missions) AS missions')).rows[0];
  assert.deepEqual(counts,{players:360,missions:5});
 });

 await t.test('database isolation guard refuses a differently named database',async()=>{
  await assert.rejects(()=>run('src/migrate.js',childEnv({EXPECTED_DATABASE_NAME:'some_other_database'})),/Refusing database connection/);
 });

 await t.test('server starts, is ready and serves the game client',async()=>{
  server=await startServer(childEnv());logs.push(server.log);
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
  assert.equal(created.club.crest_url,up.crestUrl);assert.equal(created.club.budget_uzs,'0');assert.equal(created.club.development_points,0);
  const crest=await fetch(BASE+up.crestUrl);assert.equal(crest.status,200);assert.equal(crest.headers.get('content-type'),'image/png');
  const squad=(await ok(users[0],'GET','/api/clubs/'+clubs[0].id+'/squad')).players;
  assert.equal(squad.length,18);
  const lineup=(await ok(users[0],'GET','/api/clubs/'+clubs[0].id+'/lineup')).lineup;
  assert.equal(lineup.formation,'4-3-3');assert.equal(lineup.starters.length,11);assert.equal(lineup.substitutes.length,7);
  assert.ok(squad.some(p=>p.position==='GK'&&lineup.starters.includes(p.id)));
  const ledger=(await ok(users[0],'GET','/api/clubs/'+clubs[0].id+'/ledger')).transactions;
  assert.equal(ledger.length,1);assert.equal(ledger[0].reason,'club_created');
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
  await ok(users[0],'POST',route,{formation:'4-4-2',starters:lineup.starters,substitutes:lineup.substitutes});
  assert.equal((await ok(users[0],'GET',route)).lineup.formation,'4-4-2');
  await ok(users[0],'POST',route,{formation:'4-3-3',starters:lineup.starters,substitutes:lineup.substitutes});
 });

 await t.test('signing is refused with the provisional 0 UZS opening budget',async()=>{
  const target=(await ok(users[0],'GET','/api/market')).players[0];
  const r=await call(users[0],'POST','/api/clubs/'+clubs[0].id+'/players/sign',{playerId:target.id});
  assert.equal(r.status,400);assert.match(r.data.error,/Insufficient club budget/);
 });


 await t.test('no league exists below 10 clubs',async()=>{
  for(let i=1;i<9;i++)clubs[i]=(await ok(users[i],'POST','/api/clubs',{name:'Integration Club '+(i+1),shortName:'IC'+(i+1),primaryColour:'#225588',secondaryColour:'#ffffff'})).club;
  assert.deepEqual((await ok(users[0],'GET',clubPath(0)+'/league')).table,[]);
  assert.deepEqual((await ok(users[0],'GET',clubPath(0)+'/fixtures')).fixtures,[]);
  assert.deepEqual((await ok(users[0],'GET',clubPath(0)+'/results')).results,[]);
  assert.deepEqual(await ok(users[0],'POST',clubPath(0)+'/leagues/ensure',{}),{leagueId:null,created:false});
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

 await t.test('an 11th club is created but is not placed in the running league (current behaviour)',async()=>{
  clubs[10]=(await ok(users[10],'POST','/api/clubs',{name:'Integration Club 11',shortName:'IC11',primaryColour:'#225588',secondaryColour:'#ffffff'})).club;
  assert.deepEqual((await ok(users[10],'GET',clubPath(10)+'/fixtures')).fixtures,[]);
  assert.deepEqual((await ok(users[10],'GET',clubPath(10)+'/results')),{results:[],unviewedCount:0,timezone:'Asia/Tashkent'});
  assert.equal(Number((await one('SELECT COUNT(*)::int AS n FROM leagues')).n),1);
 });

 await t.test('selling and signing move players and UZS with a consistent ledger',async()=>{
  const id=clubs[0].id,lineup=(await ok(users[0],'GET','/api/clubs/'+id+'/lineup')).lineup;
  const squad=(await ok(users[0],'GET','/api/clubs/'+id+'/squad')).players;
  const sub=squad.find(p=>lineup.substitutes.includes(p.id)&&p.position!=='GK');
  const sold=await ok(users[0],'POST','/api/clubs/'+id+'/players/sell',{playerId:sub.id});
  const fee=saleValueUzs(sub.market_value_uzs);
  assert.equal(sold.budgetUzs,fee.toString());
  assert.equal((await call(users[0],'POST','/api/clubs/'+id+'/players/sell',{playerId:sub.id})).status,404);
  const after=(await ok(users[0],'GET','/api/clubs/'+id+'/lineup')).lineup;
  assert.ok(!after.substitutes.includes(sub.id));assert.equal(after.starters.length,11);
  assert.equal((await ok(users[0],'GET','/api/clubs/'+id+'/squad')).players.length,17);
  const market=(await ok(users[0],'GET','/api/market')).players;
  assert.ok(market.some(p=>p.id===sub.id),'sold player returns to the free-agent market');
  const target=market.find(p=>p.id!==sub.id&&BigInt(p.market_value_uzs)<=fee);
  assert.ok(target,'an affordable free agent exists');
  const signed=await ok(users[0],'POST','/api/clubs/'+id+'/players/sign',{playerId:target.id});
  assert.equal(signed.budgetUzs,(fee-BigInt(target.market_value_uzs)).toString());
  assert.equal((await call(users[1],'POST','/api/clubs/'+clubs[1].id+'/players/sign',{playerId:target.id})).status,404);
  assert.equal((await ok(users[0],'GET','/api/clubs/'+id+'/squad')).players.length,18);
  const club=(await ok(users[0],'GET','/api/clubs/'+id)).club;
  const ledger=(await ok(users[0],'GET','/api/clubs/'+id+'/ledger')).transactions;
  assert.deepEqual(ledger.map(x=>x.reason).sort(),['club_created','player_sale','player_signing']);
  assert.equal(ledger.reduce((sum,x)=>sum+BigInt(x.amount_uzs),0n).toString(),club.budget_uzs);
  assert.equal(club.budget_uzs,signed.budgetUzs);
 });

 await t.test('upgrades are refused without Development Points',async()=>{
  const p=(await ok(users[0],'GET','/api/clubs/'+clubs[0].id+'/squad')).players[0];
  const r=await call(users[0],'POST','/api/clubs/'+clubs[0].id+'/players/upgrade',{playerId:p.id,attribute:'pace',levels:1});
  assert.equal(r.status,400);assert.match(r.data.error,/Not enough development points/);
  assert.equal((await call(users[0],'POST','/api/clubs/'+clubs[0].id+'/players/upgrade',{playerId:p.id,attribute:'luck',levels:1})).status,400);
 });


 const playedCount=async(where="kind='league'")=>Number((await one("SELECT COUNT(*)::int AS n FROM fixtures WHERE status='played' AND "+where)).n);
 const snapshot=async()=>JSON.stringify((await db.query('SELECT lm.*,c.development_points,(SELECT json_agg(m.progress ORDER BY m.mission_id) FROM club_missions m WHERE m.club_id=c.id) AS missions FROM league_members lm JOIN clubs c ON c.id=lm.club_id ORDER BY lm.club_id')).rows);

 await t.test('users cannot start, accelerate, replay or settle a league match',async()=>{
  const first=(await ok(users[0],'GET',clubPath(0)+'/fixtures')).fixtures.find(f=>f.kind==='league');
  for(const [method,route] of [['POST','/api/fixtures/'+first.id+'/play'],['POST','/api/fixtures/'+first.id+'/settle'],['POST',clubPath(0)+'/fixtures'],['POST',clubPath(0)+'/fixtures/'+first.id+'/play'],['PUT','/api/fixtures/'+first.id],['POST',clubPath(0)+'/results'],['DELETE','/api/fixtures/'+first.id]]){
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
  server2.child.kill();server2=null;
 });

 await t.test('matches missed during downtime are settled in kick-off order when the server starts',async()=>{
  server.child.kill();await sleep(300);
  await db.query("UPDATE fixtures SET kickoff_at=NOW()-make_interval(hours=>(6-day_number)) WHERE kind='league' AND day_number IN (3,4,5)");
  await sleep(500);
  assert.equal(await playedCount(),10,'nothing is settled while no server is running');
  server=await startServer(childEnv());logs.push(server.log);
  await waitFor(async()=>await playedCount()===25,'catch-up settlement');
  const order=(await db.query("SELECT day_number FROM fixtures WHERE kind='league' AND day_number IN (3,4,5) ORDER BY played_at,kickoff_at")).rows.map(r=>r.day_number);
  assert.deepEqual(order,order.slice().sort((a,b)=>a-b));
  assert.ok((await ok(users[0],'GET',clubPath(0)+'/league')).table.every(r=>r.played===5));
 });

 await t.test('a friendly is settled by the scheduler without touching standings, DP or missions; stale requests expire',async()=>{
  const stale=await ok(users[8],'POST',clubPath(8)+'/friendlies',{opponentClubId:clubs[9].id,kickoffAt:inMinutes(30)});
  const before=await snapshot();
  await db.query("UPDATE friendly_requests SET proposed_kickoff_at=NOW()-interval '1 minute' WHERE id=$1",[stale.request.id]);
  await db.query("UPDATE fixtures SET kickoff_at=NOW()-interval '61 seconds' WHERE id=$1",[friendlyB.id]);
  await waitFor(async()=>await playedCount("kind='friendly'")===1,'friendly settlement');
  await waitFor(async()=>(await one('SELECT status FROM friendly_requests WHERE id=$1',[stale.request.id])).status==='expired','request expiry');
  assert.equal((await call(users[9],'POST',clubPath(9)+'/friendlies/'+stale.request.id+'/accept',{})).status,409);
  assert.equal(await snapshot(),before);
  const f=await one('SELECT * FROM fixtures WHERE id=$1',[friendlyB.id]);
  assert.equal(f.league_id,null);assert.equal(f.events.filter(e=>e.type==='goal').length,f.home_goals+f.away_goals);
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

 await t.test('the whole season is settled automatically, the table is consistent and the league completes',async()=>{
  await db.query("UPDATE fixtures SET kickoff_at=kickoff_at-interval '40 days' WHERE kind='league' AND status='scheduled'");
  await waitFor(async()=>await playedCount()===90,'season settlement',40000);
  const played=await one("SELECT SUM(home_goals)::int AS hg,SUM(away_goals)::int AS ag FROM fixtures WHERE status='played' AND kind='league'");
  const table=(await ok(users[0],'GET',clubPath(0)+'/league')).table;
  assert.equal(table.length,10);
  for(const r of table){assert.equal(r.played,18);assert.equal(r.wins+r.draws+r.losses,18);assert.equal(r.points,r.wins*3+r.draws);}
  const sum=k=>table.reduce((n,r)=>n+r[k],0);
  assert.equal(sum('wins'),sum('losses'));assert.equal(sum('draws')%2,0);
  assert.equal(sum('goals_for'),sum('goals_against'));assert.equal(sum('goals_for'),played.hg+played.ag);
  assert.deepEqual(table.map(r=>r.points),table.map(r=>r.points).slice().sort((a,b)=>b-a));
  const order=(await db.query("SELECT day_number FROM fixtures WHERE kind='league' AND day_number>6 ORDER BY played_at,kickoff_at")).rows.map(r=>r.day_number);
  assert.deepEqual(order,order.slice().sort((a,b)=>a-b),'matchdays are settled in order');
  await waitFor(async()=>(await one('SELECT status FROM leagues')).status==='completed','league completion',3000);
  assert.ok((await one('SELECT completed_at FROM leagues')).completed_at);
  await ok(users[0],'POST',clubPath(0)+'/leagues/ensure',{});
  assert.equal(Number((await one('SELECT COUNT(*)::int AS n FROM leagues')).n),1,'no second season is created (not designed yet)');
  assert.equal(Number((await one("SELECT COUNT(*)::int AS n FROM fixtures WHERE kind='league'")).n),90);
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


 await t.test('no request or scheduler run produced a server error',()=>{
  for(const log of logs)assert.doesNotMatch(log(),/Error/);
 });
});

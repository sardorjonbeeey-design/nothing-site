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
  SESSION_SECRET:'local-integration-session-secret-0123456789',TELEGRAM_BOT_TOKEN:FAKE_BOT_TOKEN,PORT:String(PORT),...extra};
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
let server,db;

test('complete game loop against isolated local PostgreSQL',{skip:DB_URL?false:'INTEGRATION_DATABASE_URL is not set'},async t=>{
 assertLocalDatabase();
 db=new pg.Pool({connectionString:DB_URL,max:2});
 t.after(async()=>{
  server?.child.kill();
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
  server=await startServer(childEnv());
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

 await t.test('no league exists below 10 clubs; it is created with the 10th club',async()=>{
  for(let i=1;i<9;i++)clubs[i]=(await ok(users[i],'POST','/api/clubs',{name:'Integration Club '+(i+1),shortName:'IC'+(i+1),primaryColour:'#225588',secondaryColour:'#ffffff'})).club;
  assert.deepEqual((await ok(users[0],'GET','/api/clubs/'+clubs[0].id+'/league')).table,[]);
  assert.deepEqual((await ok(users[0],'GET','/api/clubs/'+clubs[0].id+'/fixtures')).fixtures,[]);
  assert.deepEqual(await ok(users[0],'POST','/api/clubs/'+clubs[0].id+'/leagues/ensure',{}),{leagueId:null,created:false});
  clubs[9]=(await ok(users[9],'POST','/api/clubs',{name:'Integration Club 10',shortName:'IC10',primaryColour:'#225588',secondaryColour:'#ffffff'})).club;
  const table=(await ok(users[0],'GET','/api/clubs/'+clubs[0].id+'/league')).table;
  assert.equal(table.length,10);assert.ok(table.every(r=>r.played===0&&r.points===0));
  const all=new Set();
  for(let i=0;i<10;i++){
   const fixtures=(await ok(users[i],'GET','/api/clubs/'+clubs[i].id+'/fixtures')).fixtures;
   assert.equal(fixtures.length,9);assert.deepEqual(fixtures.map(f=>f.round_number),[1,2,3,4,5,6,7,8,9]);
   fixtures.forEach(f=>all.add(f.id));
  }
  assert.equal(all.size,45);
  assert.equal(Number((await db.query('SELECT COUNT(*)::int AS n FROM leagues')).rows[0].n),1);
 });

 await t.test('an 11th club is created but is not placed in the running league (current behaviour)',async()=>{
  clubs[10]=(await ok(users[10],'POST','/api/clubs',{name:'Integration Club 11',shortName:'IC11',primaryColour:'#225588',secondaryColour:'#ffffff'})).club;
  assert.deepEqual((await ok(users[10],'GET','/api/clubs/'+clubs[10].id+'/fixtures')).fixtures,[]);
  assert.equal(Number((await db.query('SELECT COUNT(*)::int AS n FROM leagues')).rows[0].n),1);
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

 await t.test('fixtures can only be played by a participating owner and settle exactly once',async()=>{
  const fixtures=(await ok(users[0],'GET','/api/clubs/'+clubs[0].id+'/fixtures')).fixtures,first=fixtures[0];
  assert.equal((await call(users[10],'POST','/api/fixtures/'+first.id+'/play',{})).status,403);
  assert.equal((await call(null,'POST','/api/fixtures/'+first.id+'/play',{})).status,401);
  assert.equal((await call(users[0],'POST','/api/fixtures/'+crypto.randomUUID()+'/play',{})).status,404);
  const opponent=users[clubs.findIndex(c=>c.id===(first.home_club_id===clubs[0].id?first.away_club_id:first.home_club_id))];
  const [a,b]=await Promise.all([call(users[0],'POST','/api/fixtures/'+first.id+'/play',{}),call(opponent,'POST','/api/fixtures/'+first.id+'/play',{})]);
  const settled=[a,b].filter(r=>r.status===200&&r.data.simulation);
  assert.equal(settled.length,1,'exactly one concurrent request settles the fixture');
  const result=settled[0].data;
  assert.equal(result.fixture.status,'played');
  assert.equal(result.simulation.events.filter(e=>e.type==='goal').length,result.fixture.home_goals+result.fixture.away_goals);
  const again=await ok(users[0],'POST','/api/fixtures/'+first.id+'/play',{});
  assert.equal(again.alreadyPlayed,true);
  assert.equal(again.fixture.home_goals,result.fixture.home_goals);assert.equal(again.fixture.away_goals,result.fixture.away_goals);
  const dp=(await ok(users[0],'GET','/api/clubs/'+clubs[0].id+'/development-ledger')).transactions;
  assert.equal(dp.filter(x=>x.reason==='match_reward').length,1,'match reward is paid once');
 });

 await t.test('the whole season can be played and the table is consistent',async()=>{
  for(let i=0;i<10;i++){
   const fixtures=(await ok(users[i],'GET','/api/clubs/'+clubs[i].id+'/fixtures')).fixtures;
   for(const f of fixtures.filter(x=>x.status==='scheduled'))await ok(users[i],'POST','/api/fixtures/'+f.id+'/play',{});
  }
  const played=(await db.query("SELECT COUNT(*)::int AS n,SUM(home_goals)::int AS hg,SUM(away_goals)::int AS ag FROM fixtures WHERE status='played'")).rows[0];
  assert.equal(played.n,45);
  const table=(await ok(users[0],'GET','/api/clubs/'+clubs[0].id+'/league')).table;
  assert.equal(table.length,10);
  for(const r of table){assert.equal(r.played,9);assert.equal(r.wins+r.draws+r.losses,9);assert.equal(r.points,r.wins*3+r.draws);}
  const sum=k=>table.reduce((n,r)=>n+r[k],0);
  assert.equal(sum('wins'),sum('losses'));assert.equal(sum('draws')%2,0);
  assert.equal(sum('goals_for'),sum('goals_against'));assert.equal(sum('goals_for'),played.hg+played.ag);
  assert.deepEqual(table.map(r=>r.points),table.map(r=>r.points).slice().sort((a,b)=>b-a));
 });

 await t.test('matches and missions award Development Points with a consistent ledger',async()=>{
  for(let i=0;i<10;i++){
   const id=clubs[i].id,club=(await ok(users[i],'GET','/api/clubs/'+id)).club;
   const missions=(await ok(users[i],'GET','/api/clubs/'+id+'/missions')).missions;
   const byId=Object.fromEntries(missions.map(m=>[m.id,m]));
   assert.ok(byId.play_1.completed_at);assert.ok(byId.play_3.completed_at);
   const expected=18+missions.filter(m=>m.completed_at).reduce((n,m)=>n+m.reward_dp,0);
   assert.equal(club.development_points,expected);
   const total=(await db.query('SELECT COALESCE(SUM(amount_dp),0)::int AS n,COUNT(*) FILTER (WHERE reason=\'match_reward\')::int AS matches FROM development_ledger WHERE club_id=$1',[id])).rows[0];
   assert.equal(total.n,club.development_points);assert.equal(total.matches,9);
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

 await t.test('no request during the run produced a server error',()=>{
  assert.doesNotMatch(server.log(),/Error/);
 });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {ownerActivity,leagueStandings,payCompletedSeasonPrizes,SEASON_PRIZES_UZS} from '../src/competition.js';

test('owner inactivity warning thresholds are 24h and 46h, forfeiture at 48h',async()=>{
 for(const [idle,warning,inactive] of [[23*3600,null,false],[24*3600,24,false],[46*3600,2,false],[48*3600,null,true]]){
  const client={query:async(_sql)=>({rows:[{last_activity_at:'2026-01-01T00:00:00.000Z',idle_seconds:String(idle)}]})};
  const status=await ownerActivity(client,'club-id');
  assert.equal(status.warningLevel,warning);assert.equal(status.inactive,inactive);
 }
 const neverActive={query:async()=>({rows:[{last_activity_at:null,idle_seconds:null}]})};
 assert.equal((await ownerActivity(neverActive,'club-id')).inactive,true);
});

test('league standings query applies the approved tie-break order',async()=>{
 let sql='';
 const client={query:async(q)=>{sql=q;return {rows:[]};}};
 await leagueStandings(client,'league-id');
 assert.match(sql,/ORDER BY g\.points DESC,g\.goal_difference DESC,g\.goals_for DESC/);
 assert.match(sql,/h2h_points/);
 assert.match(sql,/h2h_goal_difference/);
});

function prizeClient(standingRows){
 const payments=new Map(),balances=new Map(),ledger=[];
 return {
  payments,balances,ledger,
  async query(sql,params=[]){
   if(sql.startsWith('SELECT id FROM leagues WHERE status'))return {rows:[{id:'league-1'}]};
   if(sql.includes('WITH base AS'))return {rows:standingRows};
   if(sql.startsWith('INSERT INTO season_prize_payments')){
    const key=params[0]+':'+params[1];if(payments.has(key))return {rowCount:0,rows:[]};
    payments.set(key,{place:params[2],amount:BigInt(params[3])});return {rowCount:1,rows:[{club_id:params[1]}]};
   }
   if(sql.startsWith('UPDATE clubs SET budget_uzs=budget_uzs+$2')){
    const amount=BigInt(params[1]),id=params[0];balances.set(id,(balances.get(id)||0n)+amount);return {rows:[{budget_uzs:String(balances.get(id))}]};
   }
   if(sql.startsWith('INSERT INTO money_ledger')){ledger.push({clubId:params[0],amount:BigInt(params[1]),reason:'season_prize'});return {rowCount:1,rows:[]};}
   throw new Error('Unexpected SQL in prize test: '+sql);
  }
 };
}
const row=(id,points=0,gd=0,gf=0,hp=0,hgd=0)=>({club_id:id,points,goal_difference:gd,goals_for:gf,h2h_points:hp,h2h_goal_difference:hgd});

test('four clubs tied for first split all top-three prize money equally and only once',async()=>{
 const client=prizeClient([row('a',30,10,40,6,2),row('b',30,10,40,6,2),row('c',30,10,40,6,2),row('d',30,10,40,6,2),row('e',20,0,20)]);
 assert.deepEqual(SEASON_PRIZES_UZS,[10000000n,7000000n,5000000n]);
 assert.equal(await payCompletedSeasonPrizes(client),4);
 assert.deepEqual([...client.payments.values()].map(x=>x.amount),[5500000n,5500000n,5500000n,5500000n]);
 assert.ok([...client.payments.values()].every(x=>x.place===1));
 assert.equal(client.ledger.reduce((n,x)=>n+x.amount,0n),22000000n);
 assert.equal(await payCompletedSeasonPrizes(client),0,'repeat settlement cannot pay the same season twice');
 assert.equal(client.ledger.length,4);
});

test('clubs tied for second and third split the combined 12M prize pool',async()=>{
 const client=prizeClient([row('first',40,15,50,0,0),row('second',30,8,40,4,2),row('third',30,8,40,4,2),row('fourth',20,0,25,0,0)]);
 assert.equal(await payCompletedSeasonPrizes(client),3);
 assert.equal(client.payments.get('league-1:first').amount,10000000n);
 assert.equal(client.payments.get('league-1:second').amount,6000000n);
 assert.equal(client.payments.get('league-1:third').amount,6000000n);
 assert.equal(client.payments.get('league-1:second').place,2);
 assert.equal(client.payments.get('league-1:third').place,2);
});

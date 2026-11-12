import {requireDb,assertIsolatedDatabase} from './db.js';
import {starterPlayers} from './catalog.js';
import {insertPlayer,ensureYouthSupply} from './players.js';
const db=requireDb();
try{
 await assertIsolatedDatabase(db);
 const client=await db.connect();
 try{
  await client.query('BEGIN');
  for(const p of starterPlayers){
   // A catalogue row created before catalogue keys existed is adopted, not duplicated.
   await client.query("UPDATE players SET catalog_key=$1 WHERE catalog_key IS NULL AND origin='market' AND id=(SELECT id FROM players WHERE full_name=$2 AND catalog_key IS NULL AND origin='market' ORDER BY created_at LIMIT 1) AND NOT EXISTS(SELECT 1 FROM players WHERE catalog_key=$1)",[p.catalogKey,p.fullName]);
   await insertPlayer(client,p);
  }
  await ensureYouthSupply(client);
  await client.query('COMMIT');
 }catch(error){await client.query('ROLLBACK');throw error;}
 finally{client.release();}
 const missions=[
  ['play_1','First appearance','Complete one match','matches_played',1,5,'season'],
  ['win_2','Two wins','Win two matches','wins',2,12,'season'],
  ['score_5','Find the net','Score five goals','goals_scored',5,8,'season'],
  ['play_3','Regular competitor','Complete three matches','matches_played',3,10,'season'],
  ['clean_sheet','Shutout','Keep a clean sheet','clean_sheets',1,8,'season']
 ];
 for(const m of missions)await db.query('INSERT INTO missions(id,title,description,metric,target,reward_dp,cadence) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO NOTHING',m);
 console.log('Seeded fictional free agents and mission templates.');
}finally{await db.end();}

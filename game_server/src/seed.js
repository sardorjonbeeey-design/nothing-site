import {requireDb,assertIsolatedDatabase} from './db.js';
import {starterPlayers} from './catalog.js';
const db=requireDb();
try{
 await assertIsolatedDatabase(db);
 for(const p of starterPlayers){
  await db.query('INSERT INTO players(club_id,full_name,nationality,age,position,quality,overall,potential,attributes,market_value_uzs) SELECT NULL,$1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9 WHERE NOT EXISTS(SELECT 1 FROM players WHERE full_name=$1)',
  [p.fullName,p.nationality,p.age,p.position,p.quality,p.overall,p.potential,JSON.stringify(p.attributes),p.marketValueUzs]);
 }
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

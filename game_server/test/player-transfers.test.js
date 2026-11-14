import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlayerListing,purchasePlayerListing,browsePlayerListings,cancelPlayerListing} from '../src/player-transfers.js';

const forbiddenDb={query(){throw new Error('Database should not be touched for rejected input');}};

test('listing price rejects zero, negative, fractional, and malformed UZS values before DB access',async()=>{
 for(const askingPriceUzs of ['0','-1','1.5','abc','',null]){
  await assert.rejects(createPlayerListing(forbiddenDb,{clubId:'club',userId:'user',playerId:'player',askingPriceUzs}),{status:400});
 }
});

test('listing price accepts a positive integer UZS string and proceeds to ownership lookup',async()=>{
 let querySeen=false;
 const db={query:async(sql)=>{
  querySeen=true;
  if(sql.includes("FROM player_transfer_listings WHERE player_id=$1 AND status='listed'"))return {rowCount:0,rows:[]};
  assert.match(sql,/SELECT id,owner_user_id,budget_uzs FROM clubs/);
  return {rowCount:0,rows:[]};
 }};
 await assert.rejects(createPlayerListing(db,{clubId:'club',userId:'user',playerId:'player',askingPriceUzs:'1250000'}),{status:404});
 assert.equal(querySeen,true);
});

test('purchase rejects an already closed listing without locking or changing clubs',async()=>{
 let calls=0;
 const db={query:async(sql)=>{
  calls++;
  assert.match(sql,/SELECT \* FROM player_transfer_listings WHERE id=\$1 FOR UPDATE/);
  return {rowCount:1,rows:[{id:'listing',status:'sold',seller_club_id:'seller',buyer_club_id:'buyer',player_id:'player',asking_price_uzs:'1000'}]};
 }};
 await assert.rejects(purchasePlayerListing(db,{buyerClubId:'buyer',userId:'buyer-owner',listingId:'listing'}),{status:409});
 assert.equal(calls,1);
});

test('browse limits page size and offset to bounded values',async()=>{
 let params;
 const db={query:async(_sql,p)=>{params=p;return {rows:[]};}};
 assert.deepEqual(await browsePlayerListings(db,{limit:1000,offset:-4}),[]);
 assert.deepEqual(params,[100,0]);
});

test('cancel only targets a listed item belonging to the seller',async()=>{
 let updateSql,updateParams;
 const db={query:async(sql,p)=>{
  if(sql.includes('SELECT id,seller_club_id,status FROM player_transfer_listings WHERE id=$1 FOR UPDATE'))return {rowCount:1,rows:[{id:'listing',seller_club_id:'club',status:'listed'}]};
  if(sql.includes('SELECT id,owner_user_id,budget_uzs FROM clubs'))return {rowCount:1,rows:[{id:'club',owner_user_id:'owner',budget_uzs:'100'}]};
  updateSql=sql;updateParams=p;return {rowCount:0,rows:[]};
 }};
 await assert.rejects(cancelPlayerListing(db,{clubId:'club',userId:'owner',listingId:'listing'}),{status:409});
 assert.match(updateSql,/seller_club_id=\$2 AND status='listed'/);
 assert.deepEqual(updateParams,['listing','club']);
});

test('purchase transfers ownership and records paired ledger entries and history in one transaction',async()=>{
 const listing={id:'listing-1',status:'listed',seller_club_id:'seller',player_id:'listed-player',asking_price_uzs:'2500000'};
 const clubs=[{id:'buyer',owner_user_id:'buyer-owner',budget_uzs:'5000000'},{id:'seller',owner_user_id:'seller-owner',budget_uzs:'1000000'}];
 const sellerXI=['seller-gk','seller-cb','seller-lb','seller-rb','seller-dm','seller-cm','seller-am','seller-lw','seller-rw','listed-player','seller-st'];
 const buyerXI=['buyer-gk','buyer-cb','buyer-lb','buyer-rb','buyer-dm','buyer-cm','buyer-am','buyer-lw','buyer-rw','buyer-st','buyer-st2'];
 const sellerPlayers=[...sellerXI.filter(id=>id!=='listed-player'),...Array.from({length:7},(_,i)=>'seller-bench-'+i)].map((id,i)=>({id,position:id.includes('gk')?'GK':id.includes('cb')?'CB':id.includes('lb')?'LB':id.includes('rb')?'RB':id.includes('dm')?'DM':id.includes('cm')?'CM':id.includes('am')?'AM':id.includes('lw')?'LW':id.includes('rw')?'RW':'ST',overall:60,full_name:id}));
 const buyerPlayers=[...buyerXI,...Array.from({length:7},(_,i)=>'buyer-bench-'+i),'listed-player'].map(id=>({id,position:id.includes('gk')?'GK':id.includes('cb')?'CB':id.includes('lb')?'LB':id.includes('rb')?'RB':id.includes('dm')?'DM':id.includes('cm')?'CM':id.includes('am')?'AM':id.includes('lw')?'LW':id.includes('rw')?'RW':'ST',overall:60,full_name:id}));
 const lineups={seller:{formation:'4-3-3',starters:sellerXI,substitutes:Array.from({length:7},(_,i)=>'seller-bench-'+i)},buyer:{formation:'4-3-3',starters:buyerXI,substitutes:Array.from({length:7},(_,i)=>'buyer-bench-'+i)}};
 const seen=[];
 const db={query:async(sql,p=[])=>{
  seen.push(sql);
  if(sql.includes('FROM player_transfer_listings WHERE id=$1 FOR UPDATE'))return {rowCount:1,rows:[listing]};
  if(sql.includes('SELECT id,owner_user_id,budget_uzs FROM clubs WHERE id=ANY'))return {rowCount:2,rows:clubs};
  if(sql.includes('SELECT id,club_id,position,full_name FROM players WHERE id=$1 FOR UPDATE'))return {rowCount:1,rows:[{id:'listed-player',club_id:'seller',position:'ST',full_name:'Listed Player'}]};
  if(sql.includes('SELECT COUNT(*)::int AS count FROM players WHERE club_id=$1'))return {rowCount:1,rows:[{count:p[0]==='buyer'?17:18}]};
  if(sql.includes('UPDATE player_transfer_listings SET status=\'sold\''))return {rowCount:1,rows:[{id:'listing-1'}]};
  if(sql.includes('UPDATE players SET club_id=$2,first_sale_done=TRUE WHERE id=$1 AND club_id=$3'))return {rowCount:1,rows:[{}]};
  if(sql.includes('SELECT formation,starters,substitutes FROM lineups WHERE club_id=$1 FOR UPDATE'))return {rowCount:1,rows:[lineups[p[0]]]};
  if(sql.includes('SELECT id,position,overall,full_name FROM players WHERE club_id=$1'))return {rowCount:1,rows:[...(p[0]==='seller'?sellerPlayers:buyerPlayers)]};
  if(sql.includes('INSERT INTO money_ledger'))return {rowCount:2,rows:[]};
  if(sql.includes('INSERT INTO player_transfer_history'))return {rowCount:1,rows:[]};
  if(sql.includes('UPDATE lineups SET starters=$2'))return {rowCount:1,rows:[]};
  return {rowCount:1,rows:[]};
 }};
 const result=await purchasePlayerListing(db,{buyerClubId:'buyer',userId:'buyer-owner',listingId:'listing-1'});
 assert.equal(result.priceUzs,'2500000');
 assert.equal(result.buyerBalanceUzs,'2500000');
 assert.equal(result.sellerBalanceUzs,'3500000');
 assert.ok(seen.some(sql=>sql.includes('INSERT INTO money_ledger')));
 assert.ok(seen.some(sql=>sql.includes('INSERT INTO player_transfer_history')));
 assert.ok(seen.some(sql=>sql.includes('UPDATE players SET club_id=$2,first_sale_done=TRUE WHERE id=$1 AND club_id=$3')));
});

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
  if(sql.includes('SELECT id,owner_user_id,budget_uzs FROM clubs'))return {rowCount:1,rows:[{id:'club',owner_user_id:'owner',budget_uzs:'100'}]};
  updateSql=sql;updateParams=p;return {rowCount:0,rows:[]};
 }};
 await assert.rejects(cancelPlayerListing(db,{clubId:'club',userId:'owner',listingId:'listing'}),{status:404});
 assert.match(updateSql,/seller_club_id=\$2 AND status='listed'/);
 assert.deepEqual(updateParams,['listing','club']);
});

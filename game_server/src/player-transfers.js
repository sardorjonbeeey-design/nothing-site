import {HttpError} from './http.js';
import {MIN_SQUAD_SIZE,MAX_SQUAD_SIZE} from './economy.js';

// All operations use caller-supplied authenticated userId and a transaction-capable DB client.
// Route handlers must wrap each function in inTransaction(...) and must not trust client-sent ownership.
const positiveUzs=value=>{
 if(typeof value!=='string'&&!Number.isSafeInteger(value))throw new HttpError(400,'Asking price must be an integer UZS amount');
 const text=String(value);
 if(!/^\\d{1,18}$/.test(text)||BigInt(text)<=0n)throw new HttpError(400,'Asking price must be a positive integer UZS amount');
 return text;
};
async function ownedClub(client,clubId,userId,lock=false){
 const r=await client.query('SELECT id,owner_user_id,budget_uzs FROM clubs WHERE id=$1 AND owner_user_id=$2'+(lock?' FOR UPDATE':''),[clubId,userId]);
 if(!r.rowCount)throw new HttpError(404,'Club not found');
 return r.rows[0];
}
async function squadCount(client,clubId){
 return Number((await client.query('SELECT COUNT(*)::int AS count FROM players WHERE club_id=$1',[clubId])).rows[0].count);
}
async function keeperCount(client,clubId){
 return Number((await client.query("SELECT COUNT(*)::int AS count FROM players WHERE club_id=$1 AND position='GK'",[clubId])).rows[0].count);
}

export async function createPlayerListing(client,{clubId,userId,playerId,askingPriceUzs}){
 const price=positiveUzs(askingPriceUzs);
 const seller=await ownedClub(client,clubId,userId,true);
 const p=(await client.query('SELECT id,club_id,position,full_name FROM players WHERE id=$1 AND club_id=$2 FOR UPDATE',[playerId,clubId])).rows[0];
 if(!p)throw new HttpError(404,'Player not found in your club');
 if(await squadCount(client,clubId)<=MIN_SQUAD_SIZE)throw new HttpError(400,'A club must keep at least '+MIN_SQUAD_SIZE+' players');
 if(p.position==='GK'&&await keeperCount(client,clubId)<=1)throw new HttpError(400,'A club must keep at least one goalkeeper');
 const r=await client.query("INSERT INTO player_transfer_listings(player_id,seller_club_id,asking_price_uzs) VALUES($1,$2,$3) ON CONFLICT(player_id) WHERE status='listed' DO NOTHING RETURNING *",[playerId,clubId,price]);
 if(!r.rowCount)throw new HttpError(409,'Player already has an active listing');
 return {listing:r.rows[0],sellerClubId:seller.id};
}

export async function browsePlayerListings(client,{limit=50,offset=0}={}){
 const safeLimit=Math.max(1,Math.min(100,Number(limit)||50)),safeOffset=Math.max(0,Math.min(100000,Number(offset)||0));
 const r=await client.query("SELECT l.id AS listing_id,l.asking_price_uzs,l.listed_at,p.id AS player_id,p.full_name,p.nationality,p.age,p.position,p.quality,p.overall,p.potential,p.market_value_uzs,p.attributes,s.id AS seller_club_id,s.name AS seller_club_name,s.short_name AS seller_short_name,s.primary_colour AS seller_colour FROM player_transfer_listings l JOIN players p ON p.id=l.player_id JOIN clubs s ON s.id=l.seller_club_id WHERE l.status='listed' AND p.club_id=l.seller_club_id ORDER BY l.listed_at,l.id LIMIT $1 OFFSET $2",[safeLimit,safeOffset]);
 return r.rows;
}

export async function cancelPlayerListing(client,{clubId,userId,listingId}){
 await ownedClub(client,clubId,userId,true);
 const r=await client.query("UPDATE player_transfer_listings SET status='cancelled',closed_at=NOW() WHERE id=$1 AND seller_club_id=$2 AND status='listed' RETURNING *",[listingId,clubId]);
 if(!r.rowCount)throw new HttpError(404,'Active listing not found');
 return r.rows[0];
}

export async function purchasePlayerListing(client,{buyerClubId,userId,listingId}){
 // Lock listing first, then both clubs in sorted ID order to serialize concurrent purchases
 // and avoid deadlocks between opposite-direction transfers.
 const listing=(await client.query("SELECT * FROM player_transfer_listings WHERE id=$1 FOR UPDATE",[listingId])).rows[0];
 if(!listing||listing.status!=='listed')throw new HttpError(409,'Listing is no longer available');
 if(listing.seller_club_id===buyerClubId)throw new HttpError(400,'A club cannot buy its own player');
 const ids=[listing.seller_club_id,buyerClubId].sort();
 const clubs=(await client.query('SELECT id,owner_user_id,budget_uzs FROM clubs WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',[ids])).rows;
 if(clubs.length!==2)throw new HttpError(404,'Seller or buyer club not found');
 const buyer=clubs.find(c=>c.id===buyerClubId);
 const seller=clubs.find(c=>c.id===listing.seller_club_id);
 if(!buyer||buyer.owner_user_id!==userId)throw new HttpError(404,'Buyer club not found');
 const player=(await client.query('SELECT id,club_id,position,full_name FROM players WHERE id=$1 FOR UPDATE',[listing.player_id])).rows[0];
 if(!player||player.club_id!==listing.seller_club_id)throw new HttpError(409,'Listing is stale: player ownership changed');
 const buyerCount=await squadCount(client,buyerClubId),sellerCount=await squadCount(client,listing.seller_club_id);
 if(buyerCount>=MAX_SQUAD_SIZE)throw new HttpError(400,'A club cannot have more than '+MAX_SQUAD_SIZE+' players');
 if(sellerCount<=MIN_SQUAD_SIZE)throw new HttpError(400,'Seller must keep at least '+MIN_SQUAD_SIZE+' players');
 if(player.position==='GK'&&await keeperCount(client,listing.seller_club_id)<=1)throw new HttpError(400,'Seller must keep at least one goalkeeper');
 const price=BigInt(listing.asking_price_uzs),buyerBalance=BigInt(buyer.budget_uzs),sellerBalance=BigInt(seller.budget_uzs);
 if(buyerBalance<price)throw new HttpError(400,'Buyer club cannot afford this player');
 // Close listing before changing player.club_id; both writes and all ledger/history records commit together.
 const closed=await client.query("UPDATE player_transfer_listings SET status='sold',closed_at=NOW(),buyer_club_id=$2 WHERE id=$1 AND status='listed' RETURNING id",[listingId,buyerClubId]);
 if(!closed.rowCount)throw new HttpError(409,'Listing was purchased by another club');
 await client.query('UPDATE clubs SET budget_uzs=budget_uzs-$2 WHERE id=$1',[buyerClubId,price.toString()]);
 await client.query('UPDATE clubs SET budget_uzs=budget_uzs+$2 WHERE id=$1',[listing.seller_club_id,price.toString()]);
 await client.query('UPDATE players SET club_id=$2 WHERE id=$1 AND club_id=$3',[player.id,buyerClubId,listing.seller_club_id]);
 const buyerAfter=(buyerBalance-price).toString(),sellerAfter=(sellerBalance+price).toString();
 await client.query("INSERT INTO money_ledger(club_id,amount_uzs,balance_after_uzs,reason,reference_id) VALUES($1,$2,$3,'player_transfer_purchase',$4),($5,$6,$7,'player_transfer_sale',$4)",[buyerClubId,(-price).toString(),buyerAfter,player.id,listing.seller_club_id,price.toString(),sellerAfter]);
 await client.query('INSERT INTO player_transfer_history(listing_id,player_id,seller_club_id,buyer_club_id,price_uzs) VALUES($1,$2,$3,$4,$5)',[listingId,player.id,listing.seller_club_id,buyerClubId,price.toString()]);
 return {listingId,playerId:player.id,playerName:player.full_name,priceUzs:price.toString(),buyerBalanceUzs:buyerAfter,sellerBalanceUzs:sellerAfter};
}

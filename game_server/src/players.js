// Player rows created by the server itself: academy squads and the standing supply of generated youth players.
import {youthSlots,generateYouthPlayer,YOUTH_MIN_OVERALL,YOUTH_MAX_OVERALL} from './catalog.js';
import {ratingProfileFor,assertValidRating,DEFAULT_CATEGORY} from './ratings.js';
const YOUTH_LOCK=8111002;
export async function insertPlayer(client,p,clubId=null){
 const category=p.category||DEFAULT_CATEGORY;
 // The rating profile is checked here and again by the database trigger.
 assertValidRating(p,ratingProfileFor(category));
 const r=await client.query('INSERT INTO players(club_id,full_name,nationality,age,position,quality,overall,potential,attributes,market_value_uzs,origin,catalog_key,category,real_player_dob,real_club_name,real_club_key,real_club_crest_url,real_roster_source,real_roster_checked_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14::date,$15,$16,$17,$18,$19::date) ON CONFLICT (catalog_key) DO UPDATE SET full_name=EXCLUDED.full_name,nationality=EXCLUDED.nationality,age=EXCLUDED.age,position=EXCLUDED.position,quality=EXCLUDED.quality,overall=EXCLUDED.overall,potential=EXCLUDED.potential,attributes=EXCLUDED.attributes,market_value_uzs=EXCLUDED.market_value_uzs,category=EXCLUDED.category,real_player_dob=EXCLUDED.real_player_dob,real_club_name=EXCLUDED.real_club_name,real_club_key=EXCLUDED.real_club_key,real_club_crest_url=EXCLUDED.real_club_crest_url,real_roster_source=EXCLUDED.real_roster_source,real_roster_checked_at=EXCLUDED.real_roster_checked_at WHERE players.club_id IS NULL AND players.origin=\'market\' RETURNING *',
  [clubId,p.fullName,p.nationality,p.age,p.position,p.quality,p.overall,p.potential,JSON.stringify(p.attributes),p.marketValueUzs,p.origin,p.catalogKey||null,category,p.realPlayerDob||null,p.realClubName||null,p.realClubKey||null,p.realClubCrestUrl||null,p.realRosterSource||null,p.realRosterCheckedAt||null]);
 return r.rows[0]||null;
}
// Tops the market up so that every slot has a free generated 45–50 player. It only ever fills gaps:
// buying one youth player creates at most one replacement, and a player sold back counts towards the stock again.
export async function ensureYouthSupply(client){
 await client.query('SELECT pg_advisory_xact_lock($1)',[YOUTH_LOCK]);
 const stock=await client.query("SELECT position,COUNT(*)::int AS n FROM players WHERE club_id IS NULL AND origin='generated' AND overall BETWEEN $1 AND $2 GROUP BY position",[YOUTH_MIN_OVERALL,YOUTH_MAX_OVERALL]);
 const have=Object.fromEntries(stock.rows.map(r=>[r.position,Number(r.n)])),want={};
 for(const position of youthSlots)want[position]=(want[position]||0)+1;
 let created=0;
 for(const [position,count] of Object.entries(want))for(let i=have[position]||0;i<count;i++){await insertPlayer(client,generateYouthPlayer(position));created++;}
 return created;
}

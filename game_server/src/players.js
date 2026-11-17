// Player rows created by the server itself: academy squads and the standing supply of generated youth players.
import {youthSlots,generateYouthPlayer,YOUTH_MIN_OVERALL,YOUTH_MAX_OVERALL,academySquadTemplate,generateAcademySquad} from './catalog.js';
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
 const stock=await client.query("SELECT position,COUNT(*)::int AS n FROM players WHERE club_id IS NULL AND NOT retired AND origin='generated' AND overall BETWEEN $1 AND $2 GROUP BY position",[YOUTH_MIN_OVERALL,YOUTH_MAX_OVERALL]);
 const have=Object.fromEntries(stock.rows.map(r=>[r.position,Number(r.n)])),want={};
 for(const position of youthSlots)want[position]=(want[position]||0)+1;
 let created=0;
 for(const [position,count] of Object.entries(want))for(let i=have[position]||0;i<count;i++){await insertPlayer(client,generateYouthPlayer(position));created++;}
 return created;
}

// Shared starting template: one free-agent row per slot stays in the market. Signing a template player
// creates a separate copy for the signing club, so every club can field the same players.
export const TEMPLATE_PREFIX='tpl-academy-';
const TEMPLATE_LOCK=8111003;
function seededRandom(seed){let a=seed>>>0;return()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
export async function ensureTemplatePool(client){
 await client.query('SELECT pg_advisory_xact_lock($1)',[TEMPLATE_LOCK]);
 const have=new Set((await client.query("SELECT catalog_key FROM players WHERE catalog_key LIKE $1",[TEMPLATE_PREFIX+'%'])).rows.map(r=>r.catalog_key));
 if(have.size>=academySquadTemplate.length)return 0;
 // Fixed seed: every environment gets the same names, ratings and positions.
 const squad=generateAcademySquad(seededRandom(20261117));
 let created=0;
 for(let i=0;i<squad.length;i++){const key=TEMPLATE_PREFIX+i;if(have.has(key))continue;await insertPlayer(client,{...squad[i],catalogKey:key},null);created++;}
 return created;
}

// Signing a free agent creates a separate copy for the club; the market row stays available to every club.
export async function copyFreeAgentToClub(client,p,clubId){
 return insertPlayer(client,{fullName:p.full_name,nationality:p.nationality,category:p.category,age:p.age,position:p.position,quality:p.quality,overall:p.overall,potential:p.potential,attributes:p.attributes,marketValueUzs:p.market_value_uzs,origin:p.origin,realPlayerDob:p.real_player_dob,realClubName:p.real_club_name,realClubKey:p.real_club_key,realClubCrestUrl:p.real_club_crest_url,realRosterSource:p.real_roster_source,realRosterCheckedAt:p.real_roster_checked_at},clubId);
}

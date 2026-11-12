// Starting XI repair. Pure function: used when a starter is sold and again before every match is settled.
import {formations,formationOf,arrange,slotFit,analyseLineup,isFormation,bestLineup} from './formations.js';
const lines={GK:'GK',CB:'DEF',LB:'DEF',RB:'DEF',DM:'MID',CM:'MID',AM:'MID',LW:'ATT',RW:'ATT',ST:'ATT'};
// Natural position counts of every formation, kept for callers that only need the headline shape.
export const formationShapes=Object.fromEntries(Object.values(formations).map(f=>{const shape={};for(const s of f.slots)shape[s.natural[0]]=(shape[s.natural[0]]||0)+1;return [f.id,shape];}));
const byRating=(a,b)=>Number(b.overall)-Number(a.overall)||String(a.id).localeCompare(String(b.id));
// players: every player of the club ({id,position,overall}). Returns a valid XI whenever the club has 11 players:
// 11 unique owned players, including a goalkeeper whenever the club has one.
export function repairLineup({formation='4-3-3',starters=[],substitutes=[],players=[]}){
 const byId=new Map(players.map(p=>[p.id,p]));
 const xi=[];for(const id of starters)if(byId.has(id)&&!xi.includes(id)&&xi.length<11)xi.push(id);
 const promoted=[];
 const available=()=>players.filter(p=>!xi.includes(p.id)).sort(byRating);
 const add=p=>{xi.push(p.id);promoted.push(p.id);};
 // A goalkeeper first: an XI without one is repaired before anything else.
 const hasKeeper=()=>xi.some(id=>byId.get(id).position==='GK');
 if(!hasKeeper()){
  const keeper=available().find(p=>p.position==='GK');
  if(keeper){
   if(xi.length>=11){const weakest=xi.map(id=>byId.get(id)).sort(byRating).at(-1);xi.splice(xi.indexOf(weakest.id),1);}
   add(keeper);
  }
 }
 const shape=formationOf(formation);
 while(xi.length<11){
  const pool=available();if(!pool.length)break;
  // The slots the current players leave open, then: natural for an open slot, cover for one, same line, best remaining.
  const taken=new Set(arrange(xi.map(id=>byId.get(id).position),shape.id)),open=shape.slots.filter((_,i)=>!taken.has(i));
  const suits=p=>Math.max(...open.map(s=>{const f=slotFit(s,p.position);return f===1?3:f>0?2:lines[s.natural[0]]===lines[p.position]?1:0;}));
  // A second goalkeeper is the last resort for an outfield vacancy.
  const outfield=pool.filter(p=>p.position!=='GK');
  const choice=[3,2,1].reduce((found,level)=>found||outfield.find(p=>suits(p)===level),null)||outfield[0]||pool[0];
  add(choice);
 }
 const bench=[];for(const id of substitutes)if(byId.has(id)&&!xi.includes(id)&&!bench.includes(id)&&bench.length<7)bench.push(id);
 const changed=xi.length!==starters.length||xi.some((id,i)=>id!==starters[i])||bench.length!==substitutes.length||bench.some((id,i)=>id!==substitutes[i]);
 return {starters:xi,substitutes:bench,promoted,changed};
}
// The rules for a lineup a manager submits. players: every player of the club ({id,position,overall}).
// saved: the lineup the club has now ({formation,starters}), if any. Returns null when the XI is acceptable, otherwise the reason.
// Always required: one of the 12 formations, 11 unique players of this club, a goalkeeper.
// Role rules: exactly one goalkeeper and nobody out of position, with two allowances so that no existing club is locked out:
//  - the lineup the club already has is always accepted again unchanged (lineups saved before roles were validated,
//    or repaired after a sale, may hold a player out of position or a second goalkeeper);
//  - an XI may hold as many players out of position as the squad's best possible XI in that formation needs, or as
//    the saved XI already holds in the same formation, whichever is more. It can be improved step by step, never made worse.
export function lineupProblem(formation,starters,players,saved=null){
 if(!isFormation(formation))return 'Unsupported formation';
 if(!Array.isArray(starters)||starters.length!==11||new Set(starters).size!==11)return 'Select exactly 11 unique starters';
 const byId=new Map(players.map(p=>[p.id,p])),xi=starters.map(id=>byId.get(id));
 if(xi.some(p=>!p))return 'Lineup contains a player outside this club';
 const keepers=xi.filter(p=>p.position==='GK').length;
 if(keepers<1)return 'Your Starting XI must include a goalkeeper';
 const before=Array.isArray(saved?.starters)?saved.starters:[];
 if(saved?.formation===formation&&before.length===11&&starters.every(id=>before.includes(id)))return null;
 if(keepers>1)return 'Your Starting XI must include exactly one goalkeeper';
 const analysis=analyseLineup(xi,formation);
 if(analysis.outOfPosition>0){
  const outOfPosition=ids=>{const team=ids.map(id=>byId.get(id)).filter(Boolean);return team.length===11?analyseLineup(team,formation).outOfPosition:0;};
  const best=bestLineup(players,formation);
  const allowed=Math.max(best.valid?0:outOfPosition(best.starters),saved?.formation===formation?outOfPosition(before):0);
  if(analysis.outOfPosition>allowed){
   const wrong=analysis.slots.filter(s=>s.fit===0);
   return formation+' cannot be filled with these players: no valid player for '+wrong.map(s=>s.slot).join(', ')+' ('+wrong.map(s=>s.position).join(', ')+' out of position)';
  }
 }
 return null;
}
export function isValidLineup(starters,players){
 const byId=new Map(players.map(p=>[p.id,p]));
 if(starters.length!==11||new Set(starters).size!==11||starters.some(id=>!byId.has(id)))return false;
 return !players.some(p=>p.position==='GK')||starters.some(id=>byId.get(id).position==='GK');
}
// Loads, repairs and stores the lineup of one club inside the caller's transaction.
export async function repairClubLineup(client,clubId){
 const lineup=(await client.query('SELECT formation,starters,substitutes FROM lineups WHERE club_id=$1 FOR UPDATE',[clubId])).rows[0];
 const players=(await client.query('SELECT id,position,overall,full_name FROM players WHERE club_id=$1',[clubId])).rows;
 const fixed=repairLineup({formation:lineup?.formation,starters:lineup?.starters||[],substitutes:lineup?.substitutes||[],players});
 if(!lineup)await client.query('INSERT INTO lineups(club_id,starters,substitutes) VALUES($1,$2,$3)',[clubId,fixed.starters,fixed.substitutes]);
 else if(fixed.changed)await client.query('UPDATE lineups SET starters=$2,substitutes=$3,updated_at=NOW() WHERE club_id=$1',[clubId,fixed.starters,fixed.substitutes]);
 return {...fixed,promotedPlayers:fixed.promoted.map(id=>players.find(p=>p.id===id))};
}

// Starting XI repair. Pure function: used when a starter is sold and again before every match is settled.
const lines={GK:'GK',CB:'DEF',LB:'DEF',RB:'DEF',DM:'MID',CM:'MID',AM:'MID',LW:'ATT',RW:'ATT',ST:'ATT'};
export const formationShapes={
 '4-3-3':{GK:1,CB:2,LB:1,RB:1,DM:1,CM:2,LW:1,RW:1,ST:1},
 '4-4-2':{GK:1,CB:2,LB:1,RB:1,CM:2,LW:1,RW:1,ST:2},
 '4-2-3-1':{GK:1,CB:2,LB:1,RB:1,DM:2,AM:1,LW:1,RW:1,ST:1},
 '3-5-2':{GK:1,CB:3,DM:1,CM:2,LW:1,RW:1,ST:2},
 '4-1-4-1':{GK:1,CB:2,LB:1,RB:1,DM:1,CM:2,LW:1,RW:1,ST:1}
};
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
 while(xi.length<11){
  const pool=available();if(!pool.length)break;
  const shape=formationShapes[formation]||formationShapes['4-3-3'],have={};
  for(const id of xi){const pos=byId.get(id).position;have[pos]=(have[pos]||0)+1;}
  const missing=Object.keys(shape).filter(pos=>(have[pos]||0)<shape[pos]);
  // A second goalkeeper is the last resort for an outfield vacancy.
  const outfield=pool.filter(p=>p.position!=='GK');
  const choice=outfield.find(p=>missing.includes(p.position))||outfield.find(p=>missing.some(pos=>lines[pos]===lines[p.position]))||outfield[0]||pool[0];
  add(choice);
 }
 const bench=[];for(const id of substitutes)if(byId.has(id)&&!xi.includes(id)&&!bench.includes(id)&&bench.length<7)bench.push(id);
 const changed=xi.length!==starters.length||xi.some((id,i)=>id!==starters[i])||bench.length!==substitutes.length||bench.some((id,i)=>id!==substitutes[i]);
 return {starters:xi,substitutes:bench,promoted,changed};
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

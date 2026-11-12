// The 12 approved formations. One source of truth for lineup validation, lineup repair, the match engine and the client.
//
// Player positions are unchanged: GK, CB, LB, RB, DM, CM, AM, LW, RW, ST. A formation is 11 slots, and every slot
// has a ROLE that says which of those positions play it naturally (fit 1) and which can cover it (fit 0.5).
// Any other position is out of position there (fit 0, not a valid mapping). Roles are not player positions:
//   LWB/RWB  wing-back of a back three: natural for a full-back or a winger
//   LM/RM    wide midfielder: natural for a winger, covered by a full-back or a central player
//   HM       the holding slot of a midfield three: natural for DM or CM
//   LAM/RAM  wide attacking midfielder of a 4-2-3-1: natural for a winger
// A formation changes a match only through formation fit: how well the Starting XI suits its eleven roles.
export const POSITIONS=['GK','CB','LB','RB','DM','CM','AM','LW','RW','ST'];
export const ROLES={
 GK:{natural:['GK'],cover:[]},
 CB:{natural:['CB'],cover:['LB','RB','DM']},
 LB:{natural:['LB'],cover:['RB','CB','LW']},
 RB:{natural:['RB'],cover:['LB','CB','RW']},
 LWB:{natural:['LB','LW'],cover:['RB','RW','CM']},
 RWB:{natural:['RB','RW'],cover:['LB','LW','CM']},
 DM:{natural:['DM'],cover:['CM','CB']},
 HM:{natural:['DM','CM'],cover:['CB','AM']},
 CM:{natural:['CM'],cover:['DM','AM']},
 LM:{natural:['LW'],cover:['RW','LB','CM','AM']},
 RM:{natural:['RW'],cover:['LW','RB','CM','AM']},
 AM:{natural:['AM'],cover:['CM','LW','RW','ST']},
 LAM:{natural:['LW'],cover:['RW','AM','ST']},
 RAM:{natural:['RW'],cover:['LW','AM','ST']},
 LW:{natural:['LW'],cover:['RW','AM','ST']},
 RW:{natural:['RW'],cover:['LW','AM','ST']},
 ST:{natural:['ST'],cover:['AM','LW','RW']}
};
// Slot: [label, role], listed from the goalkeeper forward and from left to right.
const GK=['GK','GK'];
const back4=[['LB','LB'],['LCB','CB'],['RCB','CB'],['RB','RB']];
const back3=[['LCB','CB'],['CB','CB'],['RCB','CB']];
const flat4=[['LM','LM'],['LCM','CM'],['RCM','CM'],['RM','RM']];
const wingBacks4=[['LWB','LWB'],['LCM','CM'],['RCM','CM'],['RWB','RWB']];
const pair=[['LS','ST'],['RS','ST']],lone=[['ST','ST']];
const layouts={
 '4-3-3':{note:'A holding midfielder behind two central midfielders, with two wingers and one striker.',
  slots:[GK,...back4,['DM','DM'],['LCM','CM'],['RCM','CM'],['LW','LW'],['RW','RW'],...lone]},
 '4-2-3-1':{note:'Two holding midfielders, a line of two wide players and a playmaker, and one striker.',
  slots:[GK,...back4,['LDM','DM'],['RDM','DM'],['LW','LAM'],['AM','AM'],['RW','RAM'],...lone]},
 '4-4-2':{note:'A back four, two central and two wide midfielders, and two strikers.',
  slots:[GK,...back4,...flat4,...pair]},
 '4-1-4-1':{note:'A holding midfielder, two central and two wide midfielders, and one striker.',
  slots:[GK,...back4,['DM','DM'],...flat4,...lone]},
 '4-4-1-1':{note:'Two central and two wide midfielders, with a playmaker behind one striker.',
  slots:[GK,...back4,...flat4,['AM','AM'],...lone]},
 '3-5-2':{note:'Three centre-backs, two wing-backs, a holding midfielder, two central midfielders and two strikers.',
  slots:[GK,...back3,['LWB','LWB'],['DM','DM'],['LCM','CM'],['RCM','CM'],['RWB','RWB'],...pair]},
 '3-4-3':{note:'Three centre-backs, two wing-backs, two central midfielders, two wingers and one striker.',
  slots:[GK,...back3,...wingBacks4,['LW','LW'],['RW','RW'],...lone]},
 '3-4-2-1':{note:'Three centre-backs, two wing-backs, two central midfielders and two playmakers behind one striker.',
  slots:[GK,...back3,...wingBacks4,['LAM','AM'],['RAM','AM'],...lone]},
 '5-3-2':{note:'Three centre-backs and two full-backs, three central midfielders and two strikers.',
  slots:[GK,['LWB','LB'],['LCB','CB'],['CB','CB'],['RCB','CB'],['RWB','RB'],['LCM','CM'],['CM','HM'],['RCM','CM'],...pair]},
 '5-4-1':{note:'Three centre-backs and two full-backs, two central and two wide midfielders, and one striker.',
  slots:[GK,['LB','LB'],['LCB','CB'],['CB','CB'],['RCB','CB'],['RB','RB'],...flat4,...lone]},
 '4-2-2-2':{note:'Two holding midfielders, two playmakers and two strikers. It uses no wingers.',
  slots:[GK,...back4,['LDM','DM'],['RDM','DM'],['LAM','AM'],['RAM','AM'],...pair]},
 '4-3-2-1':{note:'Three central midfielders and two playmakers behind one striker. It uses no wingers.',
  slots:[GK,...back4,['LCM','CM'],['CM','HM'],['RCM','CM'],['LAM','AM'],['RAM','AM'],...lone]}
};
export const FORMATION_IDS=Object.freeze(Object.keys(layouts));
export const DEFAULT_FORMATION='4-3-3';
export const formations=Object.freeze(Object.fromEntries(FORMATION_IDS.map(id=>{
 const slots=layouts[id].slots.map(([label,role])=>Object.freeze({id:label,role,natural:ROLES[role].natural,cover:ROLES[role].cover}));
 return [id,Object.freeze({id,note:layouts[id].note,slots:Object.freeze(slots)})];
})));
export const isFormation=id=>typeof id==='string'&&Object.hasOwn(formations,id);
export const formationOf=id=>formations[isFormation(id)?id:DEFAULT_FORMATION];

export const FIT_NATURAL=1,FIT_COVER=0.5;
export function slotFit(slot,position){return slot.natural.includes(position)?FIT_NATURAL:slot.cover.includes(position)?FIT_COVER:0;}
// One canonical arrangement of an XI: as many players as possible in a valid role, then as many natural roles as possible.
// Exact (dynamic programme over the 2^11 sets of used slots), deterministic, and it can never use a player or a slot twice.
const VALID=32,W_NATURAL=VALID+2,W_COVER=VALID+1;
const weightCache=new Map();
function weights(formation){
 let table=weightCache.get(formation.id);
 if(!table){table={};for(const position of POSITIONS)table[position]=formation.slots.map(s=>{const f=slotFit(s,position);return f===FIT_NATURAL?W_NATURAL:f===FIT_COVER?W_COVER:0;});weightCache.set(formation.id,table);}
 return table;
}
const none=Object.freeze(new Array(11).fill(0));
// Slot sets grouped by size, so the search only ever visits sets it can reach.
const masksBySize=Array.from({length:12},()=>[]);
for(let mask=0;mask<1<<11;mask++){let bits=0;for(let m=mask;m;m&=m-1)bits++;masksBySize[bits].push(mask);}
const best=new Int16Array(1<<11),from=new Int8Array(1<<11),arranged=new Map();
// Only the positions matter, so results are remembered per formation and position list.
export function arrange(positions,formationId){
 const formation=formationOf(formationId),n=Math.min(positions.length,11),key=formation.id+'|'+positions.slice(0,n).join(',');
 const known=arranged.get(key);if(known)return known;
 const table=weights(formation);
 // best[mask]: best score with the first popcount(mask) players placed on exactly the slots in mask.
 best[0]=0;
 for(let k=1;k<=n;k++){
  const w=table[positions[k-1]]||none;
  for(const mask of masksBySize[k]){
   let top=-1,slot=0;
   for(let s=0;s<11;s++){const bit=1<<s;if(!(mask&bit))continue;const score=best[mask^bit]+w[s];if(score>top){top=score;slot=s;}}
   best[mask]=top;from[mask]=slot;
  }
 }
 let end=0,top=-1;for(const mask of masksBySize[n])if(best[mask]>top){top=best[mask];end=mask;}
 const slotOfPlayer=new Array(n);
 for(let k=n-1,mask=end;k>=0;k--){slotOfPlayer[k]=from[mask];mask^=1<<from[mask];}
 if(arranged.size>=20000)arranged.clear();
 arranged.set(key,slotOfPlayer);
 return slotOfPlayer;
}
// players: the Starting XI ({id,position,...}) in any order. Returns where everyone plays and how well the XI suits the formation.
export function analyseLineup(players,formationId){
 const formation=formationOf(formationId),xi=players.slice(0,11),placed=arrange(xi.map(p=>p.position),formation.id);
 const slots=formation.slots.map(s=>({slot:s.id,role:s.role,playerId:null,position:null,fit:0}));
 let fit=0,natural=0,cover=0;
 placed.forEach((s,k)=>{
  const value=slotFit(formation.slots[s],xi[k].position);
  slots[s].playerId=xi[k].id??null;slots[s].position=xi[k].position;slots[s].fit=value;
  fit+=value;if(value===FIT_NATURAL)natural++;else if(value===FIT_COVER)cover++;
 });
 const outOfPosition=xi.length-natural-cover;
 return {formation:formation.id,slots,fit,natural,cover,outOfPosition,valid:xi.length===11&&outOfPosition===0,fitBonus:fitBonus(fit)};
}
// Formation fit keeps its approved scale: +4 for eleven natural roles, 1.5 less per player out of position
// (0.75 per player in a cover role), never below -4.
export const FIT_BONUS_MAX=4,FIT_BONUS_PER_PLAYER=1.5;
export function fitBonus(fit){return Math.max(-FIT_BONUS_MAX,Math.min(FIT_BONUS_MAX,FIT_BONUS_MAX-FIT_BONUS_PER_PLAYER*(11-fit)));}

// Best Starting XI a squad can field in a formation: maximises average overall plus formation fit, never puts a
// player in a role he cannot play while a valid alternative exists, and returns valid=false when the squad cannot fill the shape.
const bestCache=new Map();
export function bestLineup(players,formationId,strengthPerOverall=1){
 const formation=formationOf(formationId),size=1<<11,full=size-1,INVALID=-1e6;
 const sorted=players.slice().sort((a,b)=>Number(b.overall)-Number(a.overall)||String(a.id).localeCompare(String(b.id)));
 // The answer depends only on who is in the squad, where they play and how good they are.
 const key=formation.id+'|'+strengthPerOverall+'|'+sorted.map(p=>p.id+':'+p.position+':'+p.overall).join(',');
 const known=bestCache.get(key);if(known)return {...known,starters:known.starters.slice(),substitutes:known.substitutes.slice()};
 const value=new Float64Array(size),pick=new Int8Array(sorted.length*size);
 // First with valid roles only; out-of-position placements are allowed only when the squad cannot fill the shape otherwise.
 let valid=true;
 for(const strict of [true,false]){
  value.fill(-Infinity);value[0]=0;pick.fill(-1);
  sorted.forEach((p,i)=>{
   const base=Number(p.overall)*strengthPerOverall/11,fits=formation.slots.map(s=>slotFit(s,p.position)),row=i*size;
   if(strict&&!fits.some(Boolean))return;
   // Sets of filled slots are visited from the largest down, so a player is never placed twice.
   for(let mask=full-1;mask>=0;mask--){
    const from=value[mask];if(from===-Infinity)continue;
    for(let s=0;s<11;s++){
     const bit=1<<s;if(mask&bit)continue;
     if(!fits[s]&&strict)continue;
     const total=from+base+(fits[s]?FIT_BONUS_PER_PLAYER*fits[s]:INVALID);
     if(total>value[mask|bit]){value[mask|bit]=total;pick[row+(mask|bit)]=s;}
    }
   }
  });
  if(value[full]!==-Infinity)break;
  valid=false;
 }
 let result;
 if(value[full]===-Infinity)result={formation:formation.id,starters:[],substitutes:[],valid:false};
 else{
  const starters=new Array(11);
  for(let i=sorted.length-1,mask=full;i>=0;i--){const s=pick[i*size+mask];if(s>=0){starters[s]=sorted[i];mask&=~(1<<s);}}
  const ids=starters.map(p=>p.id),rest=sorted.filter(p=>!ids.includes(p.id));
  // Bench: a spare goalkeeper first when there is one, then the best of the rest.
  const keeper=rest.find(p=>p.position==='GK'),bench=(keeper?[keeper]:[]).concat(rest.filter(p=>p!==keeper)).slice(0,7);
  result={formation:formation.id,starters:ids,substitutes:bench.map(p=>p.id),valid};
 }
 if(bestCache.size>=2000)bestCache.clear();
 bestCache.set(key,result);
 return {...result,starters:result.starters.slice(),substitutes:result.substitutes.slice()};
}

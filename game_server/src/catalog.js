// Fictional players only. Three classes (players.origin):
//  market    – the seeded transfer-market catalogue below
//  academy   – the 18 players generated for a new club (50% resale on their first sale)
//  generated – low-rated youth players the market always keeps in stock
import {marketValueUzs,qualityForOverall} from './economy.js';
const firstNames = ['Azizbek','Jasur','Bekzod','Sardor','Diyor','Otabek','Kamron','Shahzod','Umid','Asadbek','Javohir','Temur','Farrukh','Ibrohim','Akmal','Mirjalol','Shoxrux','Sherzod','Bobur','Murodjon','Sanjar','Eldor','Nodir','Abdulaziz','Islom','Rustam','Suhrob','Oybek','Jamshid','Firdavs'];
const lastNames = ['Karimov','Tursunov','Rakhimov','Ismoilov','Akhmedov','Yuldashev','Ergashev','Aliyev','Sobirov','Nurmatov','Saidov','Qodirov','Mamatov','Xasanov','Rustamov','Abdullayev','Olimov','Eshonqulov','Rahmonov','Eshmatov'];
const positions = ['GK','CB','CB','LB','RB','DM','CM','CM','AM','LW','RW','ST'];
export const attributeNames = ['pace','shooting','passing','dribbling','defending','physical'];
// Approved attribute offsets per position (PAC, SHO, PAS, DRI, DEF, PHY). Every row sums to zero,
// so the six attributes of a generated player average exactly to his overall.
export const attributeOffsets = {
 GK:[-3,-4,-4,-4,0,15], CB:[-2,-8,-3,-7,12,8], LB:[5,-9,0,0,3,1], RB:[5,-9,0,0,3,1], DM:[-3,-8,5,-4,6,4],
 CM:[-2,-2,5,2,-2,-1], AM:[1,2,4,5,-8,-4], LW:[6,3,-2,6,-9,-4], RW:[6,3,-2,6,-9,-4], ST:[2,8,-4,1,-10,3]
};
export function attributesFor(overall,position){
 const offsets=attributeOffsets[position];
 if(!offsets||!Number.isInteger(overall)||overall<1||overall>99)throw new RangeError('Invalid player template');
 const values=offsets.map(o=>Math.max(1,Math.min(99,overall+o)));
 // Clamping at 1 or 99 can only happen at the extremes; hand the difference to the other attributes so the average stays exact.
 let rest=overall*6-values.reduce((a,b)=>a+b,0);
 for(let guard=0;rest!==0&&guard<600;guard++){
  const step=Math.sign(rest),i=values.findIndex(v=>step>0?v<99:v>1);
  if(i<0)break;values[i]+=step;rest-=step;
 }
 return Object.fromEntries(attributeNames.map((key,i)=>[key,values[i]]));
}
function card(fullName,position,overall,age,potential,origin){
 return {fullName,nationality:'UZ',age,position,quality:qualityForOverall(overall),overall,potential,attributes:attributesFor(overall,position),marketValueUzs:marketValueUzs(overall),origin};
}
const pick=(list,random)=>list[Math.floor(random()*list.length)];
function uniqueName(used,random){
 for(let i=0;i<200;i++){const name=pick(firstNames,random)+' '+pick(lastNames,random);if(!used.has(name)){used.add(name);return name;}}
 const name=pick(firstNames,random)+' '+pick(lastNames,random);used.add(name);return name;
}
// Seeded transfer-market catalogue: 360 fictional players, overall 46–74.
export const starterPlayers = [];
for (let i=0;i<360;i++) {
 const fullName=firstNames[i%firstNames.length]+' '+lastNames[Math.floor(i/firstNames.length)%lastNames.length];
 const overall=46+((i*7+Math.floor(i/9)*3)%29);
 starterPlayers.push({...card(fullName,positions[i%positions.length],overall,18+(i*3%13),Math.min(92,overall+8+(i%13)),'market'),catalogKey:'fictional-'+String(i).padStart(3,'0')});
}
// Every new club receives exactly this squad: the same positions and ratings for everyone.
// The first 11 entries are the Starting XI in a 4-3-3; the remaining 7 are the bench.
export const academySquadTemplate = [
 ['GK',54],['CB',56],['CB',54],['LB',52],['RB',52],['DM',54],['CM',56],['CM',52],['LW',54],['RW',52],['ST',58],
 ['GK',47],['CB',50],['DM',47],['CM',50],['AM',50],['ST',47],['ST',47]
];
export function generateAcademySquad(random=Math.random){
 const used=new Set();
 return academySquadTemplate.map(([position,overall],i)=>card(uniqueName(used,random),position,overall,17+((i*5)%7),Math.min(92,overall+12),'academy'));
}
// The market always holds at least one free generated player for each of these twelve slots.
export const youthSlots = positions;
export const YOUTH_MIN_OVERALL=45, YOUTH_MAX_OVERALL=50;
export function generateYouthPlayer(position,random=Math.random){
 const overall=YOUTH_MIN_OVERALL+Math.floor(random()*(YOUTH_MAX_OVERALL-YOUTH_MIN_OVERALL+1));
 return card(pick(firstNames,random)+' '+pick(lastNames,random),position,overall,16+Math.floor(random()*4),Math.min(92,overall+10),'generated');
}

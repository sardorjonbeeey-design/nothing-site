import {analyseLineup} from './formations.js';
import {formationTacticalProfile,formationTacticalDelta} from './formation-tactics.js';
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const average=(xs)=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:45;
// Owner-approved match model (2026-11-12): the goal share depends on the rating DIFFERENCE on an Elo-style
// curve with scale 40, and the home side plays as if it were 2 rating points stronger.
export const MATCH_RATING_SCALE=40;
export const MATCH_HOME_ADVANTAGE_POINTS=2;
export function goalShare(homeStrength,awayStrength){
 return 1/(1+Math.pow(10,-((homeStrength+MATCH_HOME_ADVANTAGE_POINTS)-awayStrength)/MATCH_RATING_SCALE));
}
// Strength of a Starting XI in a formation: average overall, fitness, and the formation fit of -4 to +4.
// fit is how well these players suit the formation's roles (see formations.js); nothing here depends on the formation's name.
export function lineupStrength(players,formation='4-3-3') {
 if (!Array.isArray(players)||players.length<11) return {strength:35,fit:0,analysis:null};
 const starters=players.slice(0,11);
 const base=average(starters.map(p=>Number(p.overall)||40));
 const fitness=average(starters.map(p=>Number(p.fitness??100)));
 const analysis=analyseLineup(starters,formation);
 return {strength:clamp(base*(0.9+fitness/1000)+analysis.fitBonus,25,100),fit:analysis.fit,analysis};
}
export function squadStrength(players,formation='4-3-3') {return lineupStrength(players,formation).strength;}
function poisson(lambda,rng) {
 const limit=Math.exp(-lambda);let k=0,product=1;
 do{k++;product*=rng();}while(product>limit&&k<8);
 return Math.max(0,k-1);
}
export function simulateMatch(homePlayers,awayPlayers,options={}) {
 const rng=options.random||Math.random;
 const homeFormation=options.homeFormation||'4-3-3',awayFormation=options.awayFormation||'4-3-3';
 const homeLineup=lineupStrength(homePlayers,homeFormation),awayLineup=lineupStrength(awayPlayers,awayFormation);
 const homeTactics=formationTacticalProfile(homeLineup.analysis,homePlayers);
 const awayTactics=formationTacticalProfile(awayLineup.analysis,awayPlayers);
 // The tactical matchup is relative and symmetric: it can shift at most 1.5 rating points
 // between the teams, and swapping home/away reverses the edge.
 const tacticalDelta=formationTacticalDelta(homeTactics,awayTactics);
 const homeStrength=clamp(homeLineup.strength+tacticalDelta/2,25,100);
 const awayStrength=clamp(awayLineup.strength-tacticalDelta/2,25,100);
 const share=goalShare(homeStrength,awayStrength);
 const homeGoals=poisson(0.55+share*1.85,rng);
 const awayGoals=poisson(0.55+(1-share)*1.85,rng);
 const events=[];
 const count=homeGoals+awayGoals;
 let hg=0,ag=0;
 for(let i=0;i<count;i++){
  const minute=4+Math.floor(rng()*87);
  const side=(hg<homeGoals&&ag<awayGoals)?(rng()<share?'home':'away'):(hg<homeGoals?'home':'away');
  if(side==='home')hg++;else ag++;
  events.push({minute,type:'goal',side,homeScore:hg,awayScore:ag,text:side==='home'?'Home team scores':'Away team scores'});
 }
 for(const item of [[12,'chance','A dangerous attack'],[28,'save','A goalkeeper makes a save'],[43,'chance','A late first-half chance'],[61,'attack','Pressure builds in the final third'],[76,'chance','A chance opens up'],[89,'attack','Last-minute pressure']]){
  if(rng()>0.42)events.push({minute:item[0],type:item[1],side:rng()<share?'home':'away',text:item[2]});
 }
 events.sort((a,b)=>a.minute-b.minute);
 let chronologicalHome=0,chronologicalAway=0;
 for(const event of events)if(event.type==='goal'){if(event.side==='home')chronologicalHome++;else chronologicalAway++;event.homeScore=chronologicalHome;event.awayScore=chronologicalAway;}
 return {homeGoals,awayGoals,events,homeStrength:Number(homeStrength.toFixed(1)),awayStrength:Number(awayStrength.toFixed(1))};
}

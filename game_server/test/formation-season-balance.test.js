import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateMatch} from '../src/simulation.js';
import {formationOf,FORMATION_IDS} from '../src/formations.js';
import {attributesFor} from '../src/catalog.js';
import {generateDoubleRoundRobin} from '../src/league.js';

function seeded(seed){
 let state=seed>>>0;
 return ()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
}
function equalStrengthXI(formation,rating=65){
 return formationOf(formation).slots.map((slot,i)=>({
  id:formation+'-'+i,position:slot.natural[0],overall:rating,fitness:100,
  attributes:attributesFor(rating,slot.natural[0])
 }));
}

test('30 complete 10-club seasons show no material formation advantage',()=>{
 const clubs=Array.from({length:10},(_,i)=>'club-'+i);
 const schedule=generateDoubleRoundRobin(clubs);
 assert.equal(schedule.length,18);
 const pointsByFormation=new Map(FORMATION_IDS.map(id=>[id,0]));
 const gamesByFormation=new Map(FORMATION_IDS.map(id=>[id,0]));
 for(let season=0;season<30;season++){
  const formations=clubs.map((_,i)=>FORMATION_IDS[(i+season)%FORMATION_IDS.length]);
  const lineups=formations.map(id=>equalStrengthXI(id));
  const table=clubs.map(()=>({played:0,wins:0,draws:0,losses:0,points:0,gf:0,ga:0}));
  for(let round=0;round<schedule.length;round++){
   for(let index=0;index<schedule[round].length;index++){
    const fixture=schedule[round][index];
    const h=clubs.indexOf(fixture.homeClubId),a=clubs.indexOf(fixture.awayClubId);
    const result=simulateMatch(lineups[h],lineups[a],{
     homeFormation:formations[h],awayFormation:formations[a],
     random:seeded((season+1)*100000+(round+1)*100+index+1)
    });
    const home=table[h],away=table[a];
    home.played++;away.played++;home.gf+=result.homeGoals;home.ga+=result.awayGoals;away.gf+=result.awayGoals;away.ga+=result.homeGoals;
    if(result.homeGoals>result.awayGoals){home.wins++;away.losses++;home.points+=3;}
    else if(result.homeGoals<result.awayGoals){away.wins++;home.losses++;away.points+=3;}
    else{home.draws++;away.draws++;home.points++;away.points++;}
    pointsByFormation.set(formations[h],pointsByFormation.get(formations[h])+home.points-(home.points-(result.homeGoals>result.awayGoals?3:result.homeGoals===result.awayGoals?1:0)));
    pointsByFormation.set(formations[a],pointsByFormation.get(formations[a])+away.points-(away.points-(result.awayGoals>result.homeGoals?3:result.awayGoals===result.homeGoals?1:0)));
    gamesByFormation.set(formations[h],gamesByFormation.get(formations[h])+1);
    gamesByFormation.set(formations[a],gamesByFormation.get(formations[a])+1);
   }
  }
  assert.ok(table.every(x=>x.played===18&&x.wins+x.draws+x.losses===18));
  assert.equal(table.reduce((n,x)=>n+x.wins,0),table.reduce((n,x)=>n+x.losses,0));
  assert.equal(table.reduce((n,x)=>n+x.draws,0)%2,0);
  assert.equal(table.reduce((n,x)=>n+x.gf,0),table.reduce((n,x)=>n+x.ga,0));
 }
 const averages=FORMATION_IDS.map(id=>pointsByFormation.get(id)/gamesByFormation.get(id));
 assert.ok(Math.max(...averages)-Math.min(...averages)<0.18,
  'formation points-per-game spread stays below 0.18 across 30 complete seasons: '+averages.map(x=>x.toFixed(3)).join(', '));
});

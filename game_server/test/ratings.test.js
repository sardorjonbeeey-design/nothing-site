import test from 'node:test';
import assert from 'node:assert/strict';
import {defineRatingProfile,UZBEK_LEAGUE,ratingProfiles,ratingProfileFor,DEFAULT_CATEGORY,isValidOverall,isValidPotential,isValidAttributes,assertValidRating,clampPotential} from '../src/ratings.js';
import {attributesFor,attributeOffsets,generateAcademySquad,generateYouthPlayer,starterPlayers,youthSlots} from '../src/catalog.js';
import {overallFromAttributes,marketValueUzs,saleValueUzs,resaleRatePercent} from '../src/economy.js';
import {squadStrength,goalShare} from '../src/simulation.js';

const flat=n=>({pace:n,shooting:n,passing:n,dribbling:n,defending:n,physical:n});

test('the only active profile is uzbek_league: overall 40-90, potential up to 90, attributes up to 99',()=>{
 assert.deepEqual(Object.keys(ratingProfiles),['uzbek_league']);assert.equal(DEFAULT_CATEGORY,'uzbek_league');
 assert.deepEqual({...UZBEK_LEAGUE},{category:'uzbek_league',minOverall:40,maxOverall:90,maxPotential:90,minAttribute:1,maxAttribute:99});
 assert.equal(ratingProfileFor('uzbek_league'),UZBEK_LEAGUE);assert.equal(ratingProfileFor(),UZBEK_LEAGUE);
 assert.throws(()=>ratingProfileFor('international_iconic'),/Unknown player category/);
 assert.throws(()=>ratingProfileFor('toString'));
 assert.throws(()=>{ratingProfiles.other=UZBEK_LEAGUE;});assert.throws(()=>{UZBEK_LEAGUE.maxOverall=115;});
});
test('overall: 40 and 90 accepted, 39 and 91 rejected',()=>{
 assert.ok(isValidOverall(40));assert.ok(isValidOverall(90));assert.ok(isValidOverall(65));
 for(const bad of [39,91,0,-1,100,115,64.5,'70',null,undefined,NaN])assert.equal(isValidOverall(bad),false,String(bad));
 assert.doesNotThrow(()=>assertValidRating({overall:40,potential:40}));
 assert.doesNotThrow(()=>assertValidRating({overall:90,potential:90}));
 assert.throws(()=>assertValidRating({overall:39,potential:60}),/between 40 and 90/);
 assert.throws(()=>assertValidRating({overall:91,potential:91}),/between 40 and 90/);
});
test('potential: never below overall, never above 90',()=>{
 assert.ok(isValidPotential(90,90));assert.ok(isValidPotential(90,40));assert.ok(isValidPotential(40,40));
 assert.equal(isValidPotential(91,80),false);assert.equal(isValidPotential(92,74),false);assert.equal(isValidPotential(69,70),false);assert.equal(isValidPotential(80.5,70),false);
 assert.throws(()=>assertValidRating({overall:80,potential:91}),/Potential/);
 assert.throws(()=>assertValidRating({overall:80,potential:79}),/Potential/);
 assert.equal(clampPotential(92),90);assert.equal(clampPotential(91),90);assert.equal(clampPotential(90),90);assert.equal(clampPotential(66),66);
});
test('attributes may reach 99 while overall stays capped at 90',()=>{
 assert.ok(isValidAttributes(flat(99)));assert.ok(isValidAttributes(flat(1)));
 assert.equal(isValidAttributes(flat(100)),false);assert.equal(isValidAttributes(flat(0)),false);
 assert.equal(isValidAttributes({...flat(70),pace:70.5}),false);assert.equal(isValidAttributes({pace:70}),false);assert.equal(isValidAttributes(null),false);
 assert.doesNotThrow(()=>assertValidRating({overall:90,potential:90,attributes:{...flat(88),physical:99,defending:99}}));
 assert.throws(()=>assertValidRating({overall:90,potential:90,attributes:{...flat(88),physical:100}}),/Attributes/);
 // Six attributes of 99 average 99, but overall is capped by potential, which cannot exceed 90.
 assert.equal(overallFromAttributes(flat(99),90,90),90);
 assert.equal(overallFromAttributes(flat(99),74,clampPotential(92)),90);
});
test('real market players and generated Uzbek players comply with the league profile',()=>{
 const players=[...starterPlayers];
 for(let i=0;i<50;i++)players.push(...generateAcademySquad());
 for(let i=0;i<1200;i++)players.push(generateYouthPlayer(youthSlots[i%12]));
 assert.ok(players.length>2100);
 for(const p of players){
  assert.equal(p.category,'uzbek_league');
  if(p.origin==='market')assert.match(p.nationality,/^[A-Z]{2}$/);else assert.equal(p.nationality,'UZ');
  assert.doesNotThrow(()=>assertValidRating(p));
  assert.ok(p.overall>=40&&p.overall<=90&&p.potential>=p.overall&&p.potential<=90);
  assert.equal(overallFromAttributes(p.attributes,p.overall,p.potential),p.overall,'attributes and overall agree');
 }
});
test('templates exist for the whole 40-90 range and upgrades can never pass 90',()=>{
 for(const position of Object.keys(attributeOffsets))for(let overall=40;overall<=90;overall++){
  const attributes=attributesFor(overall,position);
  assert.doesNotThrow(()=>assertValidRating({overall,potential:90,attributes}));
  // Upgrade every attribute as far as the upgrade route allows (each attribute stops at potential).
  const maxed=Object.fromEntries(Object.entries(attributes).map(([k,v])=>[k,Math.max(v,90)]));
  const after=overallFromAttributes(maxed,overall,90);
  assert.ok(after<=90&&after>=overall,position+' '+overall+' -> '+after);
 }
});
test('economy is untouched across the playable range',()=>{
 assert.equal(marketValueUzs(40),160000);assert.equal(marketValueUzs(58),1060000);assert.equal(marketValueUzs(74),5820000);
 assert.equal(marketValueUzs(80),11000000);assert.equal(marketValueUzs(90),31800000);
 assert.equal(saleValueUzs(marketValueUzs(58),50),530000n);assert.equal(saleValueUzs(marketValueUzs(74),80),4656000n);
 assert.equal(resaleRatePercent({origin:'academy',first_sale_done:false}),50);assert.equal(resaleRatePercent({origin:'market',first_sale_done:false}),80);
 for(let o=40;o<=90;o++)assert.equal(marketValueUzs(o),Math.round(11_000_000*1.112**(o-80)/10_000)*10_000);
});
test('match strength distinguishes every rating in the playable range',()=>{
 const shape=['GK','CB','CB','LB','RB','DM','CM','CM','LW','RW','ST'],xi=o=>shape.map(position=>({position,overall:o,fitness:100}));
 let previous=0;
 for(let o=40;o<=90;o++){const s=squadStrength(xi(o),'4-3-3');assert.equal(s,o+4);assert.ok(s>previous);previous=s;}
 assert.ok(goalShare(94,44)>goalShare(74,44));
});
// Future compatibility. This profile is defined ONLY inside this test: it is not registered, stored or reachable by the game.
test('a separate 95-115 profile works with the same core functions, without changing them',()=>{
 const iconic=defineRatingProfile({category:'international_iconic',minOverall:95,maxOverall:115,maxPotential:115,maxAttribute:125});
 assert.equal(Object.hasOwn(ratingProfiles,'international_iconic'),false,'not an active category');
 assert.ok(isValidOverall(95,iconic));assert.ok(isValidOverall(115,iconic));
 assert.equal(isValidOverall(94,iconic),false);assert.equal(isValidOverall(116,iconic),false);assert.equal(isValidOverall(90,iconic),false);
 // The two ranges do not overlap, and the Uzbek limits are unaffected by the other profile existing.
 assert.equal(isValidOverall(95,UZBEK_LEAGUE),false);assert.equal(isValidOverall(115),false);assert.equal(isValidPotential(115,90),false);
 assert.ok(isValidPotential(115,100,iconic));assert.equal(isValidPotential(116,100,iconic),false);
 for(const position of Object.keys(attributeOffsets))for(const overall of [95,100,108,115]){
  const attributes=attributesFor(overall,position,iconic);
  assert.equal(Object.values(attributes).reduce((a,b)=>a+b,0),overall*6);
  assert.doesNotThrow(()=>assertValidRating({overall,potential:115,attributes},iconic));
  assert.throws(()=>assertValidRating({overall,potential:115,attributes}),/between 40 and 90/,'rejected as an Uzbek player');
  assert.equal(overallFromAttributes(attributes,95,115),overall,'the same overall formula');
 }
 assert.throws(()=>attributesFor(115,'ST'),'the default profile still refuses 115');
 // The goal-share curve has no ceiling: a 25-point gap is the same at any level.
 assert.equal(goalShare(115,90),goalShare(90,65));
 // Malformed profiles are refused.
 assert.throws(()=>defineRatingProfile({category:'x',minOverall:95,maxOverall:115,maxPotential:115,maxAttribute:125}));
 assert.throws(()=>defineRatingProfile({category:'bad_range',minOverall:95,maxOverall:90,maxPotential:115,maxAttribute:125}));
 assert.throws(()=>defineRatingProfile({category:'bad_potential',minOverall:95,maxOverall:115,maxPotential:110,maxAttribute:125}));
 assert.throws(()=>defineRatingProfile({category:'bad_attribute',minOverall:95,maxOverall:115,maxPotential:115,maxAttribute:99}));
});

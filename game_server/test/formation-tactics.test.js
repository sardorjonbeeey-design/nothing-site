import test from 'node:test';
import assert from 'node:assert/strict';
import { analyseLineup, formationOf, FORMATION_IDS } from '../src/formations.js';
import { formationTacticalProfile, formationTacticalDelta, MAX_TACTICAL_MATCHUP_SWING } from '../src/formation-tactics.js';
import { attributesFor } from '../src/catalog.js';

function natural(id,rating=60) {
  return formationOf(id).slots.map((slot,i)=>{
    const position=slot.natural[0];
    return {id:id+'-'+i,position,overall:rating,fitness:100,attributes:attributesFor(rating,position)};
  });
}
function profile(id,rating=60) {
  const players=natural(id,rating);
  return formationTacticalProfile(analyseLineup(players,id),players);
}

test('all 12 formations produce finite, bounded tactical profiles',()=>{
  for(const id of FORMATION_IDS) {
    const p=profile(id);
    for(const key of ['defence','midfield','width','attack','transition']) {
      assert.ok(Number.isFinite(p[key]),id+' '+key+' is finite');
      assert.ok(p[key]>=-20&&p[key]<=20,id+' '+key+' stays within the positional-surplus range');
    }
  }
});

test('a formation has no unconditional matchup bonus against itself',()=>{
  for(const id of FORMATION_IDS) assert.equal(formationTacticalDelta(profile(id),profile(id)),0,id);
});

test('matchup delta is antisymmetric and capped across every formation pairing',()=>{
  for(const a of FORMATION_IDS) for(const b of FORMATION_IDS) {
    const ab=formationTacticalDelta(profile(a),profile(b));
    const ba=formationTacticalDelta(profile(b),profile(a));
    assert.ok(Math.abs(ab)<=MAX_TACTICAL_MATCHUP_SWING);
    assert.ok(Math.abs(ab+ba)<1e-12,a+' vs '+b+' must reverse when sides swap');
  }
});

test('the twelve-formation field has no net shape advantage in an all-pairs schedule',()=>{
  for(const a of FORMATION_IDS) {
    let total=0;
    for(const b of FORMATION_IDS) total+=formationTacticalDelta(profile(a),profile(b));
    assert.ok(Math.abs(total)<1e-9,a+' has a net advantage across the complete field');
  }
});

test('a stronger squad remains stronger; tactical effects cannot erase a large rating gap',()=>{
  for(const id of FORMATION_IDS) {
    const strong=profile(id,70),weak=profile('4-3-3',60);
    const delta=formationTacticalDelta(strong,weak);
    assert.ok(delta>=-MAX_TACTICAL_MATCHUP_SWING&&delta<=MAX_TACTICAL_MATCHUP_SWING);
    assert.ok(10+delta>8.4,'the ten-point squad gap remains decisive for '+id);
  }
});

test('a role with no positional fit contributes nothing to that tactical dimension',()=>{
  const players=natural('4-3-3');
  const analysis=analyseLineup(players,'4-3-3');
  const before=formationTacticalProfile(analysis,players);
  const altered=analysis.slots.map(slot=>({...slot,fit:slot.role==='ST'?0:slot.fit}));
  const after=formationTacticalProfile({...analysis,slots:altered},players);
  assert.ok(after.attack<before.attack);
});

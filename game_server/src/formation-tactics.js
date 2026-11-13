// Phase 3 formation matchup model.
// This is deliberately separate from the approved formation-fit bonus: shape and player attributes
// create a small matchup edge, not a fixed bonus for choosing a formation.
const ROLE_WEIGHTS = Object.freeze({
  defence: Object.freeze({ CB:1, LB:.75, RB:.75, LWB:.65, RWB:.65, DM:.65, HM:.65, CM:.15, LM:.1, RM:.1 }),
  midfield: Object.freeze({ DM:1, HM:1, CM:1, LM:.45, RM:.45, AM:.55, LAM:.4, RAM:.4 }),
  width: Object.freeze({ LW:1, RW:1, LM:.9, RM:.9, LWB:.8, RWB:.8, LAM:.35, RAM:.35 }),
  attack: Object.freeze({ ST:1, LW:.7, RW:.7, AM:.65, LAM:.65, RAM:.65, CM:.15, LM:.3, RM:.3 }),
  transition: Object.freeze({ DM:.55, HM:.55, CM:.85, AM:.8, LAM:.65, RAM:.65, LM:.65, RM:.65, LW:.75, RW:.75, ST:.4 })
});
const ATTRIBUTE_WEIGHTS = Object.freeze({
  defence: Object.freeze({ defending:.7, physical:.3 }),
  midfield: Object.freeze({ passing:.6, physical:.2, dribbling:.2 }),
  width: Object.freeze({ pace:.4, dribbling:.4, passing:.2 }),
  attack: Object.freeze({ shooting:.5, dribbling:.3, pace:.2 }),
  transition: Object.freeze({ pace:.35, passing:.35, dribbling:.3 })
});
const DIMENSIONS = Object.freeze(Object.keys(ROLE_WEIGHTS));
export const MAX_TACTICAL_MATCHUP_SWING = 1.5;
const clamp = (n,min,max) => Math.max(min,Math.min(max,n));
const number = (value,fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function attributeScore(player,weights) {
  const attributes = player?.attributes && typeof player.attributes === 'object' ? player.attributes : {};
  let total = 0, weightTotal = 0;
  for (const [key,weight] of Object.entries(weights)) {
    total += clamp(number(attributes[key],number(player?.overall,50)),1,99) * weight;
    weightTotal += weight;
  }
  return weightTotal ? total / weightTotal : 50;
}

// analysis is the result of analyseLineup(players, formation). Its slot fit (natural/cover/out of position)
// is included, so a player contributes less when covering and nothing when out of position.
export function formationTacticalProfile(analysis,players) {
  if (!analysis || !Array.isArray(analysis.slots) || !Array.isArray(players)) {
    return Object.freeze(Object.fromEntries(DIMENSIONS.map(key=>[key,0])));
  }
  const byId = new Map(players.filter(p=>p?.id!==undefined&&p?.id!==null).map(p=>[p.id,p]));
  // Legacy/unit-test players may not have IDs. Match their positions in stable order as a fallback.
  const fallback = new Map();
  for (const player of players) {
    if (player?.position) {
      if (!fallback.has(player.position)) fallback.set(player.position,[]);
      fallback.get(player.position).push(player);
    }
  }
  const profile = {};
  for (const dimension of DIMENSIONS) {
    const roles = ROLE_WEIGHTS[dimension],attributes = ATTRIBUTE_WEIGHTS[dimension];
    const usedFallback = new Set();
    let weightedSkill = 0,roleWeightTotal = 0;
    for (const slot of analysis.slots) {
      const roleWeight = roles[slot.role] || 0;
      const fit = clamp(number(slot.fit,0),0,1);
      const weight = roleWeight * fit;
      if (!weight) continue;
      let player = slot.playerId!==null&&slot.playerId!==undefined ? byId.get(slot.playerId) : null;
      if (!player && slot.position) {
        const candidate = (fallback.get(slot.position)||[]).find(p=>!usedFallback.has(p));
        if (candidate) { player=candidate;usedFallback.add(candidate); }
      }
      if (!player) continue;
      // Player attributes average to overall, so use only the positional surplus/deficit here.
      // This prevents the tactical layer from counting raw squad quality a second time.
      weightedSkill += (attributeScore(player,attributes) - number(player.overall,50)) * weight;
      roleWeightTotal += weight;
    }
    // Divide by the full XI, not only the selected roles: adding more of one role cannot
    // create a free bonus. The score represents positional attributes above/below OVR.
    profile[dimension] = roleWeightTotal ? weightedSkill / 11 : 0;
  }
  return Object.freeze(profile);
}

function advantageFor(team,opponent) {
  return .04*(team.attack-opponent.defence)
    + .02*(team.midfield-opponent.midfield)
    + .015*(team.width-opponent.defence)
    + .015*(team.transition-opponent.midfield);
}

// Positive means the home shape has the better matchup. The result is antisymmetric:
// swapping the teams reverses the sign. The total rating swing is capped at 1.5 points.
export function formationTacticalDelta(home,away) {
  const edge = advantageFor(home,away) - advantageFor(away,home);
  return clamp(edge,-MAX_TACTICAL_MATCHUP_SWING,MAX_TACTICAL_MATCHUP_SWING);
}

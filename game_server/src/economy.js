// Owner-approved economy values (2026-11-12). Kept in code, not in the environment, so they are the same everywhere.
export const STARTING_BUDGET_UZS=20_000_000n;
export const LEAGUE_MATCH_INCOME_UZS=750_000n;
export const WAITING_STIPEND_UZS=750_000n;
export const MATCH_WIN_BONUS_UZS=250_000n;
export const MATCH_DRAW_BONUS_UZS=100_000n;
export const MIN_SQUAD_SIZE=13;
export const MAX_SQUAD_SIZE=26;
export const STARTING_SQUAD_SIZE=18;
export const MINIMUM_GOALKEEPERS=2;
// 11,000,000 UZS at overall 80, 11.2% more per rating point, rounded to 10,000 UZS.
export function marketValueUzs(overall){
 if(!Number.isInteger(overall)||overall<1||overall>100)throw new RangeError('Overall must be between 1 and 100');
 return Math.round(11_000_000*Math.pow(1.112,overall-80)/10_000)*10_000;
}
export function qualityForOverall(overall){
 if(overall<54)return 'academy';
 if(overall<62)return 'developing';
 if(overall<69)return 'established';
 return 'elite';
}
export function upgradeCost(currentAttribute,levels){
 if(!Number.isInteger(currentAttribute)||currentAttribute<1||currentAttribute>100)throw new RangeError('Invalid current attribute');
 if(!Number.isInteger(levels)||levels<1||levels>5)throw new RangeError('Upgrade levels must be between 1 and 5');
 let total=0;
 for(let n=currentAttribute;n<currentAttribute+levels;n++)total+=2+Math.floor(n/10);
 return total;
}
// An academy player sells for 50% the first time; every other sale is 80% of market value.
export function resaleRatePercent(player){
 return player.origin==='academy'&&!player.first_sale_done?50:80;
}
export function saleValueUzs(marketValue,ratePercent=80){
 const value=BigInt(marketValue);
 if(value<0n)throw new RangeError('Market value cannot be negative');
 if(ratePercent!==50&&ratePercent!==80)throw new RangeError('Unsupported resale rate');
 return value*BigInt(ratePercent)/100n;
}
// Overall is the rounded-down average of the six attributes, never above potential and never below the current overall.
export function overallFromAttributes(attributes,currentOverall,potential){
 const sum=['pace','shooting','passing','dribbling','defending','physical'].reduce((n,k)=>n+Number(attributes[k]),0);
 return Math.max(Number(currentOverall),Math.min(Number(potential),Math.floor(sum/6)));
}

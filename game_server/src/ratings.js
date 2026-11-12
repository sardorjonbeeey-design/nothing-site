// Rating profiles: the single place where a player category's rating limits are defined.
// Only uzbek_league is active. A future category (for example international icons rated 95-115) is added by
// defining one more profile here and inserting the matching row into the rating_profiles table; the overall
// calculation, attribute templates, validation and the database trigger read the limits from the profile.
export function defineRatingProfile({category,minOverall,maxOverall,maxPotential,maxAttribute}){
 const numbers=[minOverall,maxOverall,maxPotential,maxAttribute];
 if(typeof category!=='string'||!/^[a-z][a-z0-9_]{1,29}$/.test(category))throw new RangeError('Invalid rating profile category');
 if(numbers.some(n=>!Number.isInteger(n)||n<1)||minOverall>maxOverall||maxPotential<maxOverall)throw new RangeError('Invalid rating profile limits');
 // The six attributes average to the overall, so the profile must leave room for an average at both ends.
 if(maxAttribute<maxOverall)throw new RangeError('Invalid rating profile attribute limit');
 return Object.freeze({category,minOverall,maxOverall,maxPotential,minAttribute:1,maxAttribute});
}
export const UZBEK_LEAGUE=defineRatingProfile({category:'uzbek_league',minOverall:40,maxOverall:90,maxPotential:90,maxAttribute:99});
// Active profiles. Every player row belongs to exactly one of them (players.category).
export const ratingProfiles=Object.freeze({[UZBEK_LEAGUE.category]:UZBEK_LEAGUE});
export const DEFAULT_CATEGORY=UZBEK_LEAGUE.category;
export function ratingProfileFor(category=DEFAULT_CATEGORY){
 const profile=Object.hasOwn(ratingProfiles,category)?ratingProfiles[category]:null;
 if(!profile)throw new RangeError('Unknown player category');
 return profile;
}
export const attributeKeys=Object.freeze(['pace','shooting','passing','dribbling','defending','physical']);
export function isValidOverall(overall,profile=UZBEK_LEAGUE){
 return Number.isInteger(overall)&&overall>=profile.minOverall&&overall<=profile.maxOverall;
}
export function isValidPotential(potential,overall,profile=UZBEK_LEAGUE){
 return Number.isInteger(potential)&&potential>=overall&&potential<=profile.maxPotential;
}
export function isValidAttributes(attributes,profile=UZBEK_LEAGUE){
 return Boolean(attributes)&&attributeKeys.every(key=>Number.isInteger(attributes[key])&&attributes[key]>=profile.minAttribute&&attributes[key]<=profile.maxAttribute);
}
// Throws unless overall, potential and (when given) attributes fit the profile.
export function assertValidRating({overall,potential,attributes},profile=UZBEK_LEAGUE){
 if(!isValidOverall(overall,profile))throw new RangeError('Overall must be between '+profile.minOverall+' and '+profile.maxOverall+' for '+profile.category);
 if(!isValidPotential(potential,overall,profile))throw new RangeError('Potential must be between overall and '+profile.maxPotential+' for '+profile.category);
 if(attributes!==undefined&&!isValidAttributes(attributes,profile))throw new RangeError('Attributes must be between '+profile.minAttribute+' and '+profile.maxAttribute+' for '+profile.category);
}
export const clampPotential=(potential,profile=UZBEK_LEAGUE)=>Math.min(profile.maxPotential,potential);

export function generateRoundRobin(clubIds){
 if(!Array.isArray(clubIds)||clubIds.length<2||clubIds.length%2!==0||new Set(clubIds).size!==clubIds.length)throw new Error('Round robin requires a unique even number of clubs');
 const rotation=clubIds.slice(),rounds=[];
 for(let round=0;round<rotation.length-1;round++){
  const fixtures=[];
  for(let i=0;i<rotation.length/2;i++){
   const a=rotation[i],b=rotation[rotation.length-1-i];
   const home=(round+i)%2===0?a:b,away=home===a?b:a;
   fixtures.push({roundNumber:round+1,homeClubId:home,awayClubId:away});
  }
  rounds.push(fixtures);
  rotation.splice(1,0,rotation.pop());
 }
 return rounds;
}
// League timing is fixed by the game rules and deliberately not configurable through the environment or the API.
export const LEAGUE_TIMEZONE='Asia/Tashkent';
export const LEAGUE_KICKOFF_TIME='20:00';
export const MATCH_DURATION_SECONDS=60;
// Home and away against every opponent: the second half mirrors the first with the venues swapped.
export function generateDoubleRoundRobin(clubIds){
 const first=generateRoundRobin(clubIds),half=first.length;
 const second=first.map((round,index)=>round.map(f=>({roundNumber:half+index+1,homeClubId:f.awayClubId,awayClubId:f.homeClubId})));
 return [...first,...second];
}
// One league round per calendar day, with one full rest day between the two halves of the season.
export function dayForRound(roundNumber,roundsPerHalf){
 if(!Number.isInteger(roundNumber)||!Number.isInteger(roundsPerHalf)||roundNumber<1||roundNumber>roundsPerHalf*2)throw new Error('Round is outside the season');
 return roundNumber<=roundsPerHalf?roundNumber:roundNumber+1;
}
// Division sizes and movement between them. Clubs beyond the main league's 18 places wait for the next season
// or form the second league once five or more are waiting.
export const MAIN_LEAGUE_MIN=10, MAIN_LEAGUE_MAX=18, SECOND_LEAGUE_MIN=5, SECOND_LEAGUE_MAX=18;
export const PROMOTION_PLACES=3, RELEGATION_PLACES=3;
// Days from the first matchday to the last one: every round once per half plus one rest day between the halves.
export function seasonDays(clubCount){
 const slots=clubCount+(clubCount%2);
 return 2*(slots-1)+1;
}
// An odd group plays with a bye: a null slot is added and the fixtures against it are dropped.
export function leagueSchedule(clubIds){
 const slots=clubIds.length%2?[...clubIds,null]:clubIds;
 const rounds=generateDoubleRoundRobin(slots),half=rounds.length/2;
 return rounds.flatMap(round=>round.filter(f=>f.homeClubId&&f.awayClubId).map(f=>({...f,dayNumber:dayForRound(f.roundNumber,half)})));
}
// Decides who is in each division for the next season. main and second are clubs already placed (in standing order);
// waiting is every eligible club not placed yet, oldest first. Returns the club ids for both divisions and the rest.
export function placeClubs({main=[],second=[],waiting=[]}){
 const toMain=waiting.slice(0,Math.max(0,MAIN_LEAGUE_MAX-main.length));
 const afterMain=waiting.slice(toMain.length);
 const secondRoom=SECOND_LEAGUE_MAX-second.length;
 const toSecond=second.length||afterMain.length>=SECOND_LEAGUE_MIN?afterMain.slice(0,Math.max(0,secondRoom)):[];
 return {main:[...main,...toMain],second:[...second,...toSecond],waiting:afterMain.slice(toSecond.length)};
}

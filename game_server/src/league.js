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
export function leagueSchedule(clubIds){
 const rounds=generateDoubleRoundRobin(clubIds),half=rounds.length/2;
 return rounds.flatMap(round=>round.map(f=>({...f,dayNumber:dayForRound(f.roundNumber,half)})));
}

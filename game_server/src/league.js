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

const firstNames = ['Azizbek','Jasur','Bekzod','Sardor','Diyor','Otabek','Kamron','Shahzod','Umid','Asadbek','Javohir','Temur','Farrukh','Ibrohim','Akmal','Mirjalol','Shoxrux','Sherzod','Bobur','Murodjon','Sanjar','Eldor','Nodir','Abdulaziz','Islom','Rustam','Suhrob','Oybek','Jamshid','Firdavs'];
const lastNames = ['Karimov','Tursunov','Rakhimov','Ismoilov','Akhmedov','Yuldashev','Ergashev','Aliyev','Sobirov','Nurmatov','Saidov','Qodirov','Mamatov','Xasanov','Rustamov','Abdullayev','Olimov','Eshonqulov','Rahmonov','Eshmatov'];
const positions = ['GK','CB','CB','LB','RB','DM','CM','CM','AM','LW','RW','ST'];
const keys = ['pace','shooting','passing','dribbling','defending','physical'];
const weights = {GK:[0,0,0,0,0.15,0.85],CB:[0.25,0,0.2,0.05,0.9,0.7],LB:[0.75,0.1,0.55,0.55,0.65,0.55],RB:[0.75,0.1,0.55,0.55,0.65,0.55],DM:[0.35,0.15,0.7,0.3,0.75,0.65],CM:[0.45,0.45,0.8,0.65,0.45,0.5],AM:[0.6,0.65,0.75,0.8,0.2,0.35],LW:[0.85,0.7,0.45,0.85,0.15,0.4],RW:[0.85,0.7,0.45,0.85,0.15,0.4],ST:[0.65,0.9,0.35,0.6,0.1,0.7]};
function attributesFor(overall, position, seed) {
 const w=weights[position];
 return Object.fromEntries(keys.map((key,i)=>[key,Math.max(20,Math.min(95,Math.round(overall+(w[i]-0.45)*22+((seed*(i+3))%7)-3)))]));
}
export const starterPlayers = [];
for (let i=0;i<360;i++) {
 const fullName=firstNames[i%firstNames.length]+' '+lastNames[Math.floor(i/firstNames.length)%lastNames.length];
 const position=positions[i%positions.length];
 const overall=46+((i*7+Math.floor(i/9)*3)%29);
 const potential=Math.min(92,overall+8+(i%13));
 const quality=overall<54?'academy':overall<62?'developing':overall<69?'established':'elite';
 starterPlayers.push({fullName,nationality:'UZ',age:18+(i*3%13),position,quality,overall,potential,attributes:attributesFor(overall,position,i+1),marketValueUzs:Math.round(overall*overall*17000)});
}
export const attributeNames=keys;

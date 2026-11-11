export function marketValueUzs(overall){
 if(!Number.isInteger(overall)||overall<1||overall>100)throw new RangeError('Overall must be between 1 and 100');
 return Math.round(overall*overall*17000);
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
export function saleValueUzs(marketValue){
 const value=BigInt(marketValue);
 if(value<0n)throw new RangeError('Market value cannot be negative');
 return value*80n/100n;
}

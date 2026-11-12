import test from 'node:test';
import assert from 'node:assert/strict';
import {marketValueUzs,qualityForOverall,upgradeCost,saleValueUzs,resaleRatePercent,overallFromAttributes,STARTING_BUDGET_UZS,LEAGUE_MATCH_INCOME_UZS,WAITING_STIPEND_UZS,MIN_SQUAD_SIZE,MAX_SQUAD_SIZE,STARTING_SQUAD_SIZE} from '../src/economy.js';
import {academySquadTemplate} from '../src/catalog.js';

test('approved economy constants',()=>{
 assert.equal(STARTING_BUDGET_UZS,20000000n);assert.equal(LEAGUE_MATCH_INCOME_UZS,750000n);assert.equal(WAITING_STIPEND_UZS,750000n);
 assert.equal(MIN_SQUAD_SIZE,13);assert.equal(MAX_SQUAD_SIZE,26);assert.equal(STARTING_SQUAD_SIZE,18);
});
test('price curve: 11,000,000 x 1.112^(overall-80), rounded to 10,000 UZS',()=>{
 const expected={45:270000,47:330000,50:460000,54:700000,58:1060000,60:1320000,65:2240000,70:3800000,75:6470000,76:7190000,80:11000000,85:18700000,90:31800000};
 for(const [overall,price] of Object.entries(expected))assert.equal(marketValueUzs(Number(overall)),price,'overall '+overall);
 for(let o=2;o<=100;o++){
  assert.ok(marketValueUzs(o)>=marketValueUzs(o-1),'never decreasing at '+o);
  if(o>=30)assert.ok(marketValueUzs(o)>marketValueUzs(o-1),'strictly increasing at '+o);
  assert.equal(marketValueUzs(o)%10000,0);
  assert.ok(Math.abs(marketValueUzs(o)-11e6*1.112**(o-80))<=5000);
 }
 assert.throws(()=>marketValueUzs(0));assert.throws(()=>marketValueUzs(101));assert.throws(()=>marketValueUzs(70.5));
});
test('a new club can afford one 80-rated player, but not two without selling players',()=>{
 assert.equal(marketValueUzs(80),11000000);
 assert.ok(BigInt(marketValueUzs(80))<=STARTING_BUDGET_UZS);
 assert.ok(2n*BigInt(marketValueUzs(80))>STARTING_BUDGET_UZS);
 // Selling the five most valuable academy players leaves 13 and adds 2.1M cash, enough for two 80s with only 100K left.
 const values=academySquadTemplate.map(([,o])=>marketValueUzs(o)).sort((a,b)=>b-a);
 const cash=STARTING_BUDGET_UZS+values.slice(0,5).reduce((n,v)=>n+saleValueUzs(v,50),0n);
 assert.equal(cash,22100000n);
 assert.equal(cash-2n*BigInt(marketValueUzs(80)),100000n);
 assert.equal(values.reduce((a,b)=>a+b,0),10520000,'starting squad list value');
});
test('quality tiers use provisional thresholds',()=>{
 assert.equal(qualityForOverall(53),'academy');assert.equal(qualityForOverall(54),'developing');
 assert.equal(qualityForOverall(62),'established');assert.equal(qualityForOverall(69),'elite');
});
test('upgrade cost increases with attribute level',()=>{
 assert.equal(upgradeCost(40,1),6);assert.equal(upgradeCost(49,2),13);
});
test('resale: academy players 50% on their first sale, everyone else 80%',()=>{
 assert.equal(resaleRatePercent({origin:'academy',first_sale_done:false}),50);
 assert.equal(resaleRatePercent({origin:'academy',first_sale_done:true}),80);
 assert.equal(resaleRatePercent({origin:'market',first_sale_done:false}),80);
 assert.equal(resaleRatePercent({origin:'generated',first_sale_done:false}),80);
 assert.equal(saleValueUzs('10000001'),8000000n);assert.equal(saleValueUzs('10000001',50),5000000n);
 assert.equal(saleValueUzs(marketValueUzs(58),50),1845000n);assert.equal(saleValueUzs(marketValueUzs(74),80),13544000n);
 assert.throws(()=>saleValueUzs(100,100));assert.throws(()=>saleValueUzs(-1));
 // Buying and reselling can never make money at either rate.
 for(let o=1;o<=100;o++)assert.ok(saleValueUzs(marketValueUzs(o),80)<BigInt(marketValueUzs(o)));
});
test('overall is the rounded-down attribute average, capped by potential, never lowered',()=>{
 const a={pace:56,shooting:62,passing:50,dribbling:55,defending:44,physical:57};
 assert.equal(overallFromAttributes(a,54,66),54);
 assert.equal(overallFromAttributes({...a,pace:57},54,66),54,'one point is not enough');
 assert.equal(overallFromAttributes({...a,pace:61},54,66),54,'five points are not enough');
 assert.equal(overallFromAttributes({...a,pace:62},54,66),55,'six points raise overall by one');
 assert.equal(overallFromAttributes({pace:99,shooting:99,passing:99,dribbling:99,defending:99,physical:99},54,66),66);
 assert.equal(overallFromAttributes({pace:1,shooting:1,passing:1,dribbling:1,defending:1,physical:1},54,66),54);
});

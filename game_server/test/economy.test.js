import test from 'node:test';
import assert from 'node:assert/strict';
import {marketValueUzs,qualityForOverall,upgradeCost,saleValueUzs} from '../src/economy.js';

test('market value scales with overall rating',()=>{
 assert.equal(marketValueUzs(50),42500000);
 assert.equal(marketValueUzs(70),83300000);
});
test('quality tiers use provisional thresholds',()=>{
 assert.equal(qualityForOverall(53),'academy');
 assert.equal(qualityForOverall(54),'developing');
 assert.equal(qualityForOverall(62),'established');
 assert.equal(qualityForOverall(69),'elite');
});
test('upgrade cost increases with attribute level',()=>{
 assert.equal(upgradeCost(40,1),6);
 assert.equal(upgradeCost(49,2),13);
});
test('sale value is 80 percent without floating point rounding',()=>{
 assert.equal(saleValueUzs('10000001'),8000000n);
});

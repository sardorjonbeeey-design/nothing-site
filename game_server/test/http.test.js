import test from 'node:test';
import assert from 'node:assert/strict';
import {safeString,colour,uuid,HttpError} from '../src/http.js';

test('safeString trims and enforces length',()=>{
 assert.equal(safeString('  ZAMIN  ',10,'Name'),'ZAMIN');
 assert.throws(()=>safeString('',10,'Name'),HttpError);
 assert.throws(()=>safeString('toolongname',4,'Name'),HttpError);
});
test('colour accepts only six digit hex colours',()=>{
 assert.equal(colour('#167a55','Colour'),'#167A55');
 assert.throws(()=>colour('red','Colour'),HttpError);
});
test('uuid rejects malformed identifiers',()=>{
 assert.equal(uuid('550e8400-e29b-41d4-a716-446655440000'),'550e8400-e29b-41d4-a716-446655440000');
 assert.throws(()=>uuid('not-a-uuid'),HttpError);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {saveCrest,readCrest} from '../src/uploads.js';

test('crest upload accepts a PNG signature and can read it back',async()=>{
 const bytes=Buffer.alloc(16);
 Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]).copy(bytes);
 const dataUrl='data:image/png;base64,'+bytes.toString('base64');
 const path=await saveCrest(dataUrl);
 const filename=path.slice('/uploads/'.length);
 try{
  const result=await readCrest(filename);
  assert.equal(result.type,'image/png');
  assert.deepEqual(result.bytes,bytes);
 }finally{await fs.rm(new URL('../uploads/'+filename,import.meta.url),{force:true});}
});
test('crest upload rejects SVG, malformed data and oversized images',async()=>{
 await assert.rejects(()=>saveCrest('data:image/svg+xml;base64,PHN2Zz4='));
 await assert.rejects(()=>saveCrest('not-an-image'));
 const bytes=Buffer.alloc(2*1024*1024+1,1);
 const dataUrl='data:image/png;base64,'+bytes.toString('base64');
 await assert.rejects(()=>saveCrest(dataUrl));
});
test('crest reader rejects path traversal',async()=>{
 await assert.rejects(()=>readCrest('../../.env'));
});

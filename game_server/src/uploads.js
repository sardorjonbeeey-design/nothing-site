import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {HttpError} from './http.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../uploads');
const types={
 'image/png':{ext:'png',magic:Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])},
 'image/jpeg':{ext:'jpg',magic:Buffer.from([0xff,0xd8,0xff])},
 'image/webp':{ext:'webp',magic:Buffer.from('RIFF')}
};
export async function saveCrest(dataUrl){
 if(typeof dataUrl!=='string'||dataUrl.length>3_000_000)throw new HttpError(400,'Crest image is missing or too large');
 const match=dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
 if(!match)throw new HttpError(400,'Only PNG, JPG or WEBP images are accepted');
 const type=match[1],bytes=Buffer.from(match[2],'base64'),meta=types[type];
 if(bytes.length<16||bytes.length>2*1024*1024)throw new HttpError(400,'Crest image must be under 2 MB');
 if(!bytes.subarray(0,meta.magic.length).equals(meta.magic))throw new HttpError(400,'Image content does not match its file type');
 if(type==='image/webp'&&bytes.toString('ascii',8,12)!=='WEBP')throw new HttpError(400,'Invalid WEBP image');
 await fs.mkdir(root,{recursive:true});
 const existing=await fs.readdir(root);let used=0;for(const item of existing){try{used+=(await fs.stat(path.join(root,item))).size;}catch{}}
 if(used+bytes.length>100*1024*1024)throw new HttpError(507,'Crest storage capacity reached');
 const filename=crypto.randomUUID()+'.'+meta.ext;
 await fs.writeFile(path.join(root,filename),bytes,{flag:'wx',mode:0o644});
 return '/uploads/'+filename;
}
export async function readCrest(filename){
 if(typeof filename!=='string'||! /^[0-9a-f-]{36}\.(png|jpg|webp)$/.test(filename))throw new HttpError(404,'Image not found');
 try{return {bytes:await fs.readFile(path.join(root,filename)),type:filename.endsWith('.png')?'image/png':filename.endsWith('.webp')?'image/webp':'image/jpeg'};}
 catch{throw new HttpError(404,'Image not found');}
}

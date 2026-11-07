'use strict';
const http=require('http'),crypto=require('crypto');
const SECRET=process.env.RECEIPT_SECRET||'';
const ORIGIN=process.env.ALLOW_ORIGIN||'https://sardorjonbeeey-design.github.io';
const API=(process.env.GUMROAD_API||'https://api.gumroad.com').replace(/\/$/,'');
const PORT=process.env.PORT||3000;
const EDITIONS={
 standard:{id:process.env.PID_STANDARD||'54118SBJtaklw4GV_IBCAw==',min:149},
 more:{id:process.env.PID_MORE||'FQo_RmBeeA4coZ_s3pPhCg==',min:357},
 extra:{id:process.env.PID_EXTRA||'-4_L5YAFDKpW4ayv_bcGSg==',min:1000}};
if(!SECRET||SECRET.length<24){console.error('RECEIPT_SECRET (24+ chars) is required');process.exit(1)}
const b64=b=>Buffer.from(b).toString('base64url');
const sign=s=>crypto.createHmac('sha256',SECRET).update(s).digest();
function mint(p){const body=b64(JSON.stringify(p));return body+'.'+b64(sign(body))}
function open(t){if(typeof t!=='string'||t.length>2000)return null;const[i,m]=t.split('.');if(!i||!m)return null;
 const want=sign(i),got=Buffer.from(m,'base64url');if(got.length!==want.length||!crypto.timingSafeEqual(got,want))return null;
 try{const p=JSON.parse(Buffer.from(i,'base64url').toString());return p&&p.v===1?p:null}catch(e){return null}}
function ref(purchaseId){const h=crypto.createHmac('sha256',SECRET).update('ref:'+purchaseId).digest();
 const A='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let s='';for(let i=0;i<8;i++)s+=A[h[i]%A.length];return 'S01-'+s}
const hits=new Map();
function limited(ip){const now=Date.now(),a=(hits.get(ip)||[]).filter(t=>now-t<60000);a.push(now);hits.set(ip,a);if(hits.size>5000)hits.clear();return a.length>10}
const clean=(s,n)=>typeof s==='string'?s.replace(/[\u0000-\u001f\u007f<>]/g,'').replace(/\s+/g,' ').trim().slice(0,n):'';
function ig(s){s=clean(s,31).replace(/^@/,'');return /^[A-Za-z0-9._]{1,30}$/.test(s)&&!/\.\.|\.$|^\./.test(s)?s:''}
async function verify(id,key,inc){
 const r=await fetch(API+'/v2/licenses/verify',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({product_id:id,license_key:key,increment_uses_count:inc?'true':'false'})});
 let j=null;try{j=await r.json()}catch(e){}return{status:r.status,j};}
function cors(res,req){res.setHeader('Access-Control-Allow-Origin',ORIGIN);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type')}
function send(res,code,obj){res.statusCode=code;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(obj))}
function readBody(req){return new Promise((ok,no)=>{let b='';req.on('data',c=>{b+=c;if(b.length>8000){no(new Error('big'));req.destroy()}});req.on('end',()=>ok(b));req.on('error',no)})}
async function claim(req,res){
 let d;try{d=JSON.parse(await readBody(req))}catch(e){return send(res,400,{error:'bad_request'})}
 const key=clean(d.licenseKey,100),nick=clean(d.nickname,18);
 if(!/^[A-Za-z0-9-]{8,64}$/.test(key))return send(res,400,{error:'invalid_key',message:'That license key doesn’t look right.'});
 if(!nick)return send(res,400,{error:'nickname',message:'Enter a name (up to 18 characters).'});
 let found=null;
 for(const [ed,cfg] of Object.entries(EDITIONS)){const r=await verify(cfg.id,key,false);if(r.j&&r.j.success&&r.j.purchase){found={ed,cfg,r:r.j};break}}
 if(!found)return send(res,404,{error:'not_found',message:'We couldn’t find a purchase for that key.'});
 const p=found.r.purchase;
 if(p.refunded||p.chargebacked)return send(res,403,{error:'refunded',message:'That purchase was refunded, so no receipt is issued.'});
 if(!Number.isInteger(p.price)||p.price<found.cfg.min)return send(res,403,{error:'amount',message:'That payment is below the edition price.'});
 if((found.r.uses||0)>0)return send(res,409,{error:'claimed',message:'This key has already been used to claim a receipt.'});
 const c=await verify(found.cfg.id,key,true);
 if(!c.j||!c.j.success||c.j.uses!==1)return send(res,409,{error:'claimed',message:'This key has already been used to claim a receipt.'});
 let date=new Date(p.sale_timestamp||p.created_at||Date.now());if(isNaN(date))date=new Date();
 const payload={v:1,ref:ref(p.id||p.order_number||key),date:date.toISOString().slice(0,10),edition:found.ed,amountCents:p.price,nickname:nick};
 const m=clean(d.message,80);if(m)payload.message=m;const g=ig(d.instagram);if(g)payload.instagram='@'+g;
 return send(res,200,{token:mint(payload)});
}
http.createServer(async(req,res)=>{cors(res,req);
 try{
  if(req.method==='OPTIONS'){res.statusCode=204;return res.end()}
  const u=new URL(req.url,'http://x');const ip=(req.headers['x-forwarded-for']||req.socket.remoteAddress||'').split(',')[0].trim();
  if(u.pathname==='/'&&req.method==='GET')return send(res,200,{ok:true});
  if(u.pathname==='/claim'&&req.method==='POST'){if(limited(ip))return send(res,429,{error:'slow_down',message:'Too many tries. Wait a minute.'});return await claim(req,res)}
  if(u.pathname==='/receipt'&&req.method==='GET'){const p=open(u.searchParams.get('token'));if(!p)return send(res,404,{verified:false});
   return send(res,200,Object.assign({verified:true},{ref:p.ref,date:p.date,edition:p.edition,amountCents:p.amountCents,nickname:p.nickname,message:p.message,instagram:p.instagram}))}
  send(res,404,{error:'not_found'})}
 catch(e){send(res,500,{error:'server',message:'Something went wrong. Try again.'})}
}).listen(PORT,()=>console.log('listening',PORT));

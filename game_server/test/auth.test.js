import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
process.env.TELEGRAM_BOT_TOKEN='123456:test-token-for-isolated-tests';
process.env.SESSION_SECRET='isolated-test-session-secret-which-is-long-enough';
process.env.TELEGRAM_AUTH_MAX_AGE_SECONDS='60';
const {verifyTelegramInitData}=await import('../src/auth.js');
function signedData(authDate){
 const params=new URLSearchParams();
 params.set('auth_date',String(authDate));
 params.set('user',JSON.stringify({id:123456789,first_name:'Test'}));
 const data=[...params.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+'='+v).join('\n');
 const key=crypto.createHmac('sha256','WebAppData').update(process.env.TELEGRAM_BOT_TOKEN).digest();
 const hash=crypto.createHmac('sha256',key).update(data).digest('hex');
 params.set('hash',hash);
 return params.toString();
}
test('Telegram initData validates a correct current signature',()=>{
 const user=verifyTelegramInitData(signedData(Math.floor(Date.now()/1000)));
 assert.equal(user.id,123456789);
});
test('Telegram initData rejects modified data',()=>{
 const raw=signedData(Math.floor(Date.now()/1000)).replace('Test','Tampered');
 assert.throws(()=>verifyTelegramInitData(raw));
});
test('Telegram initData rejects expired data',()=>{
 assert.throws(()=>verifyTelegramInitData(signedData(Math.floor(Date.now()/1000)-120)));
});

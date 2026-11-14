import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
test('admin server, admin client, and runtime config parse cleanly',()=>{
 for(const file of ['src/server.js','src/config.js']){
  const result=spawnSync(process.execPath,['--check',path.join(root,file)],{encoding:'utf8'});
  assert.equal(result.status,0,file+' syntax error: '+result.stderr);
 }
 const client=spawnSync(process.execPath,['--check',path.join(root,'../game_client/admin.js')],{encoding:'utf8'});
 assert.equal(client.status,0,'admin.js syntax error: '+client.stderr);
});
test('super-admin migration includes audit, entitlements and competition settings tables',async()=>{
 const sql=await (await import('node:fs/promises')).readFile(path.join(root,'db/008_super_admin.sql'),'utf8');
 for(const name of ['admin_audit_log','user_entitlements','competition_settings'])assert.match(sql,new RegExp('CREATE TABLE IF NOT EXISTS '+name));
 assert.match(sql,/actor_telegram_user_id/);
 assert.match(sql,/before_after JSONB/);
 assert.match(sql,/feature IN \\(\'gold\',\'vip\\)/);
});
test('admin static page and backend authorization are wired',async()=>{
 const server=await (await import('node:fs/promises')).readFile(path.join(root,'src/server.js'),'utf8');
 assert.match(server,/'\/admin':'admin.html'/);
 assert.match(server,/Super-admin access denied/);
 assert.match(server,/api\/admin\/funds/);
 assert.match(server,/api\/admin\/player-gift/);
 assert.match(server,/api\/admin\/entitlement/);
 assert.match(server,/api\/admin\/competition-setting/);
});

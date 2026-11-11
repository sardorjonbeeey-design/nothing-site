import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {requireDb,assertIsolatedDatabase} from './db.js';
const here=path.dirname(fileURLToPath(import.meta.url));
const dir=path.join(here,'../db');
const db=requireDb();
try{
 await assertIsolatedDatabase(db);
 await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(80) PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
 const files=(await fs.readdir(dir)).filter(name=>name.endsWith('.sql')).sort();
 for(const file of files){
  const version=file.replace(/\.sql$/,'');
  const applied=await db.query('SELECT 1 FROM schema_migrations WHERE version=$1',[version]);
  if(applied.rowCount){console.log('Skipped migration '+version);continue;}
  const sql=await fs.readFile(path.join(dir,file),'utf8');
  const client=await db.connect();
  try{
   await client.query('BEGIN');
   await client.query(sql);
   await client.query('INSERT INTO schema_migrations(version) VALUES($1)',[version]);
   await client.query('COMMIT');
   console.log('Applied migration '+version);
  }catch(error){await client.query('ROLLBACK');throw error;}
  finally{client.release();}
 }
}finally{await db.end();}

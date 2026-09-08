import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import * as credits from '../lib/credits.ts';
// Exercise the production route and its prepared SQL against an isolated SQLite database.
function fixture(){
 const db=new DatabaseSync(':memory:');
 db.exec(readFileSync(new URL('../drizzle/0000_free_crystal.sql',import.meta.url),'utf8'));
 const DB = {
   prepare(sql) {
     return {
       bind(...values) {
         return {
           async first() { return db.prepare(sql).get(...values) ?? null; },
           async run() { return { meta: { changes: Number(db.prepare(sql).run(...values).changes) } }; },
         };
       },
     };
   },
 };
 const code=ts.transpileModule(readFileSync(new URL('../app/api/wallet/route.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};
 const context=createContext({exports,require(name){if(name==='cloudflare:workers')return {env:{DB}};if(name==='@/lib/credits')return credits;throw new Error(name)},process:{env:{NODE_ENV:'production'}},Response,Request,URL,JSON,Error});
 runInContext(code,context);
 async function call(user,body,origin){const headers={};if(user)headers['oai-authenticated-user-id']=user;if(origin)headers.Origin=origin;const request=new Request('https://bank.example/api/wallet',{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined});const response=await exports[body?'POST':'GET'](request);return {status:response.status,data:await response.json()};}
 return {db,call};
}
test('API requires identity, isolates users, persists edits, confirms overdrafts and rejects stale writes',async()=>{
 const {call,db}=fixture();
 try{
  assert.equal((await call(null)).status,401);
  const setup=await call('a',{action:'setup',goal:1,timezone:'America/Chicago'});assert.equal(setup.status,200);assert.equal(setup.data.wallet.openingUnits,0);
  assert.equal((await call('b')).data.wallet,null);
  const date=setup.data.wallet.start;
  const clean=await call('a',{action:'log',date,count:0,note:'A clean day',revision:0});assert.equal(clean.status,200);
  assert.equal(credits.summary((await call('a')).data.wallet).balanceUnits,2);
  assert.equal((await call('a',{action:'spend',revision:1},'https://foreign.example')).status,403);
  const unconfirmed=await call('a',{action:'spend',revision:1});assert.equal(unconfirmed.status,422);assert.equal(unconfirmed.data.code,'overdraft');
  assert.equal((await call('a')).data.revision,1);
  const spend=await call('a',{action:'spend',revision:1,confirmOverdraft:true});assert.equal(spend.status,200);assert.equal(credits.summary(spend.data.wallet).balance,-1);
  assert.equal((await call('a',{action:'spend',revision:1,confirmOverdraft:true})).status,409);
  const corrected=await call('a',{action:'log',date,count:0,note:'Correction',revision:2});assert.equal(corrected.status,200);assert.equal(credits.summary(corrected.data.wallet).balanceUnits,2);
  assert.equal((await call('a',{action:'goal',goal:0.7,revision:3})).status,400);
  const goal=await call('a',{action:'goal',goal:.5,revision:3});assert.equal(goal.status,200);assert.equal(goal.data.wallet.weeklyGoal,.5);
 }finally{db.close()}
});
test('legacy conversion is persisted once and never credits a second allowance',async()=>{
 const {call,db}=fixture();
 try{
  const today=credits.todayIn('America/Chicago');
  const legacy={start:today,timezone:'America/Chicago',goals:[{week:0,goal:2}],logs:{[today]:{count:1,note:'Existing entry'}}};
  db.prepare('INSERT INTO wallets (user_id,data,revision) VALUES (?,?,?)').run('legacy',JSON.stringify(legacy),4);
  const first=await call('legacy');assert.equal(first.status,200);assert.equal(first.data.revision,5);assert.equal(credits.summary(first.data.wallet).balance,1);
  const second=await call('legacy');assert.deepEqual(second.data,first.data);
  assert.equal(JSON.parse(db.prepare('SELECT data FROM wallets WHERE user_id=?').get('legacy').data).version,2);
 }finally{db.close()}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { addDays, BalanceConfirmation, changeWallet, migrateWallet, summary, todayIn, validGoal } from '../lib/credits.ts';
const fresh=(weeklyGoal=1)=>({version:2,start:'2026-09-07',timezone:'America/Chicago',weeklyGoal,openingUnits:0,logs:{}});
const log=(w,date,count=0,extra={})=>changeWallet(w,{action:'log',date,count,note:'',...extra},date);
test('seven clean days earn exactly one credit; missing days earn nothing',()=>{
 let w=fresh();assert.equal(summary(w,'2026-12-01').balance,0);
 for(let n=0;n<7;n++)w=log(w,addDays(w.start,n));
 assert.equal(summary(w,'2026-09-13').balance,1);
 assert.equal(summary(w,'2027-09-13').balance,1);
});
test('half-step goals accumulate exactly and goal edits keep past earning rates',()=>{
 let w=fresh(.5);w=log(w,w.start);assert.equal(summary(w).balanceUnits,1);
 w=changeWallet(w,{action:'goal',goal:14},w.start);
 w=log(w,w.start);assert.equal(summary(w).balanceUnits,1);
 w=log(w,'2026-09-08');assert.equal(summary(w).balanceUnits,29);
 assert.equal(validGoal(.5),true);assert.equal(validGoal(14),true);
 for(const g of [0,14.5,.7,NaN,'1'])assert.equal(validGoal(g),false);
});
test('repeated daily check-in does not double count and spending replaces today’s clean credit',()=>{
 let w=log(fresh(), '2026-09-07');w=log(w,'2026-09-07');assert.equal(summary(w).balanceUnits,2);
 assert.throws(()=>changeWallet(w,{action:'spend'},w.start),BalanceConfirmation);
 w=changeWallet(w,{action:'spend',confirmOverdraft:true},w.start);
 assert.equal(summary(w).balance,-1);assert.equal(w.logs[w.start].count,1);
 w=changeWallet(w,{action:'spend',confirmOverdraft:true},w.start);
 assert.equal(summary(w).balance,-2);assert.equal(w.logs[w.start].count,2);
 w=log(w,w.start);assert.equal(summary(w).balanceUnits,2);
});
test('editing refunds the previous amount and does not add duplicate daily records',()=>{
 let w=fresh();w.openingUnits=42;w=log(w,w.start,2);assert.equal(summary(w).balance,1);
 w=log(w,w.start,1);assert.equal(summary(w).balance,2);assert.equal(Object.keys(w.logs).length,1);
 w=log(w,w.start,0);assert.equal(summary(w).balanceUnits,44);
});
test('invalid entries fail without changing existing data',()=>{
 const w=fresh();
 for(const entry of [{date:'2026-02-30',count:0},{date:'2026-09-08',count:0},{date:'2026-09-06',count:0},{date:w.start,count:-1},{date:w.start,count:1.2},{date:w.start,count:21}]){
  assert.throws(()=>changeWallet(w,{action:'log',...entry,note:''},w.start));
 }
 assert.deepEqual(w.logs,{});
});
test('legacy migration preserves exact balance, notes, and historical costs; runs once',()=>{
 const old={start:'2026-08-24',timezone:'America/Chicago',goals:[{week:0,goal:1},{week:1,goal:2}],logs:{'2026-08-26':{count:1,note:'Pizza'},'2026-08-27':{count:0,note:''}}};
 const w=migrateWallet(old,new Date('2026-09-07T18:00:00Z'));
 assert.equal(w.weeklyGoal,2);assert.equal(summary(w,'2026-09-07').balance,4);
 assert.equal(w.logs['2026-08-26'].note,'Pizza');assert.equal(w.logs['2026-08-27'].rateUnits,0);
 assert.equal(migrateWallet(w,new Date('2027-09-07T18:00:00Z')),w);
 assert.equal(summary(w,'2027-09-07').balance,4);
});
test('local date respects midnight and daylight saving',()=>{
 assert.equal(todayIn('America/Chicago',new Date('2026-09-07T02:00:00Z')),'2026-09-06');
 assert.equal(todayIn('America/Chicago',new Date('2026-11-01T07:00:00Z')),'2026-11-01');
});

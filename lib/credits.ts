export const UNITS_PER_CREDIT = 14;
export type DayLog = { count: number; rateUnits: number; note: string; updatedAt: number };
export type Wallet = {
  version: 2;
  start: string;
  timezone: string;
  weeklyGoal: number;
  openingUnits: number;
  migratedAt?: string;
  logs: Record<string, DayLog>;
};
type LegacyWallet = {start:string;timezone:string;goals:{week:number;goal:number}[];logs:Record<string,{count:number;note:string}>};
export const dayNumber = (s:string) => Date.parse(s+'T00:00:00Z')/86400000;
export const addDays = (s:string,n:number) => new Date((dayNumber(s)+n)*86400000).toISOString().slice(0,10);
export function todayIn(timezone:string, now=new Date()) {
  return new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
}
export function validGoal(goal:unknown):goal is number {
  return typeof goal==='number' && Number.isFinite(goal) && goal>=0.5 && goal<=14 && Number.isInteger(goal*2);
}
export function isDate(s:unknown):s is string {
  return typeof s==='string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(dayNumber(s)) && addDays(s,0)===s;
}
export function logUnits(log:DayLog) {return log.count===0 ? log.rateUnits : -log.count*UNITS_PER_CREDIT;}
export function summary(w:Wallet,today=todayIn(w.timezone)) {
  const entries=Object.entries(w.logs);
  const balanceUnits=w.openingUnits+entries.reduce((total,[,log])=>total+logUnits(log),0);
  return {today,goal:w.weeklyGoal,rate:w.weeklyGoal/7,balanceUnits,balance:balanceUnits/UNITS_PER_CREDIT,
    cleanDays:entries.filter(([,l])=>l.count===0).length,used:entries.reduce((n,[,l])=>n+l.count,0),loggedDays:entries.length};
}
export function migrateWallet(raw:Wallet|LegacyWallet,now=new Date()):Wallet {
  if('version' in raw && raw.version===2) return raw;
  const old=raw as LegacyWallet;
  const today=todayIn(old.timezone,now);
  const week=Math.max(0,Math.floor((dayNumber(today)-dayNumber(old.start))/7));
  let earned=0;
  for(let i=0;i<old.goals.length;i++){
    const g=old.goals[i],end=Math.min(week+1,old.goals[i+1]?.week??week+1);
    earned+=Math.max(0,end-g.week)*g.goal;
  }
  const goal=[...old.goals].reverse().find(g=>g.week<=week)?.goal??1;
  return {version:2,start:old.start,timezone:old.timezone,weeklyGoal:goal,openingUnits:earned*14,migratedAt:today,
    logs:Object.fromEntries(Object.entries(old.logs).map(([date,l])=>[date,{...l,rateUnits:0,updatedAt:Date.parse(date+'T12:00:00Z')}]))};
}
export type Mutation = {action:'goal';goal:number}|{action:'log';date:string;count:number;note:string}|{action:'spend'};
export class BalanceConfirmation extends Error {
  balance:number;
  constructor(balance:number){super('This entry will put your balance below zero.');this.balance=balance;}
}
export function changeWallet(w:Wallet,input:Record<string,unknown>,today=todayIn(w.timezone),now=Date.now()):Wallet {
  const next=structuredClone(w);
  if(input.action==='goal') {
    if(!validGoal(input.goal)) throw new Error('Choose 0.5–14 occasions per week, in steps of 0.5.');
    next.weeklyGoal=input.goal;
  } else if(input.action==='log' || input.action==='spend') {
    const date=input.action==='spend'?today:input.date;
    if(!isDate(date)||date<w.start||date>today) throw new Error('Choose a day between your start date and today.');
    const previous=w.logs[date];
    const count=input.action==='spend'?(previous?.count??0)+1:input.count;
    if(typeof count!=='number'||!Number.isInteger(count)||count<0||count>20) throw new Error('Enter 0–20 occasions for one day.');
    const note=input.action==='spend'?(previous?.note??''):input.note;
    if(typeof note!=='string'||note.length>180) throw new Error('Keep your note under 180 characters.');
    // A saved day retains its original earning rate, even after a goal change.
    next.logs[date]={count,rateUnits:previous?.rateUnits??w.weeklyGoal*2,note:note.trim(),updatedAt:now};
    const before=summary(w,today),after=summary(next,today);
    if(after.balanceUnits<0 && after.balanceUnits<before.balanceUnits && input.confirmOverdraft!==true) throw new BalanceConfirmation(after.balance);
  } else throw new Error('Unknown action.');
  return next;
}

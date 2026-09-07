'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Check, ChevronRight, Clock3, Coins, History, Leaf, Minus, Plus, Settings2, Wallet as WalletIcon, X } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { BankHeader, BalanceCard, CheckinCard } from './bank-ui';
import { logUnits, summary, validGoal, type Wallet } from '@/lib/credits';
type Data={wallet:Wallet|null;revision:number};
type Action=Record<string,unknown>;
type ApiResult=Data&{error?:string;code?:string;balance?:number};
const dateLabel=(d:string,options:Intl.DateTimeFormatOptions={month:'short',day:'numeric'})=>new Date(d+'T12:00:00').toLocaleDateString(undefined,options);
const amount=(n:number)=>(n>0?'+':'')+n.toFixed(2);
export default function Home(){
  const [data,setData]=useState<Data|null>(null);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false);
  const [tab,setTab]=useState('bank');
  const [settings,setSettings]=useState(false);
  const [goal,setGoal]=useState('1');
  const [editor,setEditor]=useState(false);
  const [date,setDate]=useState('');
  const [count,setCount]=useState(0);
  const [note,setNote]=useState('');
  const [overdraft,setOverdraft]=useState<{action:Action;balance:number}|null>(null);
  const [,setTick]=useState(0);
  const current=useRef(data);current.current=data;
  const lock=useRef(false);
  const load=useCallback(async()=>{
    if(lock.current)return;
    try{
      const response=await fetch('/api/wallet');
      const result=await response.json() as ApiResult;
      if(!response.ok)throw new Error(result.error??'Could not open your wallet.');
      setData(result);setError('');
    }catch(e){setError((e as Error).message);}
  },[]);
  useEffect(()=>{void load();const timer=setInterval(()=>setTick(n=>n+1),60000);const focus=()=>{void load()};window.addEventListener('focus',focus);return()=>{clearInterval(timer);window.removeEventListener('focus',focus)}},[load]);
  useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),4500);return()=>clearTimeout(timer)},[notice]);
  const act=useCallback(async(input:Action)=>{
    if(lock.current)return null;
    lock.current=true;setBusy(true);setError('');setNotice('');
    try{
      const response=await fetch('/api/wallet',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...input,revision:current.current?.revision})});
      const result=await response.json() as ApiResult;
      if(response.status===422&&result.code==='overdraft'){
        setOverdraft({action:input,balance:result.balance??0});return null;
      }
      if(!response.ok)throw new Error(result.error??'Could not save. Please try again.');
      current.current=result;setData(result);setOverdraft(null);setEditor(false);setSettings(false);
      setNotice(input.action==='goal'?'Goal updated. Your past credits stay the same.':input.action==='setup'?'Your bank is ready. Make your first check-in.':input.action==='spend'?'Occasion logged. Balance updated.':'Check-in saved.');
      return result;
    }catch(e){setError((e as Error).message);return null;}
    finally{lock.current=false;setBusy(false);}
  },[]);
  const w=data?.wallet;
  const s=w?summary(w):null;
  const todayEntry=w&&s?w.logs[s.today]:undefined;
  const openSettings=()=>{setGoal(String(w?.weeklyGoal??1));setError('');setSettings(true)};
  const openEditor=(d:string)=>{
    const log=w?.logs[d];setDate(d);setCount(log?.count??0);setNote(log?.note??'');setError('');setEditor(true);
  };
  const selectDate=(d:string)=>{if(!d)return;const log=w?.logs[d];setDate(d);setCount(log?.count??0);setNote(log?.note??'');};
  const logToday=(n:number)=>{if(s)void act({action:'log',date:s.today,count:n,note:todayEntry?.note??''})};
  useEffect(()=>{
    const context=(document as any).modelContext;
    if(!context?.registerTool)return;
    const lifecycle=new AbortController();
    const definitions=[{
      name:'read_credit_wallet',description:'Read the clean-day credit bank, current earning rate, and daily logs.',
      inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},
      execute:()=>({wallet:current.current?.wallet??null,summary:current.current?.wallet?summary(current.current.wallet):null}),
    },{
      name:'save_daily_check_in',description:'Save or replace a daily check-in. Count 0 banks the daily earning rate; positive counts spend one credit per occasion. Below-zero spending stages a visible confirmation.',
      inputSchema:{type:'object',properties:{date:{type:'string',format:'date'},count:{type:'integer',minimum:0,maximum:20},note:{type:'string',maxLength:180}},required:['date','count','note'],additionalProperties:false},
      annotations:{readOnlyHint:false,untrustedContentHint:true},execute:async(input:any)=>{
        const result=await act({action:'log',date:input?.date,count:input?.count,note:input?.note});
        return result?.wallet?{saved:true,summary:summary(result.wallet)}:{saved:false,message:'Check the visible confirmation or error.'};
      },
    }];
    for(const tool of definitions){try{void Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{})}catch{}}
    return()=>lifecycle.abort();
  },[act]);
  const firstRun=!!data&&!w;
  const rows=w?Object.entries(w.logs).sort(([a],[b])=>b.localeCompare(a)):[];
  const historyRows=(limit?:number)=>(limit?rows.slice(0,limit):rows).map(([d,l])=><button className="activity-row" key={d} onClick={()=>openEditor(d)} aria-label={`Edit ${dateLabel(d)}, ${l.count===0?'clean day':l.count+' junk-food occasions'}`}><span className={'activity-icon '+(l.count>0?'debit':'')}>{l.count===0?<ArrowDownLeft size={18}/>:<ArrowUpRight size={18}/>}</span><span className="activity-description"><strong>{l.count===0?'Clean day':l.count===1?'Ate junk':`${l.count} junk-food occasions`}</strong><span>{s?.today===d?'Today':dateLabel(d,{weekday:'short',month:'short',day:'numeric',year:'numeric'})}{l.note&&` · ${l.note}`}</span></span><span className={'activity-amount '+(l.count>0?'debit-text':'')}>{amount(logUnits(l)/14)}</span><ChevronRight className="row-chevron" size={14}/></button>);
  const errorBox=error?<div className="error-message" role="alert">{error}<button className="text-button" onClick={()=>{void load()}}>Refresh wallet</button></div>:null;
  return <main className="bank-app">
    <BankHeader goal={w?.weeklyGoal??null} onSettings={data?openSettings:undefined}/>
    {!data?<div className="loading"><Coins size={32}/><p>{error?'Let’s reconnect.':'Opening your bank…'}</p>{errorBox}</div>:<Tabs value={tab} onValueChange={v=>{setTab(String(v));setError('')}}>
      <div className="bank-content">
        {!settings&&!editor&&!overdraft&&errorBox}
        <div aria-live="polite">{notice&&<div className="notice"><Check size={16}/>{notice}</div>}</div>
        <TabsContent value="bank">
          <BalanceCard balance={s?.balance??0} rate={s?.rate??1/7} busy={busy||!w} junkToday={!!todayEntry?.count} onSpend={()=>{void act({action:'spend'})}}/>
          <CheckinCard dateLabel={s?dateLabel(s.today,{month:'short',day:'numeric'}):'Today'} checked={!!todayEntry} count={todayEntry?.count??0} delta={todayEntry?logUnits(todayEntry)/14:0} busy={busy||!w} onClean={()=>logToday(0)} onJunk={()=>logToday(1)} onEdit={()=>s&&openEditor(s.today)}/>
          <section className="activity-section"><div className="section-label">RECENT ACTIVITY<button className="view-all" onClick={()=>setTab('activity')}>View all <ChevronRight size={13}/></button></div>{rows.length?historyRows(3):<div className="empty-state"><Clock3 size={24}/><p>Your story starts with a check-in.</p><span>Bank a clean day or log an occasion above.</span></div>}</section>
          <div className="bank-rule"><Leaf size={14}/><span>Save a little today. Enjoy it another day.</span></div>
        </TabsContent>
        <TabsContent value="activity"><div className="activity-title"><span className="section-label">YOUR DAILY RECORD</span><h2>A little, every day.</h2><p>Every check-in and every credit, in one place.</p></div><div className="activity-stats"><div><strong>{s?.cleanDays??0}</strong><span>clean days</span></div><div><strong>{s?.used??0}</strong><span>occasions</span></div><div><strong>{s?.loggedDays??0}</strong><span>days logged</span></div></div><button className="past-day-button" onClick={()=>s&&openEditor(s.today)}><Plus size={17}/>Log or edit a day</button><div className="section-label history-label">ALL ACTIVITY<span>{rows.length} days</span></div>{rows.length?historyRows():<div className="empty-state"><History size={27}/><p>A fresh start.</p><span>Your saved check-ins will appear here.</span></div>}{w?.migratedAt&&<div className="legacy-note"><Coins size={17}/><div><strong>Previous allowance carried over</strong><p>+{(w.openingUnits/14).toFixed(2)} credits added from your original wallet. Earlier check-ins and their costs are preserved.</p></div></div>}</TabsContent>
      </div>
      <nav className="bottom-nav" aria-label="App navigation"><TabsList className="bank-tabs"><TabsTrigger value="bank"><WalletIcon size={20}/><span>My bank</span></TabsTrigger><TabsTrigger value="activity"><History size={20}/><span>Activity</span></TabsTrigger></TabsList><button className="nav-settings" onClick={openSettings}><Settings2 size={20}/><span>Settings</span></button></nav>
    </Tabs>}
    <Dialog open={firstRun||settings} onOpenChange={open=>{if(!firstRun&&!busy)setSettings(open)}}>
      <DialogContent className="app-sheet" showCloseButton={false}>
        <div className="sheet-handle"/>
        {!firstRun&&<button aria-label="Close settings" className="sheet-close" onClick={()=>setSettings(false)} disabled={busy}><X size={19}/></button>}
        <span className="sheet-symbol"><Coins size={25}/></span>
        <DialogTitle className="sheet-title">{firstRun?'Make it your kind of balance.':'Your pace. Your goal.'}</DialogTitle>
        <DialogDescription className="sheet-description">How many junk-food occasions would you like per week? Clean days add to your bank, a little at a time.</DialogDescription>
        <label className="field-label" htmlFor="weekly-goal">Occasions per week</label>
        <div className="goal-stepper"><button aria-label="Decrease weekly goal" disabled={busy||Number(goal)<=0.5} onClick={()=>setGoal(String(Math.max(.5,(Number(goal)||1)-.5)))}><Minus size={22}/></button><input id="weekly-goal" type="number" inputMode="decimal" min="0.5" max="14" step="0.5" value={goal} onChange={e=>setGoal(e.target.value)}/><button aria-label="Increase weekly goal" disabled={busy||Number(goal)>=14} onClick={()=>setGoal(String(Math.min(14,(Number(goal)||1)+.5)))}><Plus size={22}/></button></div>
        <div className="goal-explainer"><Leaf size={18}/><p>Each clean day banks <strong>+{validGoal(Number(goal))?(Number(goal)/7).toFixed(2):'—'} credits.</strong><br/>One junk-food occasion uses 1 credit.</p></div>
        {errorBox}
        <button className="primary-button" disabled={busy||!validGoal(Number(goal))} onClick={()=>{void act(firstRun?{action:'setup',goal:Number(goal),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone}:{action:'goal',goal:Number(goal)})}}>{busy?'Saving…':firstRun?'Open my bank':'Save goal'}<ArrowUpRight size={18}/></button>
        <p className="sheet-footnote">{firstRun?'Start at zero. Saved credits never expire.':'New goal, same savings. Past entries keep their original rate.'}</p>
      </DialogContent>
    </Dialog>
    <Dialog open={editor} onOpenChange={open=>{if(!busy)setEditor(open)}}><DialogContent className="app-sheet" showCloseButton={false}><div className="sheet-handle"/><button className="sheet-close" aria-label="Close entry" disabled={busy} onClick={()=>setEditor(false)}><X size={19}/></button><DialogTitle className="sheet-title">Your daily check-in.</DialogTitle><DialogDescription className="sheet-description">Update this day’s total. Zero means a clean day. Your balance adjusts automatically.</DialogDescription><label htmlFor="entry-date" className="field-label">Day</label><input className="app-input" id="entry-date" type="date" min={w?.start} max={s?.today} value={date} onChange={e=>selectDate(e.target.value)}/><div className="entry-counter"><div><strong>Junk-food occasions</strong><span>{count===0?'A clean day':`${count} ${count===1?'credit':'credits'} used`}</span></div><div className="counter-controls"><button aria-label="One fewer occasion" disabled={busy||count===0} onClick={()=>setCount(n=>n-1)}><Minus size={18}/></button><output>{count}</output><button aria-label="One more occasion" disabled={busy||count===20} onClick={()=>setCount(n=>n+1)}><Plus size={18}/></button></div></div><label className="field-label" htmlFor="entry-note">Note <span>optional</span></label><textarea id="entry-note" className="app-input" rows={2} maxLength={180} value={note} onChange={e=>setNote(e.target.value)} placeholder="Pizza with friends…"/>{errorBox}<button className="primary-button" disabled={busy||!date} onClick={()=>{void act({action:'log',date,count,note})}}>{busy?'Saving…':'Save check-in'}<Check size={18}/></button></DialogContent></Dialog>
    <AlertDialog open={!!overdraft} onOpenChange={open=>{if(!open&&!busy)setOverdraft(null)}}><AlertDialogContent className="app-sheet overdraft-sheet"><span className="sheet-symbol debit"><UtensilIcon/></span><AlertDialogTitle className="sheet-title">A little ahead of your bank?</AlertDialogTitle><AlertDialogDescription className="sheet-description">This will bring your balance to <strong>{overdraft?.balance.toFixed(2)} credits</strong>. You can still log it. Future clean days will rebuild your balance.</AlertDialogDescription>{errorBox}<button className="primary-button" disabled={busy} onClick={()=>{if(overdraft)void act({...overdraft.action,confirmOverdraft:true})}}>{busy?'Saving…':'Log it anyway'}</button><button className="cancel-button" disabled={busy} onClick={()=>setOverdraft(null)}>Go back</button></AlertDialogContent></AlertDialog>
  </main>;
}
function UtensilIcon(){return <ArrowUpRight size={24}/>}

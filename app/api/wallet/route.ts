import { env } from 'cloudflare:workers';
import { BalanceConfirmation, changeWallet, migrateWallet, todayIn, validGoal, type Wallet } from '@/lib/credits';
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
function user(req:Request){return req.headers.get('oai-authenticated-user-id') || (process.env.NODE_ENV==='development'?'local-preview':null)}
type Row={data:string;revision:number};
async function readWallet(id:string):Promise<{wallet:Wallet;revision:number}|null>{
  for(let attempt=0;attempt<3;attempt++){
    const row=await env.DB.prepare('SELECT data, revision FROM wallets WHERE user_id = ?').bind(id).first<Row>();
    if(!row) return null;
    const raw=JSON.parse(row.data);
    if(raw.version===2) return {wallet:raw,revision:row.revision};
    const wallet=migrateWallet(raw);
    const result=await env.DB.prepare('UPDATE wallets SET data = ?, revision = revision + 1 WHERE user_id = ? AND revision = ?').bind(JSON.stringify(wallet),id,row.revision).run();
    if(result.meta.changes) return {wallet,revision:row.revision+1};
  }
  throw new Error('Your wallet changed. Please refresh.');
}
export async function GET(req:Request){
  const id=user(req);if(!id)return json({error:'Sign in to access your credits.'},401);
  try{return json(await readWallet(id)??{wallet:null,revision:0});}
  catch{return json({error:'Your wallet could not load. Please try again.'},503);}
}
export async function POST(req:Request){
  const id=user(req);if(!id)return json({error:'Sign in to save your credits.'},401);
  const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)return json({error:'Invalid request origin.'},403);
  let input:Record<string,unknown>;
  try{input=await req.json() as Record<string,unknown>;if(!input||typeof input!=='object')throw new Error();}
  catch{return json({error:'Invalid request.'},400);}
  try{
    const current=await readWallet(id);
    if(!current){
      if(input.action!=='setup'||!validGoal(input.goal)||typeof input.timezone!=='string')return json({error:'Choose a weekly goal between 0.5 and 14.'},400);
      let start:string;try{start=todayIn(input.timezone);}catch{return json({error:'Choose a valid time zone.'},400);}
      const wallet:Wallet={version:2,start,timezone:input.timezone,weeklyGoal:input.goal,openingUnits:0,logs:{}};
      const result=await env.DB.prepare('INSERT OR IGNORE INTO wallets (user_id, data, revision) VALUES (?, ?, 0)').bind(id,JSON.stringify(wallet)).run();
      if(!result.meta.changes)return json({error:'Your wallet changed. Refresh and try again.'},409);
      return json({wallet,revision:0});
    }
    if(input.revision!==current.revision)return json({error:'Your wallet changed in another window. Refresh and try again.'},409);
    let wallet:Wallet;
    try{wallet=changeWallet(current.wallet,input);}
    catch(e){if(e instanceof BalanceConfirmation)return json({code:'overdraft',error:e.message,balance:e.balance},422);return json({error:(e as Error).message},400);}
    const result=await env.DB.prepare('UPDATE wallets SET data = ?, revision = revision + 1 WHERE user_id = ? AND revision = ?').bind(JSON.stringify(wallet),id,current.revision).run();
    if(!result.meta.changes)return json({error:'Your wallet changed. Refresh and try again.'},409);
    return json({wallet,revision:current.revision+1});
  }catch{return json({error:'We couldn’t save that. Please try again.'},503);}
}

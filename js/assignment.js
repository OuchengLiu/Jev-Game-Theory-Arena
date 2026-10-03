import { CONFIG } from './config.js';
import { settings } from './settings.js';
const PREFIX='jev-experiment-v2:';
const memory=new Map();
let visit;
try {visit=sessionStorage.getItem(PREFIX+'visit');} catch {}
visit ||= crypto.randomUUID();
try {sessionStorage.setItem(PREFIX+'visit',visit);} catch {}
export async function prepareAssignment(game) {
  let a=memory.get(game);
  if(!a) {try {a=JSON.parse(sessionStorage.getItem(PREFIX+game));} catch {}}
  if(!a || a.experiment!=='2' || a.expires<Date.now()) {
    try {
      if(!CONFIG.proxyUrl) throw new Error('offline');
      const r=await fetch(CONFIG.proxyUrl.replace(/\/decide\/?$/,'/assignment'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({visit,game}),signal:AbortSignal.timeout(5000)});
      if(!r.ok) throw new Error('assignment unavailable');
      a=await r.json();
      if(!['jev','luna'].includes(a.opponent) || !['raw','hinted'].includes(a.mode) || !['standard','generalization'].includes(a.variant) || a.experiment!=='2') throw new Error('invalid assignment');
    } catch {
      a={id:crypto.randomUUID(),game,experiment:'2',opponent:'jev',mode:Math.random()<.75?'raw':'hinted',variant:Math.random()<.75?'standard':'generalization',policy:Math.random()<.75?'greedy':'sample',source:'offline',expires:Date.now()+2*3600000};
    }
  }
  memory.set(game,a);
  try {sessionStorage.setItem(PREFIX+game,JSON.stringify(a));} catch {}
  return a;
}
export function rememberManual(game, key, value) {
  const old=memory.get(game) || {};
  const get=k=>k===key ? value : settings.get(k);
  const a={...old,game,experiment:'2',opponent:get('opponent'),mode:get('jevMode'),variant:get('variant'),policy:get('policy'),source:'manual',expires:Date.now()+2*3600000};
  memory.set(game,a);
  try {sessionStorage.setItem(PREFIX+game,JSON.stringify(a));} catch {}
}

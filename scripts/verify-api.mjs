import {mkdir,writeFile} from 'node:fs/promises';
import {createBlotto} from '../js/games/blotto-core.js';
import {createDice} from '../js/games/liarsdice-core.js';
import {createHoldem} from '../js/games/holdem-core.js';
import {buildJevRequest} from '../shared/prompts.js';
import {validateAnswers} from '../worker/src/models.js';

// Fixed loopback endpoint: synthetic requests must never reach the production database.
const base='http://localhost:8787', origin='http://localhost:8000';
const fixtures=[];
const rng=()=>{let n=73453;return ()=>((n=(Math.imul(n,1664525)+1013904223)>>>0)/2**32);};
for(const variant of ['standard','generalization']) {
 const b=createBlotto(variant).makePayloads([]),d=createDice(variant),h=createHoldem(variant);
 const hand=h.newHand([200,200],0,rng());
 for(const mode of ['raw','hinted']) {
  const payloads={
   pd:{round:1,total:10,history:[]},rps:{round:1,total:20,history:[]},
   ultimatum:{role:'propose',round:1,total:8,history:[]},
   blotto:b[mode],
   liarsdice:(mode==='raw'?d.makeRawPayload([1,2,3,4,5],5,[]):d.makePayload([1,2,3,4,5],5,[],{})).payload,
   holdem:mode==='raw'?h.makeRawPayload(hand,0):h.makePayload(hand,0,h.emptyStats(),[],1,100,rng()),
  };
  for(const [game,payload] of Object.entries(payloads))fixtures.push({game,variant,mode,payload,questions:buildJevRequest(game,payload,mode,variant).questions});
 }
}
if(process.argv.includes('--fixtures-only')) {
 console.log(`Validated ${fixtures.length} request fixtures locally. No model calls made.`);
 process.exit(0);
}
const report={started:new Date().toISOString(),endpoint:base,expected:fixtures.length,results:[]};
for(const f of fixtures) {
 const {questions,...body}=f,started=Date.now(),row={game:f.game,variant:f.variant,mode:f.mode};
 try {
  const res=await fetch(base+'/decide',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({...body,experiment:'2',opponent:'jev'}),signal:AbortSignal.timeout(20000)});
  const data=await res.json();row.status=res.status;
  if(!res.ok)throw new Error(JSON.stringify(data));
  validateAnswers(questions,data.answers);
  row.ok=true;row.model=data.model;
  row.options=Object.fromEntries(Object.entries(questions).map(([k,q])=>[k,q.criteria?Object.keys(q.criteria).length:'probability']));
 } catch(e) {row.ok=false;row.error=String(e.message).slice(0,1500);}
 row.ms=Date.now()-started;report.results.push(row);
 console.log(`${row.ok?'PASS':'FAIL'} ${f.game} / ${f.variant} / ${f.mode} (${row.ms} ms)${row.ok?'':' '+row.error}`);
 // Stop systemic failures; don't repeatedly consume credits for an inaccessible account.
 if(!row.ok && (!row.status || [401,403,429].includes(row.status) || /not_configured|upstream_busy/.test(row.error)))break;
 await new Promise(resolve=>setTimeout(resolve,1100));
}
report.passed=report.results.filter(r=>r.ok).length;
report.ok=report.passed===report.expected;
await mkdir('.verification',{recursive:true});
await writeFile('.verification/api-report.json',JSON.stringify(report,null,2)+'\n');
console.log(`${report.passed}/${report.expected} passed. Report: .verification/api-report.json`);
console.log('This checks live API compatibility, not strategic quality or full-game UI behavior.');
if(!report.ok)process.exitCode=1;

// DOM integration smoke test. JSDOM_MODULE points to an installed jsdom module.
import {createRequire} from 'node:module';
import {buildJevRequest} from '../shared/prompts.js';
import {checkBatch} from '../shared/telemetry.js';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {JSDOM}=require(process.env.JSDOM_MODULE || 'jsdom');
const variant=process.env.RULE_VARIANT || 'generalization',mode=process.env.DECISION_MODE || 'raw';
const dom=new JSDOM('<div id="app"></div>',{url:'https://example.com/#/play/pd',pretendToBeVisual:true});
for(const k of ['window','document','Node','Element','HTMLElement','localStorage','sessionStorage','location','navigator','getComputedStyle','requestAnimationFrame','cancelAnimationFrame'])Object.defineProperty(globalThis,k,{value:typeof dom.window[k]==='function'&&['getComputedStyle','requestAnimationFrame','cancelAnimationFrame'].includes(k)?dom.window[k].bind(dom.window):dom.window[k],configurable:true});
window.matchMedia=globalThis.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});window.scrollTo=()=>{};
Element.prototype.scrollIntoView=()=>{};dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new window.Event('close'));};
let requests=[],logs=[],errors=[];
window.addEventListener('error',e=>errors.push(e.error));process.on('unhandledRejection',e=>errors.push(e));
globalThis.fetch=async(url,init={})=>{
 const path=new URL(url,location.href).pathname;const data=init.body?JSON.parse(init.body):{};
 if(path==='/assignment')return Response.json({id:'12345678-abcd-1234-abcd-123456789012',game:data.game,experiment:'2',opponent:'jev',mode,variant,policy:'greedy',source:'adaptive',expires:Date.now()+3600000});
 if(path==='/decide'){
  try{const req=buildJevRequest(data.game,data.payload,data.mode,data.variant);requests.push(data);return Response.json({model:'typesafe/jev',answers:Object.fromEntries(Object.entries(req.questions).map(([k,q])=>[k,q.type==='noul'?{type:'noul',noul:.5}:{type:'choice',choice:Object.keys(q.criteria)[0],probabilities:Object.fromEntries(Object.keys(q.criteria).map((x,i,ks)=>[x,i===0?1:0]))}]))});}catch(e){console.error('Invalid request',data.game,data.variant,data.payload.street,data.payload.hand);errors.push(e);return Response.json({error:'bad_request'},{status:400});}
 }
 if(path==='/log'){try{checkBatch(data);logs.push(data);}catch(e){errors.push(e);}return Response.json({ok:true});}
 if(path==='/stats')return Response.json({enabled:true,cols:['game','game_ver','kind','mode','policy','act','n'],rows:[['pd','1.4','end','raw','greedy','win',5]],
  comparisons:['standard','generalization'].map((variant,i)=>({game:'pd',game_ver:'2.0',mode:'raw',variant,policy:'greedy',model:'typesafe/jev',n:i?7:2,players:1,unidentified_matches:0,model_wins:i?4:1,human_wins:i?2:1,draws:i?1:0,human_score:2,opponent_score:3,human_score_n:i?7:2,opponent_score_n:i?7:2})),
  models:{jev:{available:true,label:'Jev'}},
  matches:['standard','generalization'].map((variant,i)=>({game:'pd',opponent:'jev',mode:'raw',variant,policy:'greedy',assignment_source:'adaptive',mixed:0,n:i?7:2,human_wins:1,draws:0,human_score:2,opponent_score:3})),
  modern:['standard','generalization'].flatMap((variant,i)=>[{game:'pd',game_ver:'2.0',opponent:'jev',variant,policy:'greedy',assignment_source:'adaptive',kind:'move',actor:'human',mode:'raw',phase:'r1',act:'C',detail:'',n:3},{game:'pd',game_ver:'2.0',opponent:'jev',variant,policy:'greedy',assignment_source:'manual',kind:'end',mode:'raw',act:'win',detail:'',n:i?7:2}]),updated:new Date().toISOString()});
 return Response.json({version:'2.0.0'});
};
const nativeTimeout=globalThis.setTimeout;
const wait=ms=>new Promise(r=>nativeTimeout(r,ms));
globalThis.setTimeout=(fn,ms,...args)=>nativeTimeout(fn,Math.min(ms,50),...args);
await import('../js/app.js');
for(const game of ['pd','rps','ultimatum','blotto','liarsdice','holdem']){
 location.hash=`#/play/${game}`;await wait(100);
 if(variant==='generalization') {
  const notice=document.querySelector('.rule-dialog');assert.ok(notice,`${game}: missing automatic rules notice`);
  assert.equal(document.querySelectorAll('.board button').length,0,'Do not start play before rule acknowledgement');
  notice.querySelector('.rule-confirm').click();await wait(100);
 }
 const board=document.querySelector('.board');assert.ok(board,game);
 
 
 if(game==='pd')for(let i=0;i<10;i++){board.querySelector('.pd-move')?.click();await wait(35);}
 if(game==='rps')for(let i=0;i<20;i++){board.querySelector('button.rps-throw')?.click();await wait(35);}
 if(game==='ultimatum'){board.querySelector('.ug-offer')?.click();await wait(100);}
 if(game==='blotto'){
  assert.equal(board.querySelectorAll('.bl-plan').length,0);
  assert.equal(board.querySelectorAll('.bl-step').length,variant==='standard'?6:8);
  if(variant==='generalization')for(const name of ['plain','pass','port'])assert.ok(board.querySelector(`[data-terrain="${name}"]`));
  // Human can freely design an extreme allocation.
  for(let i=0;i<10;i++)board.querySelector('[data-focus="plus-0"]').click();
  assert.equal(board.querySelector('.bl-num').textContent,'10');
  assert.equal(board.querySelector('.bl-deploy').disabled,false);
  board.querySelector('.bl-deploy').click();await wait(100);
 }
 if(game==='liarsdice'){await wait(200);[...board.querySelectorAll('button')].find(b=>b.textContent.startsWith('Bid ')&&!b.disabled)?.click();await wait(200);[...board.querySelectorAll('button')].find(b=>b.textContent==='Liar!'&&!b.disabled)?.click();await wait(200);}
 if(game==='holdem'){[...board.querySelectorAll('button')].find(b=>b.textContent.startsWith('Call'))?.click();await wait(200);}
 
}
// Switching before any move must recreate the core, not just change the header.
location.hash='#/play/blotto';await wait(100);
const alternate=variant==='generalization'?'Standard':'Rule variant';
[...document.querySelectorAll('.controls button')].find(b=>b.textContent===alternate)?.click();await wait(50);
const ruleDialog=document.querySelector('.rule-dialog');assert.ok(ruleDialog,'Every rule switch explains differences');
assert.equal(ruleDialog.querySelectorAll('.rule-option').length,2);
// Cancelling leaves the active rules and board intact.
ruleDialog.querySelector('.ghost').click();await wait(60);
assert.equal(document.querySelectorAll('.bl-field').length,variant==='generalization'?4:3);
[...document.querySelectorAll('.controls button')].find(b=>b.textContent===alternate).click();
document.querySelector('.rule-confirm').click();await wait(100);
assert.equal(document.querySelectorAll('.bl-field').length,variant==='generalization'?3:4);
// Returning to the game retains the manual selection.
location.hash='#/';await wait(60);location.hash='#/play/blotto';await wait(100);
assert.equal(document.querySelectorAll('.bl-field').length,variant==='generalization'?3:4);
location.hash='#/insights';await wait(100);
assert.equal(document.querySelectorAll('.ins-body .ins-game').length,6);
assert.ok(!document.querySelector('.ins-comparison'),'No separate experiment page');
assert.ok(!document.querySelector('.ins-body').textContent.includes('Assignment'));
assert.equal(document.querySelector('.ins-body .stats .stat b').textContent,'7','All versions includes five historical and two new matches');
assert.ok(document.querySelector('.ins-body .viz-svg'));
const tableToggle=document.querySelector('.ins-body .viz-toggle');tableToggle.click();
assert.ok(document.querySelector('.ins-body .viz-table'));tableToggle.click();
[...document.querySelectorAll('.ins-filter button')].find(b=>b.textContent==='Current').click();
assert.equal(document.querySelector('.ins-body .stats .stat b').textContent,'7','Current gameplay includes audited 1.4 history');
[...document.querySelectorAll('.ins-filter button')].find(b=>b.textContent==='Rule variant').click();
assert.equal(document.querySelector('.ins-body .stats .stat b').textContent,'7','Variant data never includes legacy standard games');
[...document.querySelectorAll('.ins-filter button')].find(b=>b.textContent==='Compare').click();
assert.ok(document.querySelector('.ins-compare-pair'));
assert.equal(document.querySelectorAll('.ins-body .ins-game').length,6);
assert.ok(document.querySelector('.ins-body').textContent.includes('Anonymous players'));
assert.ok([...document.querySelectorAll('.ins-filter button')].find(b=>b.textContent==='All versions').disabled);
const comparisonTable=document.querySelector('.ins-body .viz-toggle');comparisonTable.click();assert.ok(document.querySelector('.ins-body .viz-table'));
[...document.querySelectorAll('.ins-filter button')].find(b=>b.textContent==='Hinted').click();
assert.equal(document.querySelectorAll('.ins-compare-pair').length,0,'Never reuse raw observations in hinted comparison');
assert.equal(document.querySelectorAll('.variant-note').length,0);
if(errors.length)console.error(errors.map(e=>e.stack));
for(const game of ['pd','rps','ultimatum','blotto','liarsdice','holdem'])assert.ok(requests.some(r=>r.game===game),`No decision exercised for ${game}`);
assert.ok(logs.some(b=>b.e.some(e=>e.k==='end'&&e.g==='pd')));
assert.ok(logs.some(b=>b.e.some(e=>e.k==='end'&&e.g==='rps')));
console.log(`${variant}/${mode}: ${requests.length} validated decisions, ${logs.length} validated telemetry batches, ${errors.length} errors`);
if(errors.length)console.error(errors.map(e=>e.stack));
if(errors.length)process.exit(1);process.exit(0);

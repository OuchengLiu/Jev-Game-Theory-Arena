import test from 'node:test';
import assert from 'node:assert/strict';
import {createBlotto} from '../js/games/blotto-core.js';
import {createRps} from '../shared/games/rps.js';
import {createPd} from '../shared/games/pd.js';
import {createUltimatum} from '../shared/games/ultimatum.js';
import {createDice} from '../js/games/liarsdice-core.js';
import {createHoldem} from '../js/games/holdem-core.js';
import {buildJevRequest} from '../shared/prompts.js';
import {assignmentProbabilities,chooseAssignment,cellKey} from '../shared/experiment.js';
import {availableModels,validateAnswers} from '../worker/src/models.js';
const variants=['standard','generalization'];
const rng=()=>{let n=73453;return ()=>((n=(Math.imul(n,1664525)+1013904223)>>>0)/2**32);};
function sameOptions(game,raw,hinted,v) {
 const a=buildJevRequest(game,raw,'raw',v),b=buildJevRequest(game,hinted,'hinted',v);
 assert.deepEqual(Object.keys(a.questions),Object.keys(b.questions));
 for(const k in a.questions) if(a.questions[k].criteria) assert.deepEqual(Object.keys(a.questions[k].criteria),Object.keys(b.questions[k].criteria));
 assert.throws(()=>buildJevRequest(game,{...raw,current_human_move:'secret'},'raw',v));
 return a;
}
for(const v of variants) {
 test(`${v}: full Blotto action sets, symmetric scoring and no unbeatable allocation`,()=>{
  const c=createBlotto(v),p=c.makePayloads([]);sameOptions('blotto',p.raw,p.hinted,v);
  assert.equal(p.candidateIds.length,v==='standard'?16:32);
  for(const a of c.ALLOCS) {assert.equal(a.reduce((s,x)=>s+x,0),c.SOLDIERS);let beaten=false;
   for(const b of c.ALLOCS) {const ab=c.roundResult(a,b),ba=c.roundResult(b,a);assert.equal(ab+ba,0);beaten ||= ab<0;}
   assert.ok(beaten,`${a} must have a counter`);
   assert.ok(c.ALLOCS.some(b=>c.roundResult(a,b)>0),`${a} must beat an opponent`);
   for(const b of c.ALLOCS) {
    const weaklyBetter=c.ALLOCS.every(x=>c.roundResult(b,x)>=c.roundResult(a,x));
    const strictlyBetter=c.ALLOCS.some(x=>c.roundResult(b,x)>c.roundResult(a,x));
    assert.ok(!(weaklyBetter&&strictlyBetter),`${a} must not be dominated by ${b}`);
   }
  }
 });
 test(`${v}: RPS chooses its own move, plus independent prediction`,()=>{
  const c=createRps(v),p={round:1,total:12,history:[]};
  const req=sameOptions('rps',p,p,v);assert.deepEqual(Object.keys(req.questions.action.criteria),['rock','paper','scissors']);assert.ok(req.questions.predict);
  for(const a of c.THROWS) {assert.equal(c.outcomeOf(a,a),'draw');}
 });
 test(`${v}: PD and ultimatum equal modes`,()=>{
  sameOptions('pd',{round:1,total:10,history:[]},{round:1,total:10,history:[]},v);
  const p={role:'propose',round:1,total:8,history:[]};sameOptions('ultimatum',p,p,v);
 });
 test(`${v}: all legal dice bids, no private-dice filtering`,()=>{
  const c=createDice(v),a=c.makeRawPayload([1,2,3,4,5],5,[]),b=c.makeRawPayload([6,6,6,6,6],5,[]);
  assert.deepEqual(a.optionMap,b.optionMap);assert.equal(a.payload.options.length,v==='standard'?50:60);
  sameOptions('liarsdice',a.payload,c.makePayload([1,2,3,4,5],5,[],{}).payload,v);
  const bid={by:'opp',qty:10,face:6};const high=c.makeRawPayload([1,2,3,4,5],5,[bid]);assert.deepEqual(high.payload.options,[{id:'challenge'}]);
 });
 test(`${v}: Holdem hides opponent cards and undealt deck in both modes`,()=>{
  const c=createHoldem(v),hand=c.newHand([200,200],0,rng()),p=hand.actor ?? hand.toAct ?? 0;
  const raw=c.makeRawPayload(hand,p),hinted=c.makePayload(hand,p,c.emptyStats(),[],1,30,rng());
  sameOptions('holdem',raw,hinted,v);
  const altered=structuredClone(hand);altered.holes[1-p]=[50,51];altered.deck.reverse();
  assert.deepEqual(c.makeRawPayload(altered,p),raw);
  assert.deepEqual(c.makePayload(altered,p,c.emptyStats(),[],1,30,rng()),hinted);
 });
}
test('variant rules have their intended strategic changes',()=>{
 const r=createRps('generalization');assert.notEqual(r.outcomeOf('rock','paper'),createRps().outcomeOf('rock','paper'));
 assert.deepEqual(createPd('generalization').PAYOFF,{CC:[4,4],CD:[0,3],DC:[3,0],DD:[2,2]});
 assert.deepEqual(createUltimatum('generalization').rejectionPayoff,[1,2]);
 assert.equal(createDice('generalization').countFace([1,1,2],2),1);assert.equal(createDice().countFace([1,1,2],2),3);
 const c=createHoldem('generalization'),hole=[0,13],board=[1,2,3,4,5],five=c.legalFive(hole,board);assert.equal(five.length,5);assert.equal(five.filter(x=>hole.includes(x)).length,1);assert.equal(five.filter(x=>board.includes(x)).length,4);assert.equal(c.legalFive(hole,board.slice(0,3)),null);
});
test('adaptive allocation corrects imbalance and excludes unavailable models',()=>{
 assert.deepEqual(availableModels({AI:{}}),['jev']);assert.deepEqual(availableModels({}),[]);
 const counts={'jev:raw:standard':1000};const ps=assignmentProbabilities(counts,['jev']);assert.ok(ps.find(c=>c.mode==='raw'&&c.variant==='standard').probability<.05);
 const r=rng(),n={};for(let i=0;i<10000;i++){const a=chooseAssignment(n,['jev'],r);const k=cellKey(a);n[k]=(n[k]||0)+1;assert.equal(a.opponent,'jev');}
 for(const c of assignmentProbabilities({},['jev']))assert.ok(Math.abs(n[cellKey(c)]/10000-c.target)<.015);
 const future=assignmentProbabilities({'jev:raw:standard':1000},['jev','luna']);assert.ok(future.filter(c=>c.opponent==='luna').reduce((s,c)=>s+c.probability,0)>.5);
});
test('provider adapter output validation rejects malformed distributions',()=>{
 const q={action:{type:'choice',criteria:{a:'A',b:'B'}},p:{type:'noul'}};
 const good={action:{type:'choice',probabilities:{a:.3,b:.7}},p:{type:'noul',noul:.5}};
 assert.equal(validateAnswers(q,good).action.choice,'b');assert.throws(()=>validateAnswers(q,{...good,action:{type:'choice',probabilities:{a:1}}}));assert.throws(()=>validateAnswers(q,{...good,p:{type:'noul',noul:NaN}}));
});

test('provider boundary never falls through from disabled OpenAI to Jev',async()=>{
 const {runDecision}=await import('../worker/src/decision-provider.js');let calls=0;
 const env={AI:{run:async()=>{calls++;return {answers:{action:{type:'choice',probabilities:{rock:.2,paper:.3,scissors:.5}}}};}}};
 const request={state:{},questions:{action:{type:'choice',criteria:{rock:'R',paper:'P',scissors:'S'}}}};
 await assert.rejects(()=>runDecision('luna',env,request),e=>e.code==='not_configured');assert.equal(calls,0);
 const out=await runDecision('jev',env,request);assert.equal(calls,1);assert.equal(out.model,'typesafe/jev');assert.equal(out.answers.action.choice,'scissors');
});

test('all standard preflop labels remain valid when variant equity label is added',()=>{
 const c=createHoldem(),hand=c.newHand([200,200],0,rng()),payload=c.makePayload(hand,0,c.emptyStats(),[],1,10,rng());
 for(const kind of c.PREFLOP_KINDS)assert.doesNotThrow(()=>buildJevRequest('holdem',{...payload,hand:kind},'hinted','standard'));
});

test('oversized choices fail before a paid provider call',async()=>{
 const {runDecision}=await import('../worker/src/decision-provider.js');
 let calls=0;
 const criteria=Object.fromEntries(Array.from({length:256},(_,i)=>['a'+i,'Option '+i]));
 await assert.rejects(()=>runDecision('jev',{AI:{run:async()=>{calls++;}}},{questions:{action:{type:'choice',criteria}}}),/255-option/);
 assert.equal(calls,0);
});
test('generalized Blotto keeps all 32 legal actions after completed rounds',()=>{
 const c=createBlotto('generalization');
 const history=[{jev:c.ALLOCS[0],opp:c.ALLOCS[1]},{jev:c.ALLOCS[2],opp:c.ALLOCS[3]}];
 const p=c.makePayloads(history);
 const request=sameOptions('blotto',p.raw,p.hinted,'generalization');
 assert.equal(Object.keys(request.questions.action.criteria).length,32);
 assert.ok(c.PRIOR.every(Number.isFinite));
 assert.ok(Math.abs(c.PRIOR.reduce((a,b)=>a+b,0)-1)<1e-10);
});

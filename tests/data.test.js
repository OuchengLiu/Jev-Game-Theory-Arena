import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readdirSync,readFileSync} from 'node:fs';
import {logEvents,getStats} from '../worker/src/data.js';
import {ExperimentAllocator} from '../worker/src/allocator.js';
function database(){
 const db=new DatabaseSync(':memory:');
 for(const file of readdirSync(new URL('../worker/migrations/',import.meta.url)).sort()) db.exec(readFileSync(new URL(`../worker/migrations/${file}`,import.meta.url),'utf8'));
 return {db,prepare(sql){const st={args:[],bind(...args){this.args=args;return this;},async all(){return {results:db.prepare(sql).all(...this.args)};},run(){return db.prepare(sql).run(...this.args);}};return st;},async batch(stmts){db.exec('BEGIN');try{const r=stmts.map(s=>s.run());db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}};
}
const json=(status,data)=>Response.json(data,{status});
const base={g:'rps',gv:'2.0',m:'raw',pol:'greedy',ex:'2',v:'generalization',opp:'jev',as:'adaptive'};
const batch={s:'abcdefghijkl',b:'abcdefghijkl1',aid:'12345678-abcd-1234-abcd-123456789012',r:true,l:'en',av:'2.0.0',e:[{...base,k:'move',a:'jev',mdl:'typesafe/jev',ph:'r1',act:'rock',pr:{rock:.3,paper:.3,scissors:.4}},{...base,k:'end',act:'win',mix:false,hs:7,os:3}]};
const send=(DB,b=batch)=>logEvents(new Request('https://test/log',{method:'POST',body:JSON.stringify(b)}),{DB},{ip:'test',askGuard:async()=>({ok:true}),json,refuse:()=>json(403,{})});
test('D1 migrations, idempotent logging, cohort separation and score aggregation',async()=>{
 const DB=database();assert.equal((await send(DB)).status,200);assert.equal((await send(DB)).status,200);
 assert.equal(DB.db.prepare('SELECT COUNT(*) n FROM events').get().n,2);assert.equal(DB.db.prepare('SELECT SUM(n) n FROM agg_v2').get().n,2);assert.equal(DB.db.prepare('SELECT COUNT(*) n FROM agg').get().n,0);
 const stats=await (await getStats({DB},{waitUntil(){}},{},null)).json();assert.equal(stats.matches.length,1);assert.equal(stats.matches[0].human_score,7);assert.equal(stats.matches[0].human_wins,1);
 assert.equal((await send(DB,{...batch,b:'abcdefghijkl2',e:[{...base,k:'end',act:'lose',mix:true,hs:0,os:10}]})).status,200);
 assert.equal(DB.db.prepare('SELECT COUNT(*) n FROM experiment_matches').get().n,1);
});
test('allocator reuses assignments, excludes Luna, reserves concurrent arrivals',async()=>{
 const DB=database(),memory=new Map(),storage={get:async k=>memory.get(k),put:async(k,v)=>memory.set(k,v),delete:async k=>memory.delete(k),list:async()=>new Map(memory)};
 const a=new ExperimentAllocator({storage,blockConcurrencyWhile:fn=>fn()},{DB,AI:{}});
 const first=await a.assign({visit:'abcdefghijklm',game:'rps'}),second=await a.assign({visit:'abcdefghijklm',game:'rps'});
 assert.equal(first.id,second.id);assert.equal(first.opponent,'jev');assert.equal(memory.size,1);
 await a.assign({visit:'abcdefghijklz',game:'rps'});assert.equal(memory.size,2);
 await assert.rejects(()=>a.assign({visit:'bad',game:'rps'}));
});

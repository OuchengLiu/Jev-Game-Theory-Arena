import test from 'node:test';
import assert from 'node:assert/strict';
import {insightRows} from '../js/insights-data.js';
test('unified insights preserves historical versions, sources, rules and policy isolation',()=>{
 const base={game:'pd',kind:'end',mode:'raw',policy:'greedy',act:'win',detail:''};
 const old={...base,game_ver:'1.0',n:5};
 const modern=['adaptive','manual','offline'].map(assignment_source=>({...base,game_ver:'2.0',variant:'standard',opponent:'jev',assignment_source,n:1}));
 const data={rows:[old],modern:[...modern,{...modern[0],variant:'generalization',n:9},{...modern[0],detail:'mixed',n:100}],matches:[{n:999}]};
 const opts={currentVersions:{pd:'2.0'}};
 assert.equal(insightRows(data,opts).reduce((s,r)=>s+r.n,0),8);
 assert.equal(insightRows(data,{...opts,version:'latest'}).length,3);
 assert.equal(insightRows(data,{...opts,variant:'generalization'}).reduce((s,r)=>s+r.n,0),9);
 assert.equal(insightRows(data,{...opts,policy:'sample'}).length,0);
 assert.equal(insightRows({rows:[old],modern:[]},{...opts,version:'latest'}).length,0,'Do not relabel old records as current');
 assert.equal(data.rows[0].game_ver,'1.0');
});

test('current gameplay admits only audited historical modes and versions',()=>{
 const mk=(game,game_ver,mode='raw')=>({game,game_ver,mode,policy:'greedy',kind:'end',act:'win',n:1});
 const data={rows:[mk('pd','1.4'),mk('pd','1.3'),mk('ultimatum','1.4','hinted'),mk('blotto','1.4'),mk('blotto','1.4','hinted'),mk('rps','1.4'),mk('holdem','1.4'),mk('liarsdice','1.4')]};
 const rows=insightRows(data,{version:'latest',currentVersions:{pd:'2.0',ultimatum:'2.0',blotto:'2.1',rps:'2.0',holdem:'2.0',liarsdice:'2.0'}});
 assert.deepEqual(rows.map(r=>[r.game,r.mode]),[['pd','raw'],['ultimatum','hinted'],['blotto','raw']]);
 assert.ok(rows.every(r=>r.experiment==='1' && r.game_ver==='1.4'));
 assert.equal(insightRows(data,{version:'latest',currentVersions:{pd:'3.0'}}).length,0);
});

test('comparison never falls back to legacy results and isolates assistance and release',async()=>{
 const {comparisonGroups}=await import('../js/insights-data.js');
 const r={game:'pd',game_ver:'2.0',mode:'raw',policy:'greedy',model:'typesafe/jev',variant:'standard',n:4};
 const data={rows:[r],comparisons:[r,{...r,variant:'generalization'},{...r,mode:'hinted'},{...r,game_ver:'1.4'},{...r,policy:'sample'}]};
 assert.equal(comparisonGroups(data,{currentVersions:{pd:'2.0'}}).length,2);
 assert.equal(comparisonGroups({rows:[r]},{currentVersions:{pd:'2.0'}}).length,0);
});

test('practice history bypasses model policy filters and only audited bots enter current view',()=>{
 const make=(game)=>({game,game_ver:'1.4',kind:'end',mode:'practice',policy:'',act:'win',n:2});
 const data={rows:[make('pd'),make('ultimatum'),make('blotto'),make('rps'),{...make('pd'),kind:'move',actor:'bot',mode:'raw',n:4}]};
 const currentVersions={pd:'2.0',ultimatum:'2.0',blotto:'2.1',rps:'2.0'};
 for(const policy of ['greedy','sample']) {
  const all=insightRows(data,{policy,currentVersions});
  assert.equal(all.filter(r=>r.mode==='practice').length,4);
  const current=insightRows(data,{version:'latest',policy,currentVersions});
  assert.deepEqual(current.filter(r=>r.mode==='practice').map(r=>r.game),['pd','ultimatum']);
  assert.ok(current.some(r=>r.actor==='bot'));
 }
});

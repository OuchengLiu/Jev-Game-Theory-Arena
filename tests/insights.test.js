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

import { h, segmented } from './ui.js';
import { t } from './i18n.js';
import { groupedBars, statTile } from './charts.js';
import { GAME_IDS, cells, cellKey } from '../shared/experiment.js';

// Reuse the original insights renderer and chart components; only the data cohort changes.
export function experimentInsights(data, lang, render) {
  const zh=lang==='zh', root=h('div.ins-comparison'), L=(a,b)=>zh?a:b;
  const models=Object.entries(data.models || {jev:{available:true}}).filter(([,m])=>m.available).map(([id])=>id);
  let variant='standard', policy='greedy', source='adaptive', model=models[0] || 'jev';
  const filter=(label,values,current,change)=>[
    h('span',label),segmented(values.map(([value,label])=>({value,label})),current,v=>{change(v);draw();}),
  ];
  const draw=()=>{
    const matches=(data.matches || []).filter(r=>!r.mixed && r.variant===variant && r.policy===policy && r.assignment_source===source && r.opponent===model);
    const rows=(data.modern || []).filter(r=>r.variant===variant && r.policy===policy && r.assignment_source===source && r.opponent===model && r.kind!=='end');
    // End results come from complete, unmixed matches; never count partial sessions as matches.
    for(const r of matches)for(const [act,n] of [['win',r.human_wins],['draw',r.draws],['lose',r.n-r.human_wins-r.draws]]) {
      if(n)rows.push({...r,kind:'end',act,n});
    }
    const content=render({...data,rows,variant},lang);
    // Preserve the original per-game cards; add paired scores within the same card system.
    for(const [index,game] of ['holdem','liarsdice','blotto','pd','rps','ultimatum'].entries()) {
      const section=content.filter(el=>el.matches?.('.ins-game'))[index];
      const rs=matches.filter(r=>r.game===game);
      const tiles=['raw','hinted'].flatMap(mode=>['human_score','opponent_score'].map(key=>{
        const scored=rs.filter(r=>r.mode===mode && r[key]!=null), n=scored.reduce((s,r)=>s+r.n,0);
        const mean=n?(scored.reduce((s,r)=>s+r[key]*r.n,0)/n).toFixed(2):'—';
        return statTile(key==='human_score'?L('人类平均得分','Human mean score'):L('模型平均得分','Model mean score'),mean,`${t('mode.'+mode)} · n=${n}`);
      }));
      section?.append(h('div.stats.small',tiles));
    }
    const balanced=(data.matches || []).filter(r=>!r.mixed && r.assignment_source==='adaptive' && models.includes(r.opponent));
    const counts={};for(const r of balanced)counts[cellKey(r)]=(counts[cellKey(r)]||0)+r.n;
    const total=Object.values(counts).reduce((s,n)=>s+n,0);
    const cats=cells(models).map(c=>({...c,key:cellKey(c),label:`${t('mode.'+c.mode)} · ${t('experiment.'+c.variant)}`}));
    const labels={table:t('ins.table'),chart:t('ins.chart'),low:t('ins.low'),lowN:10,lowNote:t('ins.low_note',{n:10}),empty:t('ins.empty')};
    root.replaceChildren(
      h('div.ins-filter',
        filter(t('experiment.rules'),[['standard',t('experiment.standard')],['generalization',t('experiment.generalization')]],variant,v=>variant=v),
        filter(t('policy.label'),[['greedy',t('policy.greedy')],['sample',t('policy.sample')]],policy,v=>policy=v),
        filter(L('分配来源','Assignment'),[['adaptive',L('动态分配','Adaptive')],['manual',L('手动选择','Manual')],['offline',L('离线随机','Offline random')]],source,v=>source=v),
        models.length>1?filter(L('模型','Model'),models.map(m=>[m,data.models?.[m]?.label || m]),model,v=>model=v):null,
        h('small.muted',L('直觉与提示并列展示。完整对局排除练习及混合局；出招图统计所选条件下的已记录动作。','Raw and Hinted are shown side by side. Completed matches exclude practice and mixed sessions; move charts include recorded actions under the selected conditions.'))),
      ...content,
      h('section.ins-game',h('div.ins-game-head',h('h2',L('动态分配数据分布','Adaptive assignment distribution'))),
        h('div.ins-charts',groupedBars({title:L('目标与当前占比','Target and observed shares'),cats,
          series:[{key:'human',label:L('当前','Observed')},{key:'jev-raw',label:L('目标','Target')}],labels,
          note:L('汇总全部游戏的完整动态分配对局，不受上方筛选影响；实际分配按每个游戏单独纠偏。','Completed adaptive matches across all games, independent of the filters above. Allocation corrects each game separately.'),
          value:(c,se)=>total?{v:se.key==='human'?(counts[c.key]||0)/total:c.target,n:total}:null}))),
    );
  };draw();return root;
}

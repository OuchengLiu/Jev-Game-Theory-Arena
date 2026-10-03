import { h, segmented } from './ui.js';
import { t } from './i18n.js';
import { GAME_IDS, cells, cellKey } from '../shared/experiment.js';

// All aggregates are filtered to one ruleset, mode and policy. Never pool game scores.
export function experimentInsights(data, lang) {
  const zh=lang==='zh', root=h('div.ins-comparison');
  const L=(a,b)=>zh?a:b;
  const models=Object.entries(data.models || {jev:{available:true}}).filter(([,m])=>m.available).map(([id])=>id);
  let variant='standard', mode='raw', policy='greedy', source='adaptive';
  const select=(label, values, current, change)=>h('div.control',h('span.control-label',label),segmented(values.map(([value,label])=>({value,label})),current,v=>{change(v);draw();}));
  const table=(heads,rows)=>h('div.ins-table-scroll',h('table',h('thead',h('tr',heads.map(x=>h('th',x)))),h('tbody',rows.map(row=>h('tr',row.map(x=>h('td',x)))))));
  const draw=()=>{
    const all=data.matches || [];
    const selected=all.filter(r=>!r.mixed && r.variant===variant && r.mode===mode && r.policy===policy && r.assignment_source===source && models.includes(r.opponent));
    const rows=GAME_IDS.flatMap(game=>models.map(model=>{
      const rs=selected.filter(r=>r.game===game && r.opponent===model), sum=k=>rs.reduce((s,r)=>s+(Number(r[k])||0),0), n=sum('n');
      const score=k=>{const scored=rs.filter(r=>r[k]!=null),den=scored.reduce((s,r)=>s+r.n,0);return den?(scored.reduce((s,r)=>s+r[k]*r.n,0)/den).toFixed(2):'—';};
      return [t(`${game}.title`),data.models?.[model]?.label || model,n,n?`${(100*sum('human_wins')/n).toFixed(1)}%${n<10?' *':''}`:'—',n?`${(100*sum('draws')/n).toFixed(1)}%`:'—',score('human_score'),score('opponent_score')];
    }));
    const balanced=all.filter(r=>!r.mixed && r.assignment_source==='adaptive' && models.includes(r.opponent));
    const counts={};for(const r of balanced) counts[cellKey(r)]=(counts[cellKey(r)]||0)+r.n;
    const total=Object.values(counts).reduce((s,n)=>s+n,0);
    const dist=cells(models).map(c=>[data.models?.[c.opponent]?.label || c.opponent,t(`mode.${c.mode}`),t(`experiment.${c.variant}`),counts[cellKey(c)]||0,`${(100*c.target).toFixed(2)}%`,total?`${(100*(counts[cellKey(c)]||0)/total).toFixed(2)}%`:'—']);
    root.replaceChildren(
      h('p',L('实验 v2：公平对局、统一动作集合。历史数据在独立标签页保留。','Experiment v2: fair play and identical action sets. Historical data is kept in a separate tab.')),
      h('div.ins-filter',
        select(t('experiment.rules'),[['standard',t('experiment.standard')],['generalization',t('experiment.generalization')]],variant,v=>variant=v),
        select(L('提示','Assistance'),[['raw',t('mode.raw')],['hinted',t('mode.hinted')]],mode,v=>mode=v),
        select(t('policy.label'),[['greedy',t('policy.greedy')],['sample',t('policy.sample')]],policy,v=>policy=v),
        select(L('分配来源','Assignment'),[['adaptive',L('动态分配','Adaptive')],['manual',L('手动选择','Manual')],['offline',L('离线随机','Offline random')]],source,v=>source=v)),
      h('h2',L('对局结果','Match results')),
      table([L('游戏','Game'),L('模型','Model'),L('完整对局','Completed'),L('人类胜率','Human wins'),L('平局率','Draws'),L('人类平均得分','Human mean score'),L('模型平均得分','Model mean score')],rows),
      h('p.muted',L('* 少于 10 局。仅统计全程由同一模型完成的对局，排除练习及混合对局。不同游戏的分数不可直接比较；合作类游戏应结合双方收益解读。','* Fewer than 10 matches. Only matches completed with one model are included; practice and mixed matches are excluded. Scores are not comparable across games; interpret cooperation games using both players’ payoffs.')),
      h('h2',L('动态分配数据分布','Adaptive assignment distribution')),
      table([L('模型','Model'),L('提示模式','Assistance'),L('规则','Rules'),L('完整对局','Completed'),L('目标占比','Target'),L('当前占比','Observed')],dist),
      h('p.muted',L('上表汇总六个游戏的动态分配对局，不受结果筛选影响。实际分配按每个游戏的已完成数据和进行中的分配动态纠偏，目标为直觉:提示 3:1、常规:泛化性 3:1。','This table covers adaptive matches across all six games, independently of the result filters. Allocation adjusts per game using completed matches and active assignments, targeting Raw:Hinted 3:1 and Standard:Variant 3:1.')),
      h('p.ins-updated.muted',t('ins.updated',{time:new Date(data.updated).toLocaleString(zh?'zh-CN':'en')})));
  };draw();return root;
}

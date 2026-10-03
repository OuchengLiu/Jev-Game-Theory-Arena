import {h} from './ui.js';
import {t} from './i18n.js';
import {groupedBars,statTile} from './charts.js';
import {gameIcon} from './icons.js';
import {comparisonGroups} from './insights-data.js';

export function comparisonView(data,lang,options) {
 const L=(a,b)=>lang==='zh'?a:b, groups=comparisonGroups(data,options);
 const labels={table:t('ins.table'),chart:t('ins.chart'),low:t('ins.low'),lowN:10,lowNote:t('ins.low_note',{n:10}),empty:t('ins.empty')};
 const series=[{key:'jev-raw',label:t('experiment.standard')},{key:'jev-hinted',label:t('experiment.generalization')}];
 const out=[h('p.ins-filter-note.muted',L('仅比较当前实验中自动分配、全程由同一模型完成的对局。历史、手动选择、练习及混合局不进入对照。同一玩家可玩多局，局数不是独立样本数；差值仅为描述性结果，不表示统计显著。','Only current, automatically assigned matches completed with one model are compared. Legacy, manual, practice and mixed sessions are excluded. Players may contribute multiple matches; differences are descriptive, not significance tests.'))];
 if(!Array.isArray(data.comparisons))out.push(h('p.ins-empty',L('对比数据接口尚未更新，请先部署新版 Worker。','Comparison data is unavailable; update the Worker first.')));
 for(const game of ['holdem','liarsdice','blotto','pd','rps','ultimatum']) {
  const rows=groups.filter(r=>r.game===game), models=[...new Set(rows.map(r=>r.model))];
  const section=h('section.ins-game',h('div.ins-game-head',h('span.ins-icon',{html:gameIcon(game,22)}),h('h2',t(`${game}.title`))));
  if(!models.length)section.append(h('p.ins-none',t('ins.none')));
  for(const model of models) {
   const a=rows.find(r=>r.model===model && r.variant==='standard'),b=rows.find(r=>r.model===model && r.variant==='generalization');
   section.append(h('p.muted',`${model} · ${t('mode.'+options.mode)}`));
   const tiles=[['standard',a],['generalization',b]].map(([variant,r])=>h('div',
    h('h3',t('experiment.'+variant)),h('div.stats.small',
     statTile(L('完整对局','Completed matches'),r?.n ?? 0),
     statTile(L('匿名玩家','Anonymous players'),r?.players ?? 0,
      L('按浏览器编号去重，跨组不相加','Distinct browser IDs; do not add across groups'))),
    h('p.muted',!r?L('暂无记录','No records'):r.unidentified_matches?L(`${r.unidentified_matches}局缺少玩家编号，人数不完整。`,`${r.unidentified_matches} matches have no player ID; the player count is incomplete.`):r.players<10?L('玩家样本较少，暂不作结论。','Few players; no conclusion yet.'):'')
   ));
   section.append(h('div.ins-compare-pair',tiles));
   const cats=[{key:'model_wins',label:L('模型胜率','Model wins')},{key:'human_wins',label:L('人类胜率','Human wins')},{key:'draws',label:L('平局率','Draws')}];
   section.append(h('div.ins-charts',groupedBars({title:L('对局结果','Match outcomes'),cats,series,labels,
    value:(c,se)=>{const r=se.key==='jev-raw'?a:b;return r?.n?{v:r[c.key]/r.n,n:r.n}:null;}})));
   section.append(h('div.stats.small.ins-compare-delta',
    statTile(L('模型胜率差：泛化－常规','Model win-rate difference: variant − standard'),a?.n && b?.n?`${((b.model_wins/b.n-a.model_wins/a.n)*100).toFixed(1)} pp`:'—',L('描述性差值；两组人数及对手可能不同','Descriptive; player populations may differ'))));
   section.append(h('div.ins-compare-pair',[['standard',a],['generalization',b]].map(([v,r])=>h('div.stats.small',
    statTile(L('人类平均收益','Human mean payoff'),r?.human_score_n?r.human_score.toFixed(2):'—',`${t('experiment.'+v)} · n=${r?.human_score_n || 0}`),
    statTile(L('模型平均收益','Model mean payoff'),r?.opponent_score_n?r.opponent_score.toFixed(2):'—',`${t('experiment.'+v)} · n=${r?.opponent_score_n || 0}`)))));
  }
  section.append(h('p.viz-note',L('不同规则下收益尺度与决策难度可能改变，原始分数不直接作差。布洛托还改变地域数量及模型候选数，不能将全部差异归因为规则理解能力。','Payoff scales and decision difficulty can change, so raw scores are not subtracted. Blotto also changes field and candidate counts; differences cannot be attributed solely to rule understanding.')));
  out.push(section);
 }
 return out;
}

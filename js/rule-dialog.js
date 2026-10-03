import { h } from './ui.js';
import { t, registerStrings } from './i18n.js';
import { settings } from './settings.js';
import { variantText } from './variants.js';

registerStrings('ruleDialog', {
  en: {
    title: 'Check the rules before you play',
    selected: 'You are about to play: {variant}',
    restart: 'Switching rules starts a new match. Your current match will end without a completed result.',
    same: 'Both players use the selected rules. The controls and play area stay in the same place.',
    start: 'Got it — start playing', switch: 'Use these rules', cancel: 'Keep current rules',
    ready: 'Review the rules to start your match.',
  },
  zh: {
    title: '开始前，请确认规则区别',
    selected: '即将使用：{variant}规则',
    restart: '切换规则将重新开局，当前未完成的对局不会计入完整对局结果。',
    same: '双方都按所选规则对局，操作方式和对局区域保持一致。',
    start: '明白了，开始对局', switch: '确认使用新规则', cancel: '保留当前规则',
    ready: '确认规则后开始对局。',
  },
});

// Concise comparisons; the full rules remain available on the game page.
const STANDARD = {
  pd: {zh:'双方合作各得3分；单方背叛时，背叛者得5分、合作者得0分；双方背叛各得1分。',en:'Mutual cooperation: 3 each. One defects: defector 5, cooperator 0. Mutual defection: 1 each.'},
  rps: {zh:'石头胜剪刀，剪刀胜布，布胜石头；同招平局。',en:'Rock beats scissors, scissors beats paper, paper beats rock. Same throws draw.'},
  blotto: {zh:'双方各10名士兵，从相同的16个固定方案中选择，分到3个战场；每处兵力多者获胜。赢得战场更多的一方赢本轮。',en:'Choose from the same 16 fixed plans to split 10 soldiers across 3 battlefields. More troops wins a field; winning more fields wins the round.'},
  ultimatum: {zh:'分配10枚金币；接受则按提议分配，拒绝则双方都得0枚。',en:'Split 10 coins. Accept the proposed split, or reject so both receive 0.'},
  liarsdice: {zh:'1点是万能点，叫点可选2至6；开盅时1点也计入被叫点数。',en:'Ones are wild. Bid on faces 2 through 6; ones also count toward the named face.'},
  holdem: {zh:'从2张底牌与5张公共牌中自由选出最好的5张，可用0、1或2张底牌。',en:'Choose the best five of two hole cards and five community cards, using zero, one or both hole cards.'},
};

export function showRuleDifference(game, target, { switching=false, restart=false, onConfirm }={}) {
  const lang=settings.get('lang');
  let confirmed=!switching;
  const card=(variant, text)=>h('section.rule-option', {class:variant===target?'selected':''},
    h('h4',t(`experiment.${variant}`)),h('p',text));
  const dlg=h('dialog.confirm.rule-dialog',{'aria-labelledby':'rule-dialog-title','aria-describedby':'rule-dialog-selected'},
    h('h3#rule-dialog-title',t('ruleDialog.title')),
    h('p#rule-dialog-selected.rule-selected',t('ruleDialog.selected',{variant:t(`experiment.${target}`)})),
    h('div.rule-comparison',card('standard',STANDARD[game.id]?.[lang] || STANDARD[game.id]?.en),card('generalization',variantText(game.id,lang))),
    h('p',t('ruleDialog.same')),
    restart ? h('p.rule-restart',t('ruleDialog.restart')) : null,
    h('div.confirm-actions',
      switching ? h('button.btn.ghost.sm',{type:'button',onclick:()=>dlg.close()},t('ruleDialog.cancel')) : null,
      h('button.btn.sm.rule-confirm',{type:'button',onclick:()=>{confirmed=true;dlg.close();}},t(switching?'ruleDialog.switch':'ruleDialog.start'))));
  dlg.addEventListener('close',()=>{dlg.remove();if(confirmed)onConfirm?.();},{once:true});
  document.body.append(dlg);
  dlg.showModal();
  return dlg;
}

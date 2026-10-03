// Audit baseline: 3cd842f42f10991af77bad9af174cb508b2435c5.
// Gameplay compatibility only: standard payoffs/actions/information remain unchanged.
// Prompt wording and model releases can differ; never use these rows as v2 controls.
export const LEGACY_GAMEPLAY = {
  pd: {current:'2.0',legacy:['1.4'],modes:['raw','hinted']},
  ultimatum: {current:'2.0',legacy:['1.4'],modes:['raw','hinted']},
  blotto: {current:'2.1',legacy:['1.4'],modes:['raw']},
};
export const versionKey=v=>String(v || '').split('.').map(Number).concat([0,0,0]).slice(0,3).join('.');
export function compatibleLegacy(row,current) {
  const rule=LEGACY_GAMEPLAY[row.game];
  return !!rule && versionKey(current)===versionKey(rule.current) && rule.modes.includes(row.mode)
    && rule.legacy.some(v=>versionKey(v)===versionKey(row.game_ver));
}

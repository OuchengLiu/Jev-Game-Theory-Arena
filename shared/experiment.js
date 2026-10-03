// Experimental cohort v2. Historical v1 observations remain separate.
export const EXPERIMENT = '2';
export const VARIANTS = ['standard', 'generalization'];
export const MODELS = ['jev', 'luna'];
export const GAME_IDS = ['pd','rps','ultimatum','blotto','liarsdice','holdem'];
export const cellKey = ({ opponent, mode, variant }) => `${opponent}:${mode}:${variant}`;
export function cells(models = MODELS) {
  return models.flatMap(opponent => ['raw','hinted'].flatMap(mode => VARIANTS.map(variant => ({
    opponent, mode, variant,
    target: (1/models.length) * (mode === 'raw' ? .75 : .25) * (variant === 'standard' ? .75 : .25),
  }))));
}
// Deficit-biased randomization. The 5% target-proportional component preserves exploration.
// Active reservations count as expected completions, so simultaneous arrivals spread out.
export function assignmentProbabilities(counts = {}, models = MODELS) {
  const options = cells(models);
  const total = options.reduce((sum,c)=>sum+(counts[cellKey(c)] || 0),0);
  const weights = options.map(c=>Math.max(0,c.target*(total+16)-(counts[cellKey(c)] || 0)));
  const sum=weights.reduce((a,b)=>a+b,0);
  return options.map((c,i)=>({...c, probability: .95*weights[i]/sum+.05*c.target}));
}
export function chooseAssignment(counts, models, rng = Math.random) {
  const options=assignmentProbabilities(counts,models);
  let n=rng();
  return options.find(c=>(n-=c.probability)<0) || options.at(-1);
}

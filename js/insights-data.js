import {compatibleLegacy,versionKey} from '../shared/data-compatibility.js';
// Legacy aggregates describe standard rules. Keep their original versions intact.
// Combine sources once; never add experiment_matches on top of end-event aggregates.
export function insightRows(data,{variant='standard',version='all',policy='greedy',currentVersions={}}={}) {
  const legacy=variant==='standard'?(data.rows || []).map(r=>({...r,variant:'standard',experiment:'1'})):[];
  const modern=(data.modern || []).filter(r=>r.variant===variant && (!r.opponent || r.opponent==='jev'));
  return [...legacy,...modern].filter(r=>
    !(r.kind==='end' && r.detail==='mixed') &&
    (r.mode==='practice' || r.actor==='bot' || (r.policy || 'sample')===policy) &&
    (version==='all' || (r.experiment==='1' ? compatibleLegacy(r,currentVersions[r.game]) : versionKey(r.game_ver)===versionKey(currentVersions[r.game]))));
}

// Strict comparisons exclude legacy and keep assistance, policy, game version and model separate.
export function comparisonGroups(data,{mode='raw',policy='greedy',currentVersions={}}={}) {
 return (data.comparisons || []).filter(r=>r.mode===mode && r.policy===policy &&
  versionKey(r.game_ver)===versionKey(currentVersions[r.game]));
}

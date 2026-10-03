// Legacy aggregates describe standard rules. Keep their original versions intact.
// Combine sources once; never add experiment_matches on top of end-event aggregates.
export function insightRows(data,{variant='standard',version='all',policy='greedy',currentVersions={}}={}) {
  const legacy=variant==='standard'?(data.rows || []).map(r=>({...r,variant:'standard',experiment:'1'})):[];
  const modern=(data.modern || []).filter(r=>r.variant===variant && (!r.opponent || r.opponent==='jev'));
  const normalize=v=>String(v || '').split('.').map(Number).concat([0,0,0]).slice(0,3).join('.');
  return [...legacy,...modern].filter(r=>
    !(r.kind==='end' && r.detail==='mixed') &&
    (r.mode==='practice' || r.actor==='bot' || (r.policy || 'sample')===policy) &&
    (version==='all' || normalize(r.game_ver)===normalize(currentVersions[r.game])));
}

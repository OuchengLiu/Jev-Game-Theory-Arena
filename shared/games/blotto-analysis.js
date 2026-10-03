// History-only estimate: P(win) + 0.5 P(draw). Never reads the human's current move.
export function blottoAnalysis(allocs, roundResult, past, generalized) {
  const weights=[0,0,0,generalized?1:0,1,.85,.5,.25,.1,.05,.08];
  const prior=allocs.map(a=>weights[Math.max(...a)]*(a.includes(0)&&Math.max(...a)<10?.7:1));
  const z=prior.reduce((a,b)=>a+b,0), model=prior.map(p=>p/z*2.5);
  const shape=a=>[...a].sort((a,b)=>b-a).join('-');
  past.forEach((a,k)=>{
    const i=allocs.findIndex(b=>b.join()===a.join());
    if(i<0)throw new Error('Invalid historical allocation');
    const w=.6+.8*(k+1)/past.length; model[i]+=w*.65;
    const perms=allocs.flatMap((b,j)=>(generalized?j===i:shape(b)===shape(a))?[j]:[]);
    for(const j of perms)model[j]+=w*.35/perms.length;
  });
  const total=model.reduce((a,b)=>a+b,0);
  for(let i=0;i<model.length;i++)model[i]/=total;
  const scores=allocs.map(a=>allocs.reduce((s,b,j)=>{const r=roundResult(a,b);return s+model[j]*(r>0?1:r===0?.5:0);},0));
  const picks=scores.map((s,i)=>({s,i})).sort((a,b)=>b.s-a.s||a.i-b.i).slice(0,255).map(x=>x.i).sort((a,b)=>a-b);
  return {model,scores,picks};
}

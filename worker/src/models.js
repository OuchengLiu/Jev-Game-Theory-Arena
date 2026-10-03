// Only verified decision interfaces can receive experimental traffic.
// GPT-6 Luna's documented Cloudflare endpoint is text generation, not Decisions.
// Do not silently substitute a chat model or invent model IDs / probability fields.
export const MODEL_STATUS = {
  jev: { label: 'Jev', available: true, interface: 'systemone' },
  luna: { label: 'Luna Decisions', available: false, reason: 'decision_api_unverified' },
};
export const availableModels = env => env.AI || env.TYPESAFE_API_KEY ? ['jev'] : [];
export function validateAnswers(questions, answers) {
  if (!answers || typeof answers !== 'object') throw new Error('Missing model answers');
  const clean={};
  for (const [id,q] of Object.entries(questions)) {
    const answer=answers[id];
    if(q.type==='noul') {
      if(answer?.type!=='noul' || !Number.isFinite(answer.noul) || answer.noul<0 || answer.noul>1) throw new Error('Invalid probability');
      clean[id]={type:'noul',noul:answer.noul};
    } else {
      const keys=Object.keys(q.criteria), probs=answer?.probabilities;
      if(answer?.type!=='choice' || !probs || Object.keys(probs).length!==keys.length || keys.some(k=>!Number.isFinite(probs[k]) || probs[k]<0 || probs[k]>1)) throw new Error('Invalid choice distribution');
      const sum=keys.reduce((s,k)=>s+probs[k],0);
      if(Math.abs(sum-1)>.02) throw new Error('Unnormalised distribution');
      const probabilities=Object.fromEntries(keys.map(k=>[k,probs[k]/sum]));
      const choice=keys.reduce((a,b)=>probabilities[b]>probabilities[a]?b:a);
      const entropy=-keys.reduce((s,k)=>s+(probabilities[k] ? probabilities[k]*Math.log(probabilities[k]):0),0);
      clean[id]={type:'choice',choice,probabilities,confidence:keys.length>1 ? 1-entropy/Math.log(keys.length):1};
    }
  }
  return clean;
}

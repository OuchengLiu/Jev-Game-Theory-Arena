import { validateChoiceLimits } from '../../shared/decision-limits.js';
import { availableModels, validateAnswers } from './models.js';
export class ProviderError extends Error {
  constructor(code, message, status=502, retryAfter=30) {super(message);this.code=code;this.status=status;this.retryAfter=retryAfter;}
}
function unwrap(raw) {
  let out=raw;
  for(let i=0;i<3 && out && !out.answers && typeof out==='object';i++) out=out.result ?? out.response ?? null;
  return out;
}
async function jev(env,request) {
  if(env.TYPESAFE_API_KEY) {
    const response=await fetch('https://api.typesafe.ai/v1/systemone',{
      method:'POST',headers:{Authorization:`Bearer ${env.TYPESAFE_API_KEY}`,'Content-Type':'application/json'},
      body:JSON.stringify(request),signal:AbortSignal.timeout(8000),
    });
    if(!response.ok) {
      if(response.status===429) throw new ProviderError('upstream_busy','Jev rate limit',503,60);
      if([401,403].includes(response.status)) throw new ProviderError('not_configured','Jev authentication failed',503,600);
      throw new ProviderError('unavailable',`Jev HTTP ${response.status}`);
    }
    return response.json();
  }
  let timer;
  try {
    const raw=await Promise.race([
      env.AI.run('typesafe/jev',{state:request.state,questions:request.questions}),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('timeout after 8s')),8000);}),
    ]);
    return {...unwrap(raw),model:unwrap(raw)?.model || 'typesafe/jev'};
  } finally {clearTimeout(timer);}
}
// Replace this stub only after the official Decisions protocol and account access are verified.
async function openaiDecisions() {
  throw new ProviderError('not_configured','OpenAI Decisions adapter is not yet verified',503,600);
}
const ADAPTERS={jev,luna:openaiDecisions};
export async function runDecision(opponent,env,request) {
  if(!availableModels(env).includes(opponent)) throw new ProviderError('not_configured','Decision model unavailable',503,600);
  try {
    validateChoiceLimits(request.questions);
    const result=await ADAPTERS[opponent](env,request);
    return {model:result.model,answers:validateAnswers(request.questions,result.answers)};
  } catch(e) {
    if(e instanceof ProviderError) throw e;
    const message=String(e?.message || e);
    if(/credit|billing|payment|2021/i.test(message)) throw new ProviderError('not_configured',message,503,600);
    if(/capacity|rate|limit|429|3040|neuron/i.test(message)) throw new ProviderError('upstream_busy',message,503,60);
    throw new ProviderError('unavailable',message);
  }
}

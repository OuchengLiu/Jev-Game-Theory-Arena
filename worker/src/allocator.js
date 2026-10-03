import { EXPERIMENT, GAME_IDS, chooseAssignment, cellKey } from '../../shared/experiment.js';
import { availableModels, MODEL_STATUS } from './models.js';
const TTL = 2*60*60*1000;
const ID=/^[a-z0-9-]{12,64}$/;
// Separate from daily rate counters: experiment state must never reset at midnight.
export class ExperimentAllocator {
  constructor(state,env) {this.state=state;this.env=env;this.storage=state.storage;}
  async fetch(request) {
    return this.state.blockConcurrencyWhile(async()=>{
      try { return Response.json(await this.assign(await request.json())); }
      catch(e) { console.log('assignment unavailable',e.message); return Response.json({error:'assignment_unavailable'},{status:503}); }
    });
  }
  async assign({visit,game}) {
    if(!ID.test(visit || '') || !GAME_IDS.includes(game)) throw new Error('Invalid assignment request');
    const models=availableModels(this.env);
    if(!models.length || !this.env.DB) throw new Error('Experiment dependencies unavailable');
    const now=Date.now(), key=`a:${visit}:${game}`;
    const previous=await this.storage.get(key);
    if(previous?.expires>now && models.includes(previous.opponent)) return {...previous,models:MODEL_STATUS};
    // Completed pure-model matches only, within this game and this cohort.
    const {results}=await this.env.DB.prepare('SELECT opponent, mode, variant, COUNT(*) AS n FROM experiment_matches WHERE experiment = ? AND game = ? AND mixed = 0 AND assignment_source = ? GROUP BY opponent, mode, variant').bind(EXPERIMENT,game,'adaptive').all();
    const counts=Object.fromEntries(results.map(r=>[cellKey(r),r.n]));
    const completed=await this.env.DB.prepare('SELECT DISTINCT assignment_id FROM experiment_matches WHERE game = ? AND day >= ? AND assignment_id IS NOT NULL').bind(game,new Date(now-TTL).toISOString().slice(0,10)).all();
    const done=new Set(completed.results.map(r=>r.assignment_id));
    const reservations=await this.storage.list({prefix:'a:'});
    for(const [k,a] of reservations) {
      if(a.expires<=now) {await this.storage.delete(k);continue;}
      if(a.game===game && !done.has(a.id) && models.includes(a.opponent)) counts[cellKey(a)]=(counts[cellKey(a)]||0)+.5;
    }
    const c=chooseAssignment(counts,models);
    const value={id:crypto.randomUUID(),game,experiment:EXPERIMENT,opponent:c.opponent,mode:c.mode,variant:c.variant,policy:Math.random()<.75?'greedy':'sample',probability:c.probability,source:'adaptive',expires:now+TTL};
    await this.storage.put(key,value);
    return {...value,models:MODEL_STATUS};
  }
}

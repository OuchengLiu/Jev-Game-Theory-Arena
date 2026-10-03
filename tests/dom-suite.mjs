import {execFileSync} from 'node:child_process';
for(const RULE_VARIANT of ['standard','generalization'])for(const DECISION_MODE of ['raw','hinted']){
 execFileSync(process.execPath,['tests/dom-smoke.mjs'],{stdio:'inherit',env:{...process.env,RULE_VARIANT,DECISION_MODE}});
}

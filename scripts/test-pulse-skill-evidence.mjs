import test from 'node:test';
import assert from 'node:assert/strict';
import { conditionFromFiles,prepareEvidence,caseDefinition,runnerPacket,validateEvidence,compareResults } from './lib/pulse-skill-evidence.mjs';

const scenario={id:1,case_id:'PS1',role:'repair',skill:'writing-pulse-skills',skill_path:'skills/writing-pulse-skills',prompt:'Keep or change the current guidance?',expected_output:'Preserve it when all cases pass.',expectations:['No unsupported change.']};
const condition=conditionFromFiles('skills/writing-pulse-skills/SKILL.md',[{path:'skills/writing-pulse-skills/SKILL.md',content:'Keep passing behavior.'},{path:'skills/writing-pulse-skills/references/rules.md',content:'Frozen references.'}]);
function complete() {
  const prepared=prepareEvidence({iteration:'control',configPath:'config.json',sourcePath:'corpus.json',scenarios:[scenario],conditions:{PS1:condition}});
  const evidence=structuredClone(prepared.evidence);
  evidence.runner={mode:'chat',model_id:'declared-test-model',model_version:'immutable-test-version',reasoning_effort:'low',runtime:'test-runtime'};
  evidence.provenance={profile_status:'verified',trace_status:'complete',tools:[],source:'structural fixture'};
  evidence.scenarios[0].response='Keep the guidance unchanged.';
  evidence.scenarios[0].replay_id='fixture:1';
  evidence.scenarios[0].criterion_results=[{criterion_id:'PS1:e1',verdict:'pass',quote:'unchanged',reason:'It explicitly preserves the guidance.'}];
  return {prepared,evidence};
}
function check(prepared,evidence,defs=prepared.manifest.definitions,packets=prepared.packets) { return validateEvidence(prepared.manifest,evidence,defs,packets); }

test('runner loads exact skill and declared reference bytes inline, without oracle',()=>{
  const {prepared}=complete(); const request=JSON.parse(prepared.packets[0].request);
  assert.equal(request.guidance.length,2);
  assert.equal(request.guidance.find(file=>file.path.endsWith('rules.md')).content,'Frozen references.');
  assert.equal(request.prompt,scenario.prompt);
  assert.equal(request.expected_output,undefined);
  assert.equal(request.criteria,undefined);
});
test('missing owner body or empty corpus cannot become valid proof',()=>{
  assert.throws(()=>conditionFromFiles('skills/missing/SKILL.md',[{path:'references/only.md',content:'A reference is not the skill body.'}]),/owner skill body/);
  assert.throws(()=>prepareEvidence({iteration:'empty',configPath:'config',sourcePath:'corpus',scenarios:[],conditions:{}}),/contain cases/);
});
test('copied prompt/oracle and request bindings cannot be changed under a valid header',()=>{
  for (const field of ['prompt','expected_output','expectations','submitted_request_sha256','skill_condition_digest']) {
    const {prepared,evidence}=complete(); evidence.scenarios[0][field]='changed';
    assert.equal(check(prepared,evidence).ok,false,field);
  }
});
test('changing the live condition, declared reference or corpus invalidates prepared evidence',()=>{
  const {prepared,evidence}=complete();
  const altered=conditionFromFiles(condition.owner,condition.files.map(file=>({path:file.path,content:file.content+' changed'})));
  assert.equal(check(prepared,evidence,prepared.manifest.definitions,[runnerPacket(caseDefinition(scenario),altered)]).ok,false);
  const defs=[caseDefinition({...scenario,prompt:'Changed prompt'})];
  assert.equal(check(prepared,evidence,defs).ok,false);
});
test('unknown, duplicated, missing, unquoted or contradicted required criteria reject evidence',()=>{
  const mutations=[e=>e.scenarios[0].criterion_results=[],e=>e.scenarios[0].criterion_results.push(e.scenarios[0].criterion_results[0]),
    e=>e.scenarios[0].criterion_results[0].criterion_id='unknown',e=>e.scenarios[0].criterion_results[0].quote='not in response',
    e=>e.scenarios[0].criterion_results[0].verdict='invalid',
    e=>{e.scenarios[0].criterion_results[0].verdict='fail';e.scenarios[0].judge={passed:true,missed:['No unsupported change.']};}];
  for(const mutate of mutations) { const {prepared,evidence}=complete(); mutate(evidence); assert.equal(check(prepared,evidence).ok,false); }
});
test('missing profile/trace is diagnostic; an absent trace is never an empty verified tool list',()=>{
  const {prepared,evidence}=complete(); evidence.runner.model_version=null; evidence.provenance={profile_status:'unavailable',trace_status:'unavailable',tools:null};
  const checked=check(prepared,evidence);
  assert.equal(checked.ok,true); assert.equal(checked.qualification.status,'diagnostic'); assert.equal(checked.promotion_eligible,false);
  assert.ok(checked.qualification.reasons.includes('model_version_unavailable')); assert.ok(checked.qualification.reasons.includes('trace_unavailable'));
  assert.equal(checked.scenarios[0].content_verdict,'pass');
});
test('observed tool use invalidates the no-tools qualification independently of a passing content verdict',()=>{
  const {prepared,evidence}=complete(); evidence.provenance.tools=['read_file'];
  const checked=check(prepared,evidence); assert.equal(checked.qualification.status,'invalid'); assert.equal(checked.promotion_eligible,false);
});
test('synthetic executions remain ineligible with complete model-shaped metadata',()=>{
  const {prepared,evidence}=complete();
  const synthetic=prepareEvidence({iteration:'control',configPath:'config.json',sourcePath:'corpus.json',scenarios:[scenario],conditions:{PS1:condition},executionKind:'fixture'});
  Object.assign(synthetic.evidence,{runner:evidence.runner,provenance:evidence.provenance});
  Object.assign(synthetic.evidence.scenarios[0],{response:evidence.scenarios[0].response,criterion_results:evidence.scenarios[0].criterion_results});
  const checked=check(synthetic,synthetic.evidence); assert.equal(checked.ok,true); assert.equal(checked.promotion_eligible,false);
});
test('paired comparison rejects a previously passing regression despite a higher aggregate',()=>{
  const row=id=>({case_id:id,prompt:'fixed',criteria:[],context:{},role:'repair',runner:{model_id:'fixed'},qualification_status:'complete',content_verdict:'fail'});
  const before=[row('1'),row('2'),{...row('3'),content_verdict:'pass'}];
  const after=[{...row('1'),content_verdict:'pass'},{...row('2'),content_verdict:'pass'},row('3')];
  const compared=compareResults(before,after); assert.equal(compared.eligible,false); assert.deepEqual(compared.regressions,['3']); assert.deepEqual(compared.corrected,['1','2']);
  after[2].content_verdict='pass'; assert.equal(compareResults(before,after).eligible,true);
  after[0].runner={model_id:'different'}; assert.equal(compareResults(before,after).comparable,false);
});

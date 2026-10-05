import test from 'node:test';
import assert from 'node:assert/strict';
import { conditionFromFiles, sha256, validateEvidence } from './lib/pulse-skill-evidence.mjs';
import { ACTION_TOOLS, actionCaseDefinition, actionRunnerPacket, prepareActionEvidence, validateActionEvidence, compareActionResults } from './lib/pulse-skill-action-evidence.mjs';

function fixture(kind='fixture') {
  const condition=conditionFromFiles('skills/example/SKILL.md',[{path:'skills/example/SKILL.md',content:'Reproduce and verify.'}]);
  const scenario={id:1,case_id:'A',role:'repair',skill:'example',skill_path:'skills/example',prompt:'Repair lifecycle.',expectations:['Correct behavior.','Keep neighbor.'],expected_output:'PRIVATE_ORACLE',fixture:{files:[{path:'lifecycle.mjs',content:'export const ok=false;'}],public_test:'console.log("public")'},checks:[{check_id:'C',program:'console.log("PRIVATE_ORACLE")'}]};
  const prepared=prepareActionEvidence({iteration:'attempt',configPath:'fixture',sourcePath:'fixture',scenarios:[scenario],conditions:{A:condition},executionKind:kind});
  const entry=prepared.evidence.scenarios[0];entry.replay_id='attempt';entry.response='Observed repair and neighbor verification.';
  entry.capture={attempt_id:'attempt',submitted_request:prepared.packets[0].request,argv:['codex','app-server'],runtime_hashes:{native:'frozen-native',driver:'frozen-driver'},
    files_before:{'lifecycle.mjs':scenario.fixture.files[0].content},files_after:{'lifecycle.mjs':'export const ok=true;'},trace:[{attempt_id:'attempt',call_id:'T1',operation:'fixture_patch',status:'completed'}],
    checks:[{check_id:'C',program_sha256:sha256(scenario.checks[0].program),exit_code:0,stop_reason:null,verdict:'pass'}],quiescent:true,trace_complete:true,policy:{worker:'bubblewrap-readonly-no-network'},capabilities:{tools:[...ACTION_TOOLS]}};
  entry.criterion_results=entry.criteria.map(c=>({criterion_id:c.criterion_id,verdict:'pass',reason:'Private captured check.',references:[{source:'check:C',quote:'"verdict":"pass"'}]}));
  const validate=()=>validateActionEvidence(prepared.manifest,prepared.evidence,[actionCaseDefinition(scenario)],[actionRunnerPacket(actionCaseDefinition(scenario),condition)]);
  return {condition,scenario,prepared,entry,validate};
}

test('action packet excludes private programs, criteria and expected correction',()=>{
  const f=fixture();const input=JSON.parse(f.prepared.packets[0].request);
  assert.deepEqual(input.tools,ACTION_TOOLS);assert.ok(!f.prepared.packets[0].request.includes('PRIVATE_ORACLE'));assert.equal(input.criteria,undefined);assert.ok(f.validate().ok);
});
test('action evidence is separate from v4 and fixture execution cannot qualify',()=>{
  const f=fixture();const v=f.validate();assert.equal(v.qualification.status,'diagnostic');assert.ok(v.qualification.reasons.includes('synthetic-fixture'));assert.equal(v.promotion_eligible,false);
  assert.equal(validateEvidence(f.prepared.manifest,f.prepared.evidence,[],[]).ok,false);
});
test('empty corpus, absent owner, unsafe files and duplicate checks are rejected',()=>{
  const f=fixture();assert.throws(()=>prepareActionEvidence({scenarios:[]}),/contain cases/);
  assert.throws(()=>conditionFromFiles(f.condition.owner,[{path:'ref.md',content:'no owner'}]),/owner/);
  for (const path of ['../outside.mjs','/outside.mjs','.codex/config.mjs','package.json']) assert.throws(()=>actionCaseDefinition({...f.scenario,fixture:{...f.scenario.fixture,files:[{path,content:'x'}]}}),/fixture/);
  assert.throws(()=>actionCaseDefinition({...f.scenario,checks:[...f.scenario.checks,...f.scenario.checks]}),/Duplicate/);
});
test('changed corpus, fixture, checks, request or condition invalidate bindings',()=>{
  for (const mutate of [f=>f.scenario.prompt+=' altered',f=>f.scenario.fixture.files[0].content+=' altered',f=>f.scenario.checks[0].program+=' altered',f=>f.entry.request+=' altered',f=>f.entry.capture.submitted_request+=' altered',f=>f.prepared.evidence.kind='decision']) {
    const f=fixture();mutate(f);assert.equal(f.validate().ok,false);
  }
});
test('unknown, duplicated, missing and ungrounded criterion evidence cannot pass',()=>{
  for (const mutate of [f=>f.entry.criterion_results.pop(),f=>f.entry.criterion_results.push(f.entry.criterion_results[0]),f=>f.entry.criterion_results[0].references[0].quote='not observed',f=>f.entry.criterion_results[0].verdict='unknown',f=>f.entry.criterion_results[0].reason='']) {
    const f=fixture();mutate(f);assert.equal(f.validate().ok,false);
  }
});
test('forged check aggregate and foreign or unclosed operations cannot qualify',()=>{
  const f=fixture();f.entry.capture.checks[0].exit_code=1;assert.equal(f.validate().ok,false);
  const foreign=fixture();foreign.entry.capture.trace[0].attempt_id='another';assert.equal(foreign.validate().ok,false);
  const opaque=fixture();opaque.entry.capture.trace[0].operation='functions.exec';assert.equal(opaque.validate().ok,false);
  const partial=fixture('native');partial.entry.capture.quiescent=false;assert.equal(partial.validate().qualification.status,'diagnostic');
});
test('model self-claims, aliases and CLI versions do not supply immutable provenance',()=>{
  for (const version of ['gpt-6.1-sol','0.159.3','claimed-snapshot']) {
    const f=fixture('native');f.prepared.evidence.runner={model_id:'gpt-6.1-sol',model_version:version,reasoning_effort:'low',runtime:'codex'};
    f.entry.response+=` gpt-6.1-sol ${version} low codex`;
    f.prepared.evidence.provenance={profile_status:'verified',trace_status:'complete',model_version_is_immutable:true,profile_sources:Object.fromEntries(['model_id','model_version','reasoning_effort','runtime'].map(key=>[key,{source:'response',quote:f.entry.response}]))};
    assert.equal(f.validate().qualification.status,'diagnostic');assert.ok(f.validate().qualification.reasons.includes('model_version_source_unavailable'));
  }
});
test('per-criterion regression blocks a higher aggregate and changed private checks block comparison',()=>{
  const f=fixture();const before=f.validate().scenarios[0];before.qualification_status='complete';const after=structuredClone(before);
  after.criterion_results[1].verdict='fail';const result=compareActionResults([before],[after]);assert.deepEqual(result.regressions,['A']);assert.equal(result.eligible,false);
  after.checks_digest='changed';assert.equal(compareActionResults([before],[after]).comparable,false);
});

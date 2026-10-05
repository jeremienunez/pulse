import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initCycle,reserveAttempt,finishAttempt,compareCycle,cycleStatus } from './pulse-skill-iteration.mjs';
import { conditionFromFiles,caseDefinition,runnerPacket,prepareEvidence,sha256 } from './lib/pulse-skill-evidence.mjs';
import { ACTION_TOOLS,actionCaseDefinition,actionRunnerPacket,prepareActionEvidence } from './lib/pulse-skill-action-evidence.mjs';

function fixture(t,options={}) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'pulse-cycle-test-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const feature='fixture-cycle',runFile=`history/${feature}/run.json`;
  fs.mkdirSync(path.join(root,'history',feature),{recursive:true});
  fs.writeFileSync(path.join(root,runFile),JSON.stringify({feature,current_stage:'04_execute',execution:{approved_strategy:'single-worker'},gates:Object.fromEntries(['GATE_1','GATE_2','GATE_3'].map(g=>[g,{status:'approved',artifacts:[]}]))}));
  const source=path.join(root,'review.md');fs.writeFileSync(source,'Observed behavior fixture.');
  const skill=conditionFromFiles('skills/example/SKILL.md',[{path:'skills/example/SKILL.md',content:'Preserve passing behavior.'}]);
  const condition=path.join(root,'condition.json');fs.writeFileSync(condition,JSON.stringify(skill));
  const observation=path.join(root,'observation.json');fs.writeFileSync(observation,JSON.stringify({source_kind:'review-evidence',owner:skill.owner,trigger:'fixture trigger',observed_behavior:'fixture observation',sources:[{path:'review.md',sha256:sha256(fs.readFileSync(source))}]}));
  const scenarios=[{id:1,case_id:'R',role:'repair'},...(options.extraRepair?[{id:3,case_id:'S',role:'repair'}]:[]),{id:2,case_id:'H',role:'promotion'}].map(d=>({...d,skill:'example',skill_path:'skills/example',prompt:`Decide ${d.case_id}.`,expected_output:'Preserve behavior.',expectations:['Explicit choice.']}));
  const corpus=path.join(root,'corpus.json');fs.writeFileSync(corpus,JSON.stringify({evals:scenarios}));
  const cycle=path.join(root,'history',feature,'stages/04_execute/output/verification/skill-iteration/test');
  initCycle({repoRoot:root,runFile,cycle,corpus,condition,observation,...options});
  return {root,cycle,skill,scenarios};
}
function play(f,caseId,{id='control',condition=f.skill,verdict='pass',diagnostic=false,support='R'}={}) {
  const scenario=f.scenarios.find(s=>s.case_id===caseId), def=caseDefinition(scenario);
  const conditionFile=path.join(f.root,`${id}.condition.json`);fs.writeFileSync(conditionFile,JSON.stringify(condition));
  const packet=runnerPacket(def,condition);
  const reserved=reserveAttempt(f.cycle,{caseId,conditionId:id,condition:conditionFile,support,requestDigest:packet.submitted_request_sha256});
  // These envelopes exercise state transitions only. They do not represent model executions.
  const prepared=prepareEvidence({iteration:reserved.attempt_id,configPath:'fixture-config',sourcePath:'fixture-corpus',scenarios:[scenario],conditions:{[caseId]:condition}});
  prepared.evidence.runner={model_id:'test-model',model_version:'test-version',reasoning_effort:'test-setting',runtime:'synthetic-state-test'};
  prepared.evidence.provenance=diagnostic?{profile_status:'unavailable',trace_status:'unavailable',tools:null}:{profile_status:'verified',trace_status:'complete',tools:[],source:'synthetic envelope testing the full-proof branch, not an actual model'};
  const entry=prepared.evidence.scenarios[0];entry.response='A recorded choice.';entry.replay_id='synthetic-only';
  entry.criterion_results=[{criterion_id:`${caseId}:e1`,verdict,quote:'choice',reason:'Synthetic state-transition judgment.'}];
  const receipt=path.join(f.root,`${reserved.attempt_id}.json`);
  fs.writeFileSync(receipt,JSON.stringify({attempt_id:reserved.attempt_id,submitted_request_sha256:packet.submitted_request_sha256,outcome:'response',preparation:prepared.manifest,evidence:prepared.evidence}));
  const result=finishAttempt(f.cycle,{attemptId:reserved.attempt_id,receipt});
  return {reserved,receipt,result};
}
test('passing control freezes no intervention and ends unchanged only after reserved cases',t=>{
  const f=fixture(t);play(f,'R');assert.equal(compareCycle(f.cycle).final_condition,'control');
  play(f,'H');assert.equal(compareCycle(f.cycle).status,'unchanged');assert.equal(cycleStatus(f.cycle).calls,2);
  assert.throws(()=>play(f,'R'),/terminal/);
});
test('reserved results never precede final freeze, and no repair follows that freeze',t=>{
  const f=fixture(t);assert.throws(()=>play(f,'H'),/frozen final/);play(f,'R');compareCycle(f.cycle);
  assert.throws(()=>play(f,'R'),/already reserved|No repair/);
  play(f,'H',{verdict:'fail'});const result=compareCycle(f.cycle);assert.equal(result.status,'stalled');
  assert.equal(cycleStatus(f.cycle).calls,2);
});
test('missing trace/profile remains diagnostic regardless of content and cannot support revision',t=>{
  const f=fixture(t);play(f,'R',{diagnostic:true,verdict:'fail'});compareCycle(f.cycle);
  const changed=conditionFromFiles(f.skill.owner,[{path:f.skill.owner,content:'Changed candidate.'}]);
  assert.throws(()=>play(f,'R',{id:'r1',condition:changed}),/No repair/);
  play(f,'H',{diagnostic:true});assert.equal(compareCycle(f.cycle).status,'diagnostic-complete');
  assert.ok(cycleStatus(f.cycle).qualification_reasons.includes('trace_unavailable'));
});
test('reservation consumes before launch; finish is idempotent, divergent finish and automatic replay rejected',t=>{
  const f=fixture(t);const p=play(f,'R');assert.equal(cycleStatus(f.cycle).calls,1);
  assert.equal(finishAttempt(f.cycle,{attemptId:p.reserved.attempt_id,receipt:p.receipt}).idempotent,true);
  const divergent=JSON.parse(fs.readFileSync(p.receipt));divergent.extra='different';fs.writeFileSync(p.receipt,JSON.stringify(divergent));
  assert.throws(()=>finishAttempt(f.cycle,{attemptId:p.reserved.attempt_id,receipt:p.receipt}),/sealed/);
  assert.throws(()=>play(f,'R'),/already reserved/);assert.equal(cycleStatus(f.cycle).calls,1);
});
test('uncertain reservation remains pending and timeout seals operational failure without replay',t=>{
  const f=fixture(t);const packet=runnerPacket(caseDefinition(f.scenarios[0]),f.skill);
  const attempt=reserveAttempt(f.cycle,{caseId:'R',requestDigest:packet.submitted_request_sha256});
  assert.equal(cycleStatus(f.cycle).calls,1);assert.throws(()=>compareCycle(f.cycle),/Pending/);
  const receipt=path.join(f.root,'timeout.json');fs.writeFileSync(receipt,JSON.stringify({attempt_id:attempt.attempt_id,submitted_request_sha256:packet.submitted_request_sha256,outcome:'timeout'}));
  assert.equal(finishAttempt(f.cycle,{attemptId:attempt.attempt_id,receipt}).status,'operational-failure');
  assert.throws(()=>reserveAttempt(f.cycle,{caseId:'R',requestDigest:packet.submitted_request_sha256}),/terminal/);
});
test('single-worker measurement cannot reserve another replay while one is uncertain',t=>{
  const f=fixture(t,{extraRepair:true});const packet=runnerPacket(caseDefinition(f.scenarios[0]),f.skill);
  reserveAttempt(f.cycle,{caseId:'R',requestDigest:packet.submitted_request_sha256});
  const other=runnerPacket(caseDefinition(f.scenarios[1]),f.skill);
  assert.throws(()=>reserveAttempt(f.cycle,{caseId:'S',requestDigest:other.submitted_request_sha256}),/already pending/);
  assert.equal(cycleStatus(f.cycle).calls,1);
});
test('model deadline uses captured arrival, not later grading time or operator preparation',t=>{
  const f=fixture(t,{deadline:1});
  const packet=runnerPacket(caseDefinition(f.scenarios[0]),f.skill);
  const reservation=reserveAttempt(f.cycle,{caseId:'R',requestDigest:packet.submitted_request_sha256});
  const prepared=prepareEvidence({iteration:'R',configPath:'fixture',sourcePath:'fixture',scenarios:[f.scenarios[0]],conditions:{R:f.skill}});
  prepared.evidence.scenarios[0].response='choice';prepared.evidence.scenarios[0].criterion_results=[{criterion_id:'R:e1',verdict:'pass',quote:'choice',reason:'fixture'}];
  const now=new Date().toISOString();const receipt=path.join(f.root,'arrival.json');
  fs.writeFileSync(receipt,JSON.stringify({attempt_id:reservation.attempt_id,submitted_request_sha256:packet.submitted_request_sha256,outcome:'response',submitted_at:now,received_at:now,preparation:prepared.manifest,evidence:prepared.evidence}));
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,5);
  assert.equal(finishAttempt(f.cycle,{attemptId:reservation.attempt_id,receipt}).qualification,'diagnostic');
});
test('call budget stops before another submission and preserves existing requests',t=>{
  const f=fixture(t,{maxCalls:1});play(f,'R');compareCycle(f.cycle);
  assert.throws(()=>play(f,'H'),/budget exhausted/);assert.equal(cycleStatus(f.cycle).status,'budget-exhausted');
  assert.equal(cycleStatus(f.cycle).calls,1);
});
test('candidate needs qualified observed failure; final reserved regression rejects promotion',t=>{
  const f=fixture(t);play(f,'R',{verdict:'fail'});assert.equal(compareCycle(f.cycle).status,'revise');
  const changed=conditionFromFiles(f.skill.owner,[{path:f.skill.owner,content:'Supported candidate.'}]);
  assert.throws(()=>play(f,'R',{id:'r1',condition:changed,support:'unknown'}),/failure support/);
  play(f,'R',{id:'r1',condition:changed});compareCycle(f.cycle);
  play(f,'H');play(f,'H',{id:'r1',condition:changed,verdict:'fail'});
  const comparison=compareCycle(f.cycle);assert.equal(comparison.status,'rejected');assert.deepEqual(comparison.comparison.regressions,['H']);
  assert.equal(fs.readFileSync(path.join(f.cycle,'conditions/control.json'),'utf8'),JSON.stringify(f.skill,null,2)+'\n');
});
test('same candidate bytes without progress stop; changed observation provenance is rejected',t=>{
  const f=fixture(t);play(f,'R',{verdict:'fail'});compareCycle(f.cycle);
  assert.throws(()=>play(f,'R',{id:'r1',condition:f.skill}),/without progress/);assert.equal(cycleStatus(f.cycle).status,'stalled');
  const obs=JSON.parse(fs.readFileSync(path.join(f.root,'observation.json')));obs.sources[0].sha256='wrong';fs.writeFileSync(path.join(f.root,'observation.json'),JSON.stringify(obs));
  assert.throws(()=>initCycle({repoRoot:f.root,runFile:'history/fixture-cycle/run.json',cycle:path.join(f.cycle,'..','other'),corpus:path.join(f.root,'corpus.json'),condition:path.join(f.root,'condition.json'),observation:path.join(f.root,'observation.json')}),/digest mismatch/);
});
test('comparison cannot accept a mutable pass that contradicts its sealed receipt',t=>{
  const f=fixture(t);play(f,'R',{verdict:'fail'});
  const file=path.join(f.cycle,'state.json'),state=JSON.parse(fs.readFileSync(file));
  state.attempts[0].result.content_verdict='pass';fs.writeFileSync(file,JSON.stringify(state));
  assert.throws(()=>compareCycle(f.cycle),/differs from sealed evidence/);
});

function actionFixture(t) {
  const f=fixture(t);
  f.scenarios=f.scenarios.map(s=>({...s,fixture:{files:[{path:'case.mjs',content:'export const ok=false;'}],public_test:'console.log("public")'},checks:[{check_id:'private',program:'console.log("private")'}]}));
  const corpus=path.join(f.root,'action-corpus.json');fs.writeFileSync(corpus,JSON.stringify({evals:f.scenarios}));
  f.cycle=path.join(f.cycle,'..','action');
  initCycle({repoRoot:f.root,runFile:'history/fixture-cycle/run.json',cycle:f.cycle,corpus,condition:path.join(f.root,'condition.json'),observation:path.join(f.root,'observation.json'),evidenceMode:'action'});
  return f;
}
function actionPlay(f,caseId) {
  const scenario=f.scenarios.find(s=>s.case_id===caseId),def=actionCaseDefinition(scenario),packet=actionRunnerPacket(def,f.skill);
  const reserved=reserveAttempt(f.cycle,{caseId,requestDigest:packet.submitted_request_sha256});
  const data=prepareActionEvidence({iteration:reserved.attempt_id,configPath:'synthetic',sourcePath:'synthetic',scenarios:[scenario],conditions:{[caseId]:f.skill},executionKind:'fixture'});
  const entry=data.evidence.scenarios[0];entry.response='Observed fixture.';entry.replay_id=reserved.attempt_id;
  entry.capture={attempt_id:reserved.attempt_id,submitted_request:packet.request,argv:['fixture'],runtime_hashes:{native:'synthetic',driver:'synthetic'},files_before:{'case.mjs':def.fixture.files[0].content},files_after:{'case.mjs':'export const ok=true;'},trace:[],quiescent:true,trace_complete:true,policy:{worker:'bubblewrap-readonly-no-network'},capabilities:{tools:ACTION_TOOLS},checks:[{check_id:'private',program_sha256:sha256(def.checks[0].program),exit_code:0,stop_reason:null,verdict:'pass'}]};
  entry.criterion_results=entry.criteria.map(c=>({criterion_id:c.criterion_id,verdict:'pass',reason:'Synthetic state-transition evidence.',references:[{source:'check:private',quote:'"verdict":"pass"'}]}));
  const receipt=path.join(f.root,'action-receipt.json');fs.writeFileSync(receipt,JSON.stringify({attempt_id:reserved.attempt_id,submitted_request_sha256:packet.submitted_request_sha256,outcome:'response',preparation:data.manifest,evidence:data.evidence}));
  return {reserved,receipt,data,result:finishAttempt(f.cycle,{attemptId:reserved.attempt_id,receipt})};
}
test('action cycle shares budget, freeze and diagnostic completion without rewriting decision manifests',t=>{
  const f=actionFixture(t);const before=fs.readFileSync(path.join(f.root,'history/fixture-cycle/stages/04_execute/output/verification/skill-iteration/test/manifest.json'));
  assert.equal(actionPlay(f,'R').result.qualification,'diagnostic');assert.equal(compareCycle(f.cycle).final_condition,'control');
  actionPlay(f,'H');assert.equal(compareCycle(f.cycle).status,'diagnostic-complete');assert.equal(cycleStatus(f.cycle).calls,2);
  assert.deepEqual(fs.readFileSync(path.join(f.root,'history/fixture-cycle/stages/04_execute/output/verification/skill-iteration/test/manifest.json')),before);
});
test('action result mirrors are revalidated against immutable receipts',t=>{
  const f=actionFixture(t);actionPlay(f,'R');const file=path.join(f.cycle,'state.json'),state=JSON.parse(fs.readFileSync(file));
  state.attempts[0].result.capture.files_after['case.mjs']='different';fs.writeFileSync(file,JSON.stringify(state));assert.throws(()=>cycleStatus(f.cycle),/differs from sealed/);
});
test('a v4 response cannot finish an action reservation and unknown modes cannot initialize',t=>{
  const f=actionFixture(t),scenario=f.scenarios[0],packet=actionRunnerPacket(actionCaseDefinition(scenario),f.skill),reserved=reserveAttempt(f.cycle,{caseId:'R',requestDigest:packet.submitted_request_sha256});
  const data=prepareEvidence({iteration:reserved.attempt_id,configPath:'fixture',sourcePath:'fixture',scenarios:[scenario],conditions:{R:f.skill},executionKind:'fixture'});
  const receipt=path.join(f.root,'wrong-kind.json');fs.writeFileSync(receipt,JSON.stringify({attempt_id:reserved.attempt_id,submitted_request_sha256:packet.submitted_request_sha256,outcome:'response',preparation:data.manifest,evidence:data.evidence}));
  assert.throws(()=>finishAttempt(f.cycle,{attemptId:reserved.attempt_id,receipt}),/Invalid evidence/);assert.equal(cycleStatus(f.cycle).status,'invalid-evidence');
  assert.throws(()=>fixture(t,{evidenceMode:'invented'}),/Unknown evidence mode/);
});

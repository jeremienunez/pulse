import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {initIcmRun} from '../skills/using-pulse/scripts/pulse_icm.mjs';
import {sha256,objectDigest,conditionFromFiles} from './lib/pulse-skill-evidence.mjs';
import {prepareCreativeSession,recordCreativeEvent,creativeStatus} from './lib/pulse-creative-session.mjs';

function fixture(t,changes={}){
  const owner=fs.mkdtempSync(path.join(os.tmpdir(),'pulse-creative-test-'));t.after(()=>fs.rmSync(owner,{recursive:true,force:true}));
  initIcmRun(owner,'fixture','Synthetic owner only.');
  const base=path.join(owner,'history/fixture/stages/02_plan/output');
  const policy={kind:'pulse-creative-pilot-policy',schema_version:'1.0',paid_tools:false,budget:{research_active_ms_per_brief:100,global_active_ms:1000,max_candidates_per_brief:15,max_deep_refs_per_brief:8,min_deep_refs_per_ensemble:2,max_directions_per_brief:3,max_correction_rounds_per_brief:2,max_native_tasks:16,max_tool_actions:2,additional_external_spend_eur:0,...changes},viewports:[{width:1,height:1}]};
  const criteria=[{id:'C1',required:true,expectation:'Observe the required fixture behavior.'}];
  let plan='Fixture assets\n';for(const [name,value] of Object.entries({'pilot-briefs.json':{cases:[{id:'CV1',terrain:'visual',criteria},{id:'UX1',terrain:'product-ux',criteria},{id:'NA1',terrain:'nonactivation',criteria}]},'pilot-policy.json':policy,'pressure-corpus.json':{evals:[]}})){
    const content=JSON.stringify(value);fs.writeFileSync(path.join(base,name),content);plan+=sha256(content).slice(7)+'\n';
  }
  fs.writeFileSync(path.join(base,'plan.md'),plan);fs.writeFileSync(path.join(owner,'gate.md'),'fixture gate');
  const runFile='history/fixture/run.json',p=path.join(owner,runFile),r=JSON.parse(fs.readFileSync(p));r.current_stage='04_execute';r.execution.approved_strategy='single-worker';
  for(const g of ['GATE_1','GATE_2','GATE_3'])r.gates[g]={status:'approved',artifacts:[{path:g==='GATE_2'?'history/fixture/stages/02_plan/output/plan.md':'gate.md',sha256:sha256(g==='GATE_2'?plan:'fixture gate').slice(7)}],decided_at:'2026-10-04T00:00:00Z'};
  fs.writeFileSync(p,JSON.stringify(r));
  const condition=conditionFromFiles('skills/using-pulse/SKILL.md',[{path:'skills/using-pulse/SKILL.md',content:'# Synthetic condition'}]);
  const prepared=prepareCreativeSession({owner,run_file:runFile,condition,execution_kind:'fixture'},{now:1000});
  const root=prepared.root;
  const reserve=(id,brief='CV1',body=id,now=1001)=>{
    const file=`request-${id}.json`;fs.writeFileSync(path.join(root,file),body);
    return recordCreativeEvent(root,{event:'reserve',operation_id:id,brief_id:brief,phase:'inspection',resource:'tool',units:1,request:{path:file,sha256:sha256(body)}},{now});
  };
  return {owner,root,p,reserve};
}
test('shared budget is consumed before dispatch, across both briefs',t=>{const f=fixture(t);const a=f.reserve('a');assert.equal(creativeStatus(f.root).used.tool,1);assert.throws(()=>f.reserve('b','UX1'),/pending/);recordCreativeEvent(f.root,{event:'finish',reservation_id:a.reservation_id,outcome:'success',artifacts:[]},{now:1002});const b=f.reserve('b','UX1','b',1003);recordCreativeEvent(f.root,{event:'finish',reservation_id:b.reservation_id,outcome:'error',artifacts:[]},{now:1004});assert.throws(()=>f.reserve('c','CV1','c',1005),/budget/);assert.equal(creativeStatus(f.root).used.tool,2);});
test('finish is idempotent; divergent receipts and uncertain replay rejected',t=>{const f=fixture(t);const a=f.reserve('a','CV1','same request');const e={event:'finish',reservation_id:a.reservation_id,outcome:'uncertain',artifacts:[]};recordCreativeEvent(f.root,e,{now:1002});assert.equal(recordCreativeEvent(f.root,e,{now:1003}).status,'already-recorded');assert.throws(()=>recordCreativeEvent(f.root,{...e,outcome:'success'},{now:1004}),/Divergent/);assert.throws(()=>f.reserve('new-id','UX1','same request',1005),/replayed/);});
test('pause requires no pending action and resumes without resetting consumption',t=>{const f=fixture(t);const a=f.reserve('a');assert.throws(()=>recordCreativeEvent(f.root,{event:'pause'},{now:1002}),/pending/);recordCreativeEvent(f.root,{event:'finish',reservation_id:a.reservation_id,outcome:'success',artifacts:[]},{now:1003});recordCreativeEvent(f.root,{event:'pause'},{now:1004});recordCreativeEvent(f.root,{event:'resume'},{now:100000});assert.equal(creativeStatus(f.root).active_ms,4);assert.equal(creativeStatus(f.root).used.tool,1);});
test('clock rollback, expired budget, foreign owner and counter tampering fail closed',t=>{const f=fixture(t);assert.throws(()=>f.reserve('early','CV1','early',900),/Clock/);assert.throws(()=>f.reserve('late','CV1','late',2100),/budget/);const file=path.join(f.root,'session.json'),s=JSON.parse(fs.readFileSync(file));s.state.used.tool=1;const {digest,...body}=s.state;s.state.digest=objectDigest(body);fs.writeFileSync(file,JSON.stringify(s));assert.throws(()=>creativeStatus(f.root),/Counter/);});
test('generation cannot be admitted from a list of links or missing review',t=>{const f=fixture(t);const file='generate.json';fs.writeFileSync(path.join(f.root,file),'generate');assert.throws(()=>recordCreativeEvent(f.root,{event:'reserve',operation_id:'gen',brief_id:'CV1',phase:'generation',resource:'model',units:1,request:{path:file,sha256:sha256('generate')}},{now:1001}),/Missing artifact/);assert.equal(creativeStatus(f.root).used.model,0);});
test('stale approval and symlink request refuse admission',t=>{const f=fixture(t);fs.writeFileSync(path.join(f.owner,'outside.txt'),'secret');fs.symlinkSync(path.join(f.owner,'outside.txt'),path.join(f.root,'linked.json'));assert.throws(()=>recordCreativeEvent(f.root,{event:'reserve',operation_id:'link',brief_id:'CV1',phase:'inspection',resource:'tool',units:1,request:{path:'linked.json',sha256:sha256('secret')}},{now:1001}),/Symlink/);fs.writeFileSync(path.join(f.owner,'gate.md'),'changed');assert.throws(()=>creativeStatus(f.root),/Fresh approved/);});
test('nonactivation cannot admit creative work, and copied sessions cannot write elsewhere',t=>{const f=fixture(t);const req='request.json';fs.writeFileSync(path.join(f.root,req),'{}');assert.throws(()=>recordCreativeEvent(f.root,{event:'reserve',operation_id:'skip',brief_id:'NA1',phase:'research',resource:'tool',units:1,request:{path:req,sha256:sha256('{}')}},{now:1001}),/Mechanical/);const copy=path.join(f.owner,'foreign');fs.cpSync(f.root,copy,{recursive:true});assert.throws(()=>creativeStatus(copy),/Foreign session/);});
test('research time includes synthesis between admitted operations',t=>{const f=fixture(t);fs.writeFileSync(path.join(f.root,'research-request.json'),'{}');const a=recordCreativeEvent(f.root,{event:'reserve',operation_id:'research',brief_id:'CV1',phase:'research',resource:'tool',units:1,request:{path:'research-request.json',sha256:sha256('{}')}},{now:1001});recordCreativeEvent(f.root,{event:'finish',reservation_id:a.reservation_id,outcome:'success',artifacts:[]},{now:1010});assert.throws(()=>recordCreativeEvent(f.root,{event:'reserve',operation_id:'after-synthesis',brief_id:'CV1',phase:'research',resource:'tool',units:1,request:{path:'research-request.json',sha256:sha256('{}')}},{now:1150}),/Research budget/);});
function amendment(f,to=32){
  const session=JSON.parse(fs.readFileSync(path.join(f.root,'session.json'))),run=JSON.parse(fs.readFileSync(f.p)),relative='history/fixture/stages/04_execute/output/verification/creative/CV1/budget.json';
  const value={kind:'pulse-creative-budget-amendment',schema_version:'1.0',session_manifest_digest:session.manifest.digest,baseline_budget_digest:objectDigest(session.manifest.assets.policy.value.budget),from:2,to,user_approval:{actor:'user',source:'user-conversation',verbatim:'yes',dialogue_reference:'fixture-only-approval'}};
  fs.writeFileSync(path.join(f.owner,relative),JSON.stringify(value));const hash=sha256(fs.readFileSync(path.join(f.owner,relative)));
  for(const g of ['GATE_1','GATE_2','GATE_3'])run.gates[g].artifacts.push({path:relative,sha256:hash.slice(7)});fs.writeFileSync(f.p,JSON.stringify(run));
  return {event:'amend-budget',approval:{path:relative,sha256:hash}};
}
test('one gate-bound amendment preserves failures, frozen manifest and counters at exhaustion',t=>{
  const f=fixture(t),initial=JSON.parse(fs.readFileSync(path.join(f.root,'session.json'))).manifest;
  for(let i=0;i<2;i++){const a=f.reserve('used'+i,'CV1','used'+i,1001+i*2);recordCreativeEvent(f.root,{event:'finish',reservation_id:a.reservation_id,outcome:i?'uncertain':'error',artifacts:[]},{now:1002+i*2});}
  recordCreativeEvent(f.root,{event:'pause'},{now:1005});const e=amendment(f);recordCreativeEvent(f.root,e,{now:1006});
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.root,'session.json'))).manifest,initial);assert.equal(creativeStatus(f.root).used.tool,2);assert.equal(creativeStatus(f.root).budget.max_tool_actions,32);
  assert.throws(()=>recordCreativeEvent(f.root,e,{now:1007}),/already amended/);recordCreativeEvent(f.root,{event:'resume'},{now:1008});
  assert.throws(()=>f.reserve('replay','UX1','used1',1009),/replayed/);const a=f.reserve('new','UX1','new',1010);assert.equal(a.used.tool,3);
});
test('budget amendment requires pause, all gates, exact manifest and fixed extension ceiling',t=>{
  for(const mode of ['active','missing-gate','oversized','foreign-manifest']){
    const f=fixture(t);if(mode!=='active')recordCreativeEvent(f.root,{event:'pause'},{now:1001});const e=amendment(f,mode==='oversized'?33:32);
    if(mode==='missing-gate'){const r=JSON.parse(fs.readFileSync(f.p));r.gates.GATE_3.artifacts.pop();fs.writeFileSync(f.p,JSON.stringify(r));}
    if(mode==='foreign-manifest'){const a=JSON.parse(fs.readFileSync(path.join(f.owner,e.approval.path)));a.session_manifest_digest='foreign';fs.writeFileSync(path.join(f.owner,e.approval.path),JSON.stringify(a));}
    assert.throws(()=>recordCreativeEvent(f.root,e,{now:1002}));assert.equal(JSON.parse(fs.readFileSync(path.join(f.root,'session.json'))).state.events.filter(x=>x.event==='amend-budget').length,0);
  }
});
function correctionAmendment(f,to=46){
  const session=JSON.parse(fs.readFileSync(path.join(f.root,'session.json'))),previous=session.state.events.filter(e=>e.event==='amend-budget').at(-1),run=JSON.parse(fs.readFileSync(f.p));
  const relative='history/fixture/stages/04_execute/output/verification/creative/CV1/correction-budget.json';
  const value={kind:'pulse-creative-budget-amendment',schema_version:'1.0',session_manifest_digest:session.manifest.digest,baseline_budget_digest:objectDigest(session.manifest.assets.policy.value.budget),from:32,to,parent_amendment_sha256:previous.approval.sha256,user_approval:{actor:'user',source:'user-conversation',verbatim:'approve correction',dialogue_reference:'fixture-only-correction-approval'}};
  fs.writeFileSync(path.join(f.owner,relative),JSON.stringify(value));const hash=sha256(fs.readFileSync(path.join(f.owner,relative)));
  for(const g of ['GATE_1','GATE_2','GATE_3'])run.gates[g].artifacts.push({path:relative,sha256:hash.slice(7)});fs.writeFileSync(f.p,JSON.stringify(run));
  return {event:'amend-budget',approval:{path:relative,sha256:hash}};
}
test('correction extension is chained to initial approval and remains bounded without a counter reset',t=>{
  const f=fixture(t),initial=JSON.parse(fs.readFileSync(path.join(f.root,'session.json'))).manifest;
  recordCreativeEvent(f.root,{event:'pause'},{now:1001});const first=amendment(f);recordCreativeEvent(f.root,first,{now:1002});const second=correctionAmendment(f);recordCreativeEvent(f.root,second,{now:1003});
  assert.equal(creativeStatus(f.root).budget.max_tool_actions,46);assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.root,'session.json'))).manifest,initial);
  assert.throws(()=>recordCreativeEvent(f.root,second,{now:1004}),/already amended/);recordCreativeEvent(f.root,{event:'resume'},{now:1005});
  fs.writeFileSync(path.join(f.root,'batch.json'),'batch');const a=recordCreativeEvent(f.root,{event:'reserve',operation_id:'batch',brief_id:'CV1',phase:'inspection',resource:'tool',units:46,request:{path:'batch.json',sha256:sha256('batch')}},{now:1006});
  recordCreativeEvent(f.root,{event:'finish',reservation_id:a.reservation_id,outcome:'error',artifacts:[]},{now:1007});assert.equal(creativeStatus(f.root).used.tool,46);assert.throws(()=>f.reserve('overflow','CV1','overflow',1008),/budget/);
});
test('second extension rejects an unapproved gate, missing parent or a larger increase',t=>{
  for(const mode of ['missing-gate','missing-parent','oversized']){
    const f=fixture(t);recordCreativeEvent(f.root,{event:'pause'},{now:1001});const first=amendment(f);recordCreativeEvent(f.root,first,{now:1002});const second=correctionAmendment(f,mode==='oversized'?47:46);
    const run=JSON.parse(fs.readFileSync(f.p));if(mode==='missing-gate')run.gates.GATE_3.artifacts.pop();
    if(mode==='missing-parent'){const file=path.join(f.owner,second.approval.path),body=JSON.parse(fs.readFileSync(file));delete body.parent_amendment_sha256;fs.writeFileSync(file,JSON.stringify(body));const hash=sha256(fs.readFileSync(file));second.approval.sha256=hash;for(const g of ['GATE_1','GATE_2','GATE_3'])run.gates[g].artifacts.at(-1).sha256=hash.slice(7);}
    fs.writeFileSync(f.p,JSON.stringify(run));assert.throws(()=>recordCreativeEvent(f.root,second,{now:1003}));assert.equal(creativeStatus(f.root).budget.max_tool_actions,32);
  }
});

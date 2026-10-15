import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {initIcmRun} from '../skills/using-pulse/scripts/pulse_icm.mjs';
import {sha256,objectDigest,conditionFromFiles} from './lib/pulse-skill-evidence.mjs';
import {prepareCreativeSession,recordCreativeEvent,creativeStatus,checkCreativeSession,finalizeCreativeSession} from './lib/pulse-creative-session.mjs';

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

function versionedFixture(t,version='1.1',allocation=null) {
  const f=fixture(t);fs.rmSync(f.root,{recursive:true,force:true});
  const base=path.join(f.owner,'history/fixture/stages/02_plan/output'),policy=JSON.parse(fs.readFileSync(path.join(base,'pilot-policy.json'))),briefs=JSON.parse(fs.readFileSync(path.join(base,'pilot-briefs.json')));
  policy.schema_version=version;policy.budget.global_active_ms=600000;
  if(allocation)policy.allocation={pilot_ceiling:allocation};
  briefs.cases.find(b=>b.id==='NA1').id='PV2';
  fs.writeFileSync(path.join(base,'pilot-policy.json'),JSON.stringify(policy));fs.writeFileSync(path.join(base,'pilot-briefs.json'),JSON.stringify(briefs));
  let plan='Versioned fixture assets\n';for(const name of ['pilot-policy.json','pilot-briefs.json','pressure-corpus.json'])plan+=sha256(fs.readFileSync(path.join(base,name))).slice(7)+'\n';fs.writeFileSync(path.join(base,'plan.md'),plan);
  const run=JSON.parse(fs.readFileSync(f.p));run.gates.GATE_2.artifacts[0].sha256=sha256(plan).slice(7);fs.writeFileSync(f.p,JSON.stringify(run));
  const args={owner:f.owner,run_file:'history/fixture/run.json',condition:conditionFromFiles('skills/using-pulse/SKILL.md',[{path:'skills/using-pulse/SKILL.md',content:'# Synthetic condition'}])};return {...f,args,base};
}
test('default native prepare requires1.1 before mkdir; explicit historical fixture1.0 remains readable',t=>{
  const f=versionedFixture(t,'1.0');assert.throws(()=>prepareCreativeSession(f.args,{now:1000}),/policy identity/);assert.equal(fs.existsSync(f.root),false);
  prepareCreativeSession({...f.args,execution_kind:'fixture'},{now:1000});assert.equal(JSON.parse(fs.readFileSync(path.join(f.root,'session.json'))).manifest.schema_version,'1.0');assert.equal(creativeStatus(f.root).used.tool,0);
});
test('native1.1 propagates version and applies the approved pilot suballocation',t=>{
  const f=versionedFixture(t,'1.1',{models:2,tools:1,active_minutes:1});prepareCreativeSession(f.args,{now:1000});
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.root,'session.json'))).manifest.schema_version,'1.1');assert.equal(JSON.parse(fs.readFileSync(path.join(f.root,'PV2/state.json'))).schema_version,'1.1');assert.equal(creativeStatus(f.root).budget.max_native_tasks,2);assert.equal(creativeStatus(f.root).budget.max_tool_actions,1);
  const m=JSON.parse(fs.readFileSync(path.join(f.root,'PV2/manifest.json')));fs.writeFileSync(path.join(f.root,'PV2/research.json'),JSON.stringify({kind:'pulse-creative-research',schema_version:'1.1',brief_id:'PV2',manifest_digest:m.digest,status:'not-applicable',reason:'Exact fixture only',references:[]}));
  const r=checkCreativeSession(f.root,'PV2','research',{now:1001});assert.equal(r.ok,true);assert.equal(r.schema_version,'1.1');
});
test('recomputed local downgrade cannot override approved policy bytes or plan binding',t=>{
  for(const changeRaw of [false,true]) {
    const f=versionedFixture(t);prepareCreativeSession(f.args,{now:1000});const file=path.join(f.root,'session.json'),s=JSON.parse(fs.readFileSync(file));s.manifest.schema_version='1.0';s.manifest.assets.policy.value.schema_version='1.0';
    if(changeRaw){const p=path.join(f.base,'pilot-policy.json');fs.writeFileSync(p,JSON.stringify(s.manifest.assets.policy.value));s.manifest.assets.policy.sha256=sha256(fs.readFileSync(p));}
    const {digest,...body}=s.manifest;s.manifest.digest=objectDigest(body);fs.writeFileSync(file,JSON.stringify(s));assert.throws(()=>creativeStatus(f.root),changeRaw?/bound by approved plan/:/Embedded frozen input/);
  }
});

test('a native rebound must name an already sealed inspection before admission',t=>{
  const f=versionedFixture(t);prepareCreativeSession(f.args,{now:1000});const url='https://work.invalid/one',support={id:'S',path:'CV1/observed.txt',sha256:sha256('Observed fixture work'),source_url:url,operation_id:'inspect-start'};
  fs.writeFileSync(path.join(f.root,'CV1/research.json'),JSON.stringify({status:'partial',references:[{id:'R1',depth:'deep',access:'inspected',url,supports:[support]}]}));
  const q={question:'What material explains the observed structure?',source_urls:[],rebound_from:{reference_id:'R1',support_id:'S'}},qp='CV1/query.json';fs.writeFileSync(path.join(f.root,qp),JSON.stringify(q));
  const reserve={event:'reserve',operation_id:'query',brief_id:'CV1',phase:'research',resource:'tool',units:1,request:{path:qp,sha256:sha256(JSON.stringify(q))}};
  assert.throws(()=>recordCreativeEvent(f.root,reserve,{now:1001}),/prior admitted inspection/);assert.equal(creativeStatus(f.root).used.tool,0);
  const ip='CV1/inspect.json',ib=JSON.stringify({source_urls:[url]});fs.writeFileSync(path.join(f.root,ip),ib);
  const a=recordCreativeEvent(f.root,{event:'reserve',operation_id:'inspect-start',brief_id:'CV1',phase:'research',resource:'tool',units:1,request:{path:ip,sha256:sha256(ib)}},{now:1002});fs.writeFileSync(path.join(f.root,support.path),'Observed fixture work');recordCreativeEvent(f.root,{event:'finish',reservation_id:a.reservation_id,outcome:'success',artifacts:[{path:support.path,sha256:support.sha256}]},{now:1003});
  assert.equal(recordCreativeEvent(f.root,reserve,{now:1004}).used.tool,2);
});
test('native1.1 refuses opaque or non-object tool requests before consuming an operation',t=>{
  const f=versionedFixture(t);prepareCreativeSession(f.args,{now:1000});
  for(const [i,body] of ['opaque command','null','[]','"text"'].entries()){
    const p='CV1/request-'+i+'.json';fs.writeFileSync(path.join(f.root,p),body);
    assert.throws(()=>recordCreativeEvent(f.root,{event:'reserve',operation_id:'opaque-'+i,brief_id:'CV1',phase:'inspection',resource:'tool',units:1,request:{path:p,sha256:sha256(body)}},{now:1001}),/JSON object/);
    assert.equal(creativeStatus(f.root).used.tool,0);assert.equal(creativeStatus(f.root).pending,null);
  }
});

function evaluationEditionFixture(t,version='1.1') {
  const f=versionedFixture(t,version),briefs=JSON.parse(fs.readFileSync(path.join(f.base,'pilot-briefs.json')));briefs.cases=briefs.cases.filter(b=>b.terrain==='nonactivation');fs.writeFileSync(path.join(f.base,'pilot-briefs.json'),JSON.stringify(briefs));
  let plan='Edition fixture assets\n';for(const name of ['pilot-policy.json','pilot-briefs.json','pressure-corpus.json'])plan+=sha256(fs.readFileSync(path.join(f.base,name))).slice(7)+'\n';fs.writeFileSync(path.join(f.base,'plan.md'),plan);const run=JSON.parse(fs.readFileSync(f.p));run.gates.GATE_2.artifacts[0].sha256=sha256(plan).slice(7);fs.writeFileSync(f.p,JSON.stringify(run));
  prepareCreativeSession({...f.args,execution_kind:version==='1.0'?'fixture':'native'},{now:1000});const m=JSON.parse(fs.readFileSync(path.join(f.root,'PV2/manifest.json'))),identity={schema_version:version,brief_id:'PV2',manifest_digest:m.digest},write=(p,v)=>fs.writeFileSync(path.join(f.root,p),JSON.stringify(v));
  write('PV2/research.json',{kind:'pulse-creative-research',...identity,status:'not-applicable',reason:'Exact fixture only',references:[]});write('PV2/directions.json',{kind:'pulse-creative-directions',...identity,directions:[]});fs.writeFileSync(path.join(f.root,'PV2/exact.txt'),'exact');
  const evaluation={kind:'pulse-creative-evaluation',...identity,actor:'root',directions:[{direction_id:version==='1.0'?'NA1':'PV2',criterion_results:[{criterion_id:'C1',verdict:'pass',reason:'Exact fixture check',evidence:[{path:'PV2/exact.txt',sha256:'sha256:'+'0'.repeat(64)}]}]}]};write('PV2/evaluation.json',evaluation);evaluation.directions[0].criterion_results[0].evidence[0].sha256=sha256('exact');write('PV2/evaluation-corrected.json',evaluation);
  const ref={path:'PV2/evaluation-corrected.json',sha256:sha256(fs.readFileSync(path.join(f.root,'PV2/evaluation-corrected.json')))};
  return {...f,ref,seal:()=>{const a=f.reserve('editions','PV2','{}',1001);recordCreativeEvent(f.root,{event:'finish',reservation_id:a.reservation_id,outcome:'success',artifacts:['PV2/evaluation.json','PV2/exact.txt',ref.path].map(file=>({path:file,sha256:sha256(fs.readFileSync(path.join(f.root,file)))}))},{now:1002});}};
}
test('explicit sealed evaluation edition preserves the rejected original and is used by finalization',t=>{
  const f=evaluationEditionFixture(t);f.seal();const original=fs.readFileSync(path.join(f.root,'PV2/evaluation.json')),session=JSON.parse(fs.readFileSync(path.join(f.root,'session.json'))),receipt=fs.readFileSync(path.join(f.root,session.state.events.find(e=>e.event==='finish').receipt_path));
  assert.equal(checkCreativeSession(f.root,'PV2','final',{now:1003}).ok,false);
  const options={now:1004,evaluation_editions:{PV2:f.ref}},r=checkCreativeSession(f.root,'PV2','final',options);assert.equal(r.ok,true);assert.deepEqual(r.evaluation_edition,f.ref);
  const report=finalizeCreativeSession(f.root,{...options,now:1005});assert.equal(report.cases[0].status,'complete');assert.deepEqual(report.cases[0].evaluation_edition,f.ref);assert.equal(report.promotion_eligible,false);assert.equal(creativeStatus(f.root).used.tool,1);
  assert(fs.readFileSync(path.join(f.root,'PV2/evaluation.json')).equals(original));assert(fs.readFileSync(path.join(f.root,session.state.events.find(e=>e.event==='finish').receipt_path)).equals(receipt));
});
test('evaluation editions reject unsealed foreign altered and historical references without counter changes',t=>{
  for(const mode of ['unsealed','foreign','digest','legacy','unknown-brief','inherited-map','inherited-fields']){
    const f=evaluationEditionFixture(t,mode==='legacy'?'1.0':'1.1');if(mode!=='unsealed')f.seal();const before=creativeStatus(f.root).used,ref={...f.ref};if(mode==='foreign')ref.path='CV1/evaluation-corrected.json';if(mode==='digest')ref.sha256='sha256:'+'0'.repeat(64);const editions=mode==='unknown-brief'?{OTHER:ref}:{PV2:ref};
    const selected=mode==='inherited-map'?Object.create({PV2:ref}):mode==='inherited-fields'?{PV2:Object.assign(Object.create(ref),{other1:1,other2:2})}:editions;
    assert.throws(()=>checkCreativeSession(f.root,'PV2','final',{now:1003,evaluation_editions:selected}),/edition/i);assert.deepEqual(creativeStatus(f.root).used,before);
  }
});

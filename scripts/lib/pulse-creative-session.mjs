import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { readIcmStatus } from '../../skills/using-pulse/scripts/pulse_icm.mjs';
import { objectDigest, sha256, conditionFromFiles } from './pulse-skill-evidence.mjs';
import { CREATIVE_VERSION, CREATIVE_READABLE_VERSIONS, safeId, safePath, validatePolicy, validateResearch, validateDirections, validateEvaluation, validateSelection, validateLearning } from './pulse-creative-evidence.mjs';

const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const assert = (ok, message) => { if (!ok) throw new Error(message); };
function within(root, relative, missing = false) {
  assert(safePath(relative), 'Unsafe artifact path');
  const file = path.join(root, relative);
  let current = root;
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    const stat=fs.lstatSync(current,{throwIfNoEntry:false});
    if (stat) assert(!stat.isSymbolicLink(), 'Symlink artifact path');
    else assert(missing, `Missing artifact: ${relative}`);
  }
  return file;
}
function bytes(root, relative) {
  const p = within(root, relative), s = fs.statSync(p);
  assert(s.isFile() && s.size <= 20 * 1024 * 1024, 'Artifact type/size invalid');
  return fs.readFileSync(p);
}
function json(root, relative) { const b = bytes(root, relative); assert(b.length <= 2 * 1024 * 1024, 'JSON too large'); return JSON.parse(b.toString('utf8')); }
function atomic(file, value, exclusive = false) {
  const content = JSON.stringify(value, null, 2) + '\n';
  if (exclusive) { fs.writeFileSync(file, content, { flag: 'wx', mode: 0o600 }); return; }
  const tmp = `${file}.${randomUUID()}.tmp`;
  fs.writeFileSync(tmp, content, { flag: 'wx', mode: 0o600 }); fs.renameSync(tmp, file);
}
function owner(ownerRoot, runFile) {
  const root = fs.realpathSync(ownerRoot), status = readIcmStatus(root);
  assert(status.status === 'ready' && status.runtime === 'icm-v2' && status.current_stage === '04_execute' && status.execution?.approved_strategy === 'single-worker', 'Fresh approved single-worker Stage 04 required');
  assert(runFile === status.run_path, 'Foreign run owner');
  const run = json(root, runFile);
  assert(['GATE_1','GATE_2','GATE_3'].every(g => run.gates?.[g]?.status === 'approved'), 'Missing human gate');
  return { root, run };
}
function sealState(state) { const { digest, ...body } = state; state.digest = objectDigest(body); }
function load(root) {
  assert(!fs.lstatSync(root).isSymbolicLink(), 'Session root is a symlink');
  const session = read(path.join(root, 'session.json')), { digest, ...m } = session.manifest;
  assert(objectDigest(m) === digest, 'Frozen manifest changed');
  const { digest: stateDigest, ...body } = session.state;
  assert(objectDigest(body) === stateDigest, 'Session state changed');
  owner(m.owner, m.run_file);
  const run=json(m.owner,m.run_file), expected=within(m.owner,`history/${run.feature}/stages/04_execute/output/verification/creative`);
  assert(fs.realpathSync(root)===expected,'Foreign session directory');
  const approvedPlan=bytes(m.owner,`history/${run.feature}/stages/02_plan/output/plan.md`).toString('utf8');
  for(const [key,filename] of Object.entries({briefs:'pilot-briefs.json',policy:'pilot-policy.json',pressure:'pressure-corpus.json'})) {
    const a=m.assets?.[key];assert(a?.path===`history/${run.feature}/stages/02_plan/output/${filename}`,'Foreign frozen input path');
    const raw=bytes(m.owner,a.path);assert(sha256(raw)===a.sha256,'Frozen input asset changed');
    assert(approvedPlan.includes(a.sha256.slice(7)),'Frozen asset not bound by approved plan');
    assert(objectDigest(JSON.parse(raw.toString('utf8')))===objectDigest(a.value),'Embedded frozen input differs from approved bytes');
  }
  assert(CREATIVE_READABLE_VERSIONS.includes(m.schema_version)&&m.schema_version===m.assets.policy.value.schema_version,'Creative manifest/policy version differs');
  const reservations = session.state.events.filter(e => e.event === 'reserve');
  for (const category of ['tool','model']) {
    assert(session.state.used[category] === reservations.filter(e => e.resource === category).reduce((n,e) => n+e.units, 0), 'Counter differs from admitted events');
  }
  for(const e of reservations) assert(sha256(bytes(root,e.request.path))===e.request.sha256,'Admitted request changed');
  for (const e of session.state.events.filter(e => e.event === 'finish')) {
    assert(sha256(bytes(root, e.receipt_path)) === e.receipt_sha256, 'Sealed receipt changed');
    for(const a of json(root,e.receipt_path).artifacts||[]) assert(sha256(bytes(root,a.path))===a.sha256,'Sealed result artifact changed');
  }
  effectiveBudget(session);
  return session;
}
function effectiveBudget(session) {
  const policy=session.manifest.assets.policy.value,raw=policy.budget,pilot=session.manifest.schema_version==='1.1'?policy.allocation?.pilot_ceiling:null;
  if(pilot)assert(['models','tools','active_minutes'].every(k=>Number.isInteger(pilot[k])&&pilot[k]>0)&&pilot.models<=raw.max_native_tasks&&pilot.tools<=raw.max_tool_actions&&pilot.active_minutes*60000<=raw.global_active_ms,'Pilot allocation exceeds approved budget');
  const base=pilot?{...raw,max_native_tasks:pilot.models,max_tool_actions:pilot.tools,global_active_ms:pilot.active_minutes*60000}:raw,rows=session.state.events.filter(e=>e.event==='amend-budget');
  assert(rows.length<=2,'Budget amendment outside fixed ceiling');
  if(!rows.length)return base;
  const m=session.manifest,run=json(m.owner,m.run_file),seen=new Set();let limit=base.max_tool_actions;
  for(let i=0;i<rows.length;i++) {
    const ref=rows[i].approval;
    assert(ref&&!seen.has(ref.path),'Budget already amended');seen.add(ref.path);
    assert(sha256(bytes(m.owner,ref.path))===ref.sha256,'Budget amendment changed');
    assert(['GATE_1','GATE_2','GATE_3'].every(g=>run.gates[g].artifacts.some(a=>a.path===ref.path&&a.sha256===ref.sha256.slice(7))),'Budget amendment is not approved by all gates');
    const a=json(m.owner,ref.path),approval=a.user_approval;
    assert(a.kind==='pulse-creative-budget-amendment'&&a.schema_version===m.schema_version&&a.session_manifest_digest===m.digest&&a.baseline_budget_digest===objectDigest(raw),'Foreign budget amendment');
    assert(a.from===limit&&a.to===limit+(i===0?30:14)&&a.to<=(i===0?190:204),'Budget amendment outside fixed ceiling');
    if(i)assert(a.parent_amendment_sha256===rows[i-1].approval.sha256,'Budget amendment parent differs');
    assert(approval?.actor==='user'&&approval.source==='user-conversation'&&typeof approval.verbatim==='string'&&approval.verbatim.trim()&&typeof approval.dialogue_reference==='string'&&approval.dialogue_reference.trim(),'Human budget approval missing');
    limit=a.to;
  }
  return {...base,max_tool_actions:limit};
}
function tick(state, now) {
  assert(Number.isFinite(now) && now >= state.last_tick, 'Clock moved backwards');
  if (state.status === 'active') state.active_ms += now - state.last_tick;
  if (state.current_research && state.status === 'active') state.research_ms[state.current_research] += now - state.last_tick;
  state.last_tick = now;
}
function transaction(root, fn, now = Date.now()) {
  const lock = path.join(root, '.lock');
  fs.writeFileSync(lock, JSON.stringify({ pid: process.pid, at: now }), { flag: 'wx', mode: 0o600 });
  let writeStarted = false;
  try {
    const session = load(root); tick(session.state, now);
    const value = fn(session, now);
    sealState(session.state); writeStarted = true;
    atomic(path.join(root, 'session.json'), session);
    projections(root,session);
    fs.unlinkSync(lock); return value;
  } catch(e) {
    // Interrupted commits keep the lock for explicit owner recovery; validation errors do not consume admission.
    if (!writeStarted) fs.unlinkSync(lock);
    throw e;
  }
}
function projections(root,session){
  for(const b of session.manifest.assets.briefs.value.cases){
    const rows=session.state.events.filter(e=>e.event==='reserve'&&e.brief_id===b.id);
    atomic(within(root,b.id+'/state.json',true),{kind:'pulse-creative-state-projection',schema_version:session.manifest.schema_version,brief_id:b.id,authority:'session.json',authority_state_digest:session.state.digest,status:session.state.status,research_ms:session.state.research_ms[b.id],used:Object.fromEntries(['tool','model'].map(k=>[k,rows.filter(e=>e.resource===k).reduce((n,e)=>n+e.units,0)])),pending:session.state.pending?.brief_id===b.id?session.state.pending:null});
  }
}

export function prepareCreativeSession(args, options = {}) {
  const { root: o, run } = owner(args.owner, args.run_file);
  const base = `history/${run.feature}/stages/02_plan/output/`;
  const plan = bytes(o, base+'plan.md').toString('utf8'), assets = {};
  for (const [key, filename] of Object.entries({ briefs:'pilot-briefs.json', policy:'pilot-policy.json', pressure:'pressure-corpus.json' })) {
    const b = bytes(o, base+filename), digest = sha256(b);
    assert(plan.includes(digest.slice(7)), 'Asset not bound by approved plan'); assets[key] = { path:base+filename, sha256:digest, value:JSON.parse(b.toString('utf8')) };
  }
  const executionKind=args.execution_kind||'native';assert(['native','fixture'].includes(executionKind),'Execution kind invalid');
  const version=executionKind==='native'?CREATIVE_VERSION:assets.policy.value.schema_version;
  const checked = validatePolicy(assets.policy.value,version); assert(checked.ok, checked.errors.join('; '));
  const ids = assets.briefs.value.cases.map(b => b.id); assert(ids.length && new Set(ids).size === ids.length && ids.every(safeId), 'Brief IDs invalid');
  assert(!ids.some(id=>['global','receipts','guidance'].includes(id)),'Reserved brief ID');
  for(const b of assets.briefs.value.cases)assert(['visual','product-ux','nonactivation'].includes(b.terrain)&&Array.isArray(b.criteria)&&b.criteria.length&&new Set(b.criteria.map(c=>c.id)).size===b.criteria.length&&b.criteria.every(c=>safeId(c.id)&&typeof c.required==='boolean'&&typeof c.expectation==='string'&&c.expectation.trim()),'Brief criteria missing/invalid');
  const condition = conditionFromFiles(args.condition.owner, args.condition.files); assert(condition.digest === args.condition.digest, 'Condition changed');
  const relative = `history/${run.feature}/stages/04_execute/output/verification/creative`;
  const root = within(o, relative, true); assert(!fs.existsSync(root), 'Creative session already exists');
  const now = options.now ?? Date.now();
  const manifest = { kind:'pulse-creative-session', schema_version:version, owner:o, run_file:args.run_file, assets, condition, execution_kind:executionKind };
  assert(['native','fixture'].includes(manifest.execution_kind), 'Execution kind invalid'); manifest.digest = objectDigest(manifest);
  const state = { status:'active', active_ms:0, last_tick:now, used:{tool:0,model:0}, research_ms:Object.fromEntries(ids.map(id => [id,0])), current_research:null, pending:null, events:[], finalized:false };
  sealState(state); fs.mkdirSync(root, { recursive:true }); fs.mkdirSync(path.join(root,'receipts'));
  atomic(path.join(root,'session.json'),{manifest,state},true);
  for (const brief of assets.briefs.value.cases) {
    fs.mkdirSync(path.join(root,brief.id));
    const item = { kind:'pulse-creative-manifest', schema_version:version, session_digest:manifest.digest, brief, policy:assets.policy.value };
    item.digest = objectDigest(item); atomic(path.join(root,brief.id,'manifest.json'),item,true);
  }
  projections(root,{manifest,state});
  return { root, manifest_digest:manifest.digest, status:'active', promotion_eligible:false };
}
function context(root, session, briefId) {
  const brief = session.manifest.assets.briefs.value.cases.find(b => b.id === briefId); assert(brief, 'Unknown brief');
  const m = json(root, briefId+'/manifest.json'), {digest,...body} = m;
  assert(objectDigest(body) === digest && m.schema_version===session.manifest.schema_version && m.session_digest === session.manifest.digest && objectDigest(m.brief) === objectDigest(brief) && objectDigest(m.policy) === objectDigest(session.manifest.assets.policy.value), 'Brief manifest changed');
  const operations=session.manifest.schema_version==='1.1'?session.state.events.flatMap((e,index)=>{
    if(e.event!=='reserve'||e.brief_id!==briefId||e.resource!=='tool')return [];
    const finishIndex=session.state.events.findIndex(f=>f.event==='finish'&&f.reservation_id===e.reservation_id&&f.outcome==='success');
    if(finishIndex<0)return [];
    const receipt=json(root,session.state.events[finishIndex].receipt_path);
    return [{operation_id:e.operation_id,brief_id:briefId,resource:e.resource,phase:e.phase,outcome:'success',reserve_index:index,finish_index:finishIndex,request:json(root,e.request.path),artifacts:receipt.artifacts||[]}];
  }):[];
  return { brief, policy:m.policy, creative_version:session.manifest.schema_version, operations, manifest_digest:digest, read: relative => { assert(relative.startsWith(briefId+'/'), 'Foreign brief artifact'); return bytes(root,relative); },verifySupport:ref=>{
    const op=session.state.events.find(e=>e.event==='reserve'&&e.operation_id===ref.operation_id&&e.brief_id===briefId&&e.resource==='tool'&&['research','inspection','critique'].includes(e.phase));
    const done=op&&session.state.events.find(e=>e.event==='finish'&&e.reservation_id===op.reservation_id&&e.outcome==='success');
    if(!done)return false;
    const receipt=json(root,done.receipt_path);
    if(!(receipt.artifacts||[]).some(a=>a.path===ref.path&&a.sha256===ref.sha256))return false;
    const req=json(root,op.request.path);
    return Array.isArray(req.source_urls)&&req.source_urls.includes(ref.source_url);
  } };
}
function researchCheck(root, session, briefId) {
  const ctx = context(root,session,briefId);
  return validateResearch(json(root,briefId+'/research.json'),ctx.brief.terrain === 'nonactivation' ? null : json(root,briefId+'/research-review.json'),ctx);
}

export function recordCreativeEvent(root, event, options = {}) {
  return transaction(root,(session,now) => {
    const s=session.state, p=effectiveBudget(session);
    assert(!s.finalized, 'Session finalized');
    if(event.event==='amend-budget') {
      assert(s.status==='paused'&&!s.pending,'Budget amendment requires a settled pause');
      assert(!s.events.some(e=>e.event==='amend-budget'&&e.approval.path===event.approval?.path),'Budget already amended');
      s.events.push({event:'amend-budget',approval:event.approval,at:now});
      return {status:s.status,used:s.used,budget:effectiveBudget(session)};
    }
    if (event.event === 'pause' || event.event === 'resume') {
      assert(!s.pending, 'Finish or classify pending action before pause/resume');
      const expected=event.event==='pause'?'active':'paused'; assert(s.status===expected,'Invalid pause/resume state');
      s.status=event.event==='pause'?'paused':'active'; s.events.push({event:event.event,at:now}); return {status:s.status,used:s.used,active_ms:s.active_ms};
    }
    if (event.event === 'reserve') {
      assert(s.status==='active' && !s.pending,'Session paused or action pending');
      assert(['tool','model'].includes(event.resource) && Number.isInteger(event.units) && event.units>0 && safeId(event.operation_id),'Admission invalid');
      assert(['guidance','research','generation','critique','correction','inspection'].includes(event.phase),'Unknown phase');
      assert(event.brief_id==='global'||session.manifest.assets.briefs.value.cases.some(b=>b.id===event.brief_id),'Foreign brief');
      const brief=session.manifest.assets.briefs.value.cases.find(b=>b.id===event.brief_id);
      if(brief?.terrain==='nonactivation')assert(!['research','generation','correction','critique'].includes(event.phase),'Mechanical scope cannot activate creative work');
      assert(!s.events.some(e=>e.operation_id===event.operation_id),'Operation already admitted');
      const request=bytes(root,event.request.path); assert(request.toString('utf8').trim()&&sha256(request)===event.request.sha256,'Request bytes changed/empty');
      if(session.manifest.schema_version==='1.1'&&event.resource==='tool') {
        assert(request.length<=2*1024*1024,'Tool request must be a bounded JSON object');
        let q;try{q=JSON.parse(request.toString('utf8'));}catch{throw Error('Tool request must be a JSON object');}
        assert(q&&typeof q==='object'&&!Array.isArray(q),'Tool request must be a JSON object');
        if(event.phase==='research'&&Object.hasOwn(q,'rebound_from')) {
          const r=q.rebound_from;
          assert(r&&typeof r==='object'&&!Array.isArray(r)&&Object.keys(r).length===2&&safeId(r.reference_id)&&safeId(r.support_id)&&typeof q.question==='string'&&q.question.trim(),'Sealed rebound question/reference/support required');
          const draft=json(root,event.brief_id+'/research.json'),refs=(Array.isArray(draft.references)?draft.references:[]).filter(x=>x?.id===r.reference_id);
          assert(refs.length===1&&refs[0].depth==='deep'&&refs[0].access==='inspected','Rebound trigger reference not inspected');
          const supports=(Array.isArray(refs[0].supports)?refs[0].supports:[]).filter(s=>s?.id===r.support_id);
          assert(supports.length===1&&supports[0].source_url===refs[0].url&&context(root,session,event.brief_id).verifySupport(supports[0]),'Rebound trigger has no prior admitted inspection');
        }
      }
      assert(!s.events.some(e=>e.event==='reserve'&&e.request.sha256===event.request.sha256&&s.events.some(f=>f.event==='finish'&&f.reservation_id===e.reservation_id&&['uncertain','timeout'].includes(f.outcome))),'Uncertain request cannot be replayed');
      const limit=event.resource==='tool'?p.max_tool_actions:p.max_native_tasks;
      assert(s.used[event.resource]+event.units<=limit && s.active_ms<p.global_active_ms,'Global budget exhausted');
      if(event.phase==='research') {assert(event.brief_id!=='global' && s.research_ms[event.brief_id]<p.research_active_ms_per_brief,'Research budget exhausted');assert(!s.current_research||s.current_research===event.brief_id,'Finish current research before switching brief');s.current_research=event.brief_id;}
      if(event.phase==='generation'||event.phase==='correction') { const r=researchCheck(root,session,event.brief_id);assert(r.ok,r.errors.join('; '));assert(s.research_ms[event.brief_id]<=p.research_active_ms_per_brief,'Research budget exhausted');if(s.current_research===event.brief_id)s.current_research=null; }
      if(event.phase==='correction') {
        assert(Number.isInteger(event.correction_round)&&event.correction_round>=1&&event.correction_round<=p.max_correction_rounds_per_brief,'Correction round outside bounds');
        const ctx=context(root,session,event.brief_id),selection=validateSelection(json(root,event.brief_id+'/selection.json'),json(root,event.brief_id+'/directions.json'),ctx);
        assert(selection.ok&&selection.status==='selected','Correction requires an actual user selection');
        const previous=Math.max(0,...s.events.filter(e=>e.event==='reserve'&&e.brief_id===event.brief_id&&e.phase==='correction').map(e=>e.correction_round));
        assert(event.correction_round===previous||event.correction_round===previous+1,'Correction rounds must be sequential');
      }
      const row={...event,reservation_id:randomUUID(),at:now}; s.used[event.resource]+=event.units;s.pending=row;s.events.push(row);
      return {reservation_id:row.reservation_id,used:s.used,active_ms:s.active_ms};
    }
    assert(event.event==='finish','Unknown event');
    const past=s.events.find(e=>e.event==='finish'&&e.reservation_id===event.reservation_id);
    if(past) {assert(objectDigest(event)===past.input_digest,'Divergent sealed receipt');return {status:'already-recorded',used:s.used};}
    assert(s.pending?.reservation_id===event.reservation_id,'Wrong pending reservation');
    assert(['success','error','timeout','uncertain'].includes(event.outcome),'Unknown outcome');
    for(const a of event.artifacts||[]) assert(sha256(bytes(root,a.path))===a.sha256,'Result artifact changed');
    const receiptPath=`receipts/${event.reservation_id}.json`, file=within(root,receiptPath,true);
    if(fs.existsSync(file)) assert(objectDigest(read(file))===objectDigest(event),'Interrupted receipt differs'); else atomic(file,event,true);
    const row={event:'finish',reservation_id:event.reservation_id,at:now,outcome:event.outcome,input_digest:objectDigest(event),receipt_path:receiptPath,receipt_sha256:sha256(fs.readFileSync(file))};
    s.events.push(row);s.pending=null;return {status:'recorded',used:s.used,active_ms:s.active_ms};
  },options.now ?? Date.now());
}

// A rejected sealed result stays immutable. The owner may explicitly select a
// separately admitted evaluation edition; no filename or timestamp wins implicitly.
function evaluationEditions(root,session,options) {
  const editions=options.evaluation_editions??{};
  assert(editions&&typeof editions==='object'&&!Array.isArray(editions)&&[Object.prototype,null].includes(Object.getPrototypeOf(editions)),'Evaluation editions object required');
  const entries=Object.entries(editions),selected=new Map(entries);if(!entries.length)return selected;
  assert(session.manifest.schema_version==='1.1','Evaluation editions require verified1.1');
  for(const [briefId,ref] of entries) {
    assert(session.manifest.assets.briefs.value.cases.some(b=>b.id===briefId),'Evaluation edition has foreign brief');
    assert(ref&&typeof ref==='object'&&!Array.isArray(ref)&&Object.keys(ref).sort().join(',')==='path,sha256'&&safePath(ref.path)&&path.posix.dirname(ref.path)===briefId&&/^evaluation-[A-Za-z0-9][A-Za-z0-9._-]*\.json$/.test(path.posix.basename(ref.path))&&/^sha256:[a-f0-9]{64}$/.test(ref.sha256??''),'Evaluation edition reference invalid');
    assert(sha256(bytes(root,ref.path))===ref.sha256,'Evaluation edition bytes changed');
    const sealed=session.state.events.some(op=>op.event==='reserve'&&op.brief_id===briefId&&op.resource==='tool'&&['inspection','critique'].includes(op.phase)&&session.state.events.some(done=>done.event==='finish'&&done.reservation_id===op.reservation_id&&done.outcome==='success'&&(json(root,done.receipt_path).artifacts||[]).some(a=>a.path===ref.path&&a.sha256===ref.sha256)));
    assert(sealed,'Evaluation edition needs successful same-brief inspection receipt');
  }
  return selected;
}
function inspect(root,session,briefId,target,evaluationEdition) {
  const ctx=context(root,session,briefId), readOptional=name=>fs.existsSync(path.join(root,briefId,name))?json(root,briefId+'/'+name):null;
  const research=readOptional('research.json'), review=readOptional('research-review.json');
  const checks={ research:validateResearch(research,review,ctx) };
  if(target!=='research') checks.directions=validateDirections(readOptional('directions.json'),research,ctx);
  if(['evaluation','final'].includes(target)) checks.evaluation=validateEvaluation(evaluationEdition?json(root,evaluationEdition.path):readOptional('evaluation.json'),readOptional('directions.json'),ctx);
  if(target==='final'&&ctx.brief.terrain!=='nonactivation') {
    checks.selection=validateSelection(readOptional('selection.json'),readOptional('directions.json'),ctx);
    if(checks.selection.status!=='awaiting-user') checks.learning=validateLearning(readOptional('learning-proposals.json'),ctx);
  }
  assert(['research','directions','evaluation','final'].includes(target),'Unknown check target');
  const errors=Object.values(checks).flatMap(c=>c.errors);
  const status=errors.length?'invalid-evidence':checks.selection?.status==='awaiting-user'?'awaiting-user':checks.evaluation?.required_failures?'partial':'complete';
  return {kind:'pulse-creative-check',schema_version:ctx.creative_version,brief_id:briefId,manifest_digest:ctx.manifest_digest,ok:errors.length===0,status,checks,errors,...(evaluationEdition?{evaluation_edition:evaluationEdition}:{}),promotion_eligible:false};
}
export function checkCreativeSession(root,briefId,target='research',options={}){
  return transaction(root,session=>{
    const editions=evaluationEditions(root,session,options),report=inspect(root,session,briefId,target,editions.get(briefId)),p=effectiveBudget(session);
    if(session.state.active_ms>p.global_active_ms||session.state.research_ms[briefId]>p.research_active_ms_per_brief){report.ok=false;report.status='budget-exhausted';report.errors.push('Active budget exceeded');}
    if(report.ok&&target==='research'&&session.state.current_research===briefId)session.state.current_research=null;
    const dir=within(root,briefId+'/checks',true);fs.mkdirSync(dir,{recursive:true});atomic(path.join(dir,target+'.json'),report);
    return report;
  },options.now??Date.now());
}
export function finalizeCreativeSession(root, options={}) {
  return transaction(root,session=>{
    assert(!session.state.pending,'Pending action'); assert(!session.state.finalized,'Result already finalized');
    const p=effectiveBudget(session);
    assert(session.state.active_ms<=p.global_active_ms&&Object.values(session.state.research_ms).every(ms=>ms<=p.research_active_ms_per_brief),'Active budget exceeded');
    const editions=evaluationEditions(root,session,options),cases=session.manifest.assets.briefs.value.cases.map(b=>inspect(root,session,b.id,'final',editions.get(b.id)));
    assert(cases.every(c=>c.ok && c.status==='complete'),'All brief checks and user decisions must be complete');
    const report={kind:'pulse-creative-benchmark',schema_version:session.manifest.schema_version,manifest_digest:session.manifest.digest,execution_kind:session.manifest.execution_kind,cases,budget:{effective_limits:p,amendments:session.state.events.filter(e=>e.event==='amend-budget'),used:session.state.used,active_ms:session.state.active_ms,research_ms:session.state.research_ms},qualification:{status:'diagnostic',reasons:[session.manifest.execution_kind==='fixture'?'synthetic-fixture':'operator-observations','no-immutable-model-or-full-provider-trace-certification']},promotion_eligible:false};
    atomic(path.join(root,'benchmark.json'),report,true);session.state.finalized=true;session.state.status='complete';return report;
  },options.now ?? Date.now());
}
export function creativeStatus(root) { const session=load(root);return {root,budget:effectiveBudget(session),status:session.state.status,pending:session.state.pending,used:session.state.used,active_ms:session.state.active_ms,research_ms:session.state.research_ms,finalized:session.state.finalized,promotion_eligible:false}; }

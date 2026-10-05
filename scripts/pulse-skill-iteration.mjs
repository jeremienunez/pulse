#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { conditionFromFiles,caseDefinition,runnerPacket,validateEvidence,compareResults,objectDigest,sha256,sameValue } from './lib/pulse-skill-evidence.mjs';

import { actionCaseDefinition,actionRunnerPacket,validateActionEvidence,compareActionResults } from './lib/pulse-skill-action-evidence.mjs';

function evidenceAdapter(mode='decision') {
  if(mode==='decision') return {caseDefinition,runnerPacket,validateEvidence,compareResults};
  if(mode==='action') return {caseDefinition:actionCaseDefinition,runnerPacket:actionRunnerPacket,validateEvidence:validateActionEvidence,compareResults:compareActionResults};
  throw new Error('Unknown evidence mode.');
}

const TERMINAL=new Set(['unchanged','eligible-for-review','rejected','stalled','budget-exhausted','operational-failure','diagnostic-complete','invalid-evidence']);
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
function write(file,value) { const tmp=`${file}.${randomUUID()}.tmp`; fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{flag:'wx'}); fs.renameSync(tmp,file); }
function within(root,relative) {
  if(typeof relative!=='string'||!relative||path.isAbsolute(relative)) throw new Error('Expected repository-relative path.');
  const result=path.resolve(root,relative), rel=path.relative(root,result);
  if(rel.startsWith('..')||path.isAbsolute(rel)) throw new Error('Path escapes owner repository.');
  if(fs.existsSync(result)&&!fs.realpathSync(result).startsWith(fs.realpathSync(root)+path.sep)) throw new Error('Physical path escapes owner repository.');
  return result;
}
function regular(file) { if(!fs.lstatSync(file).isFile()||fs.lstatSync(file).isSymbolicLink()) throw new Error(`Not a regular input: ${file}`); return fs.readFileSync(file); }
function owner(repo,runFile) {
  const run=read(within(repo,runFile));
  if(typeof run.feature!=='string'||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(run.feature)) throw new Error('Invalid Pulse feature slug.');
  if(run.current_stage!=='04_execute'||run.execution?.approved_strategy!=='single-worker') throw new Error('Cycle mutation requires the approved single-worker execution run.');
  for(const gate of ['GATE_1','GATE_2','GATE_3']) {
    if(run.gates?.[gate]?.status!=='approved') throw new Error(`Missing ${gate}.`);
    for(const item of run.gates[gate].artifacts||[]) if(sha256(regular(within(repo,item.path))).slice(7)!==item.sha256) throw new Error('Stale Pulse approval.');
  }
  return run;
}
function condition(file) { const raw=read(file), parsed=conditionFromFiles(raw.owner,raw.files); if(raw.digest!==parsed.digest) throw new Error('Condition digest mismatch.'); return parsed; }
function load(cycle) {
  const manifest=read(path.join(cycle,'manifest.json'));
  const {digest,...unsigned}=manifest;
  if(objectDigest(unsigned)!==digest) throw new Error('Frozen cycle manifest changed.');
  const adapter=evidenceAdapter(manifest.evidence_mode??'decision');
  const state=read(path.join(cycle,'state.json'));
  if(state.calls!==state.attempts.length||new Set(state.attempts.map(a=>a.attempt_id)).size!==state.calls||state.calls>manifest.budget.max_replay_calls) throw new Error('Attempt ledger or budget differs.');
  for(const attempt of state.attempts) {
    if(!/^[a-f0-9-]{36}$/.test(attempt.attempt_id)||!/^control$|^r[1-3]$/.test(attempt.condition_id)) throw new Error('Unsafe attempt identity.');
    if(attempt.status==='reserved') continue;
    const receipt=read(path.join(cycle,'attempts',`${attempt.attempt_id}.receipt.json`));
    if(objectDigest(receipt)!==attempt.receipt_digest) throw new Error('Sealed receipt changed.');
    if(attempt.result) {
      const def=manifest.definitions.find(d=>d.case_id===attempt.case_id);
      const selected=condition(path.join(cycle,'conditions',`${attempt.condition_id}.json`));
      if(selected.digest!==attempt.condition_digest) throw new Error('Sealed attempt condition changed.');
      const checked=adapter.validateEvidence(receipt.preparation,receipt.evidence,[def],[adapter.runnerPacket(def,selected)]);
      if(!checked.ok||!sameValue(checked.scenarios[0],attempt.result)) throw new Error('Mutable result differs from sealed evidence.');
    }
  }
  return {manifest,state};
}
function lock(cycle,fn) {
  const file=path.join(cycle,'.write-lock'); const token=randomUUID();
  try { fs.writeFileSync(file,JSON.stringify({pid:process.pid,token}),{flag:'wx'}); }
  catch { throw new Error('A writer or interrupted write owns this cycle. Preserve the lock and inspect its owner before explicit recovery.'); }
  try { return fn(); } finally { if(read(file).token===token) fs.unlinkSync(file); }
}
function results(state,id) { return state.attempts.filter(a=>a.condition_id===id&&a.result).map(a=>a.result); }
function finished(state,id,defs) { return defs.every(def=>results(state,id).some(row=>row.case_id===def.case_id)); }
function ordered(state,id,defs) { return defs.map(def=>results(state,id).find(row=>row.case_id===def.case_id)).filter(Boolean); }
function persist(cycle,state) { write(path.join(cycle,'state.json'),state); }

export function initCycle(args) {
  const repo=fs.realpathSync(args.repoRoot), run=owner(repo,args.runFile);
  const base=path.join(repo,'history',run.feature,'stages/04_execute/output/verification/skill-iteration');
  const cycle=path.resolve(args.cycle);
  if(!cycle.startsWith(base+path.sep)||fs.existsSync(cycle)||fs.existsSync(path.dirname(cycle))&&!fs.realpathSync(path.dirname(cycle)).startsWith(repo+path.sep)) throw new Error('Cycle must be a fresh child of the owner run verification directory.');
  const observed=read(args.observation), control=condition(args.condition);
  if(!['completed-pulse-run','review-evidence'].includes(observed.source_kind)||observed.owner!==control.owner||!observed.trigger||!observed.observed_behavior||!Array.isArray(observed.sources)||!observed.sources.length) throw new Error('Observation needs a verified source, trigger, behavior and matching owner.');
  if(observed.source_kind==='completed-pulse-run'&&read(within(repo,observed.source_run)).current_stage!=='complete') throw new Error('Observation run is not complete.');
  for(const source of observed.sources) if(sha256(regular(within(repo,source.path)))!==source.sha256) throw new Error('Observation source digest mismatch.');
  const mode=args.evidenceMode??'decision', adapter=evidenceAdapter(mode);
  const corpus=read(args.corpus), definitions=(corpus.evals||[]).map(adapter.caseDefinition);
  if(!definitions.length||new Set(definitions.map(d=>d.case_id)).size!==definitions.length||!definitions.some(d=>d.role==='repair')||!definitions.some(d=>d.role==='promotion')) throw new Error('Cycle corpus needs unique repair and promotion cases.');
  if(definitions.some(d=>!control.files.some(file=>file.path===control.owner)||d.skill_path.replace(/\/SKILL.md$/,'')!==control.owner.replace(/\/SKILL.md$/,''))) throw new Error('Corpus and skill owner differ.');
  const max_revisions=Number(args.maxRevisions??3), max_replay_calls=Number(args.maxCalls??16), case_deadline_ms=Number(args.deadline??120000);
  if(!Number.isInteger(max_revisions)||max_revisions<1||max_revisions>3||!Number.isInteger(max_replay_calls)||max_replay_calls<1||max_replay_calls>16||!Number.isInteger(case_deadline_ms)||case_deadline_ms<1||case_deadline_ms>120000) throw new Error('Budget exceeds the approved bounds.');
  fs.mkdirSync(path.join(cycle,'conditions'),{recursive:true}); fs.mkdirSync(path.join(cycle,'attempts'));
  write(path.join(cycle,'conditions/control.json'),control);
  const manifest={kind:'pulse-skill-cycle',schema_version:'1.0',repo_root:repo,run_file:args.runFile,
    observation:observed,observation_fingerprint:objectDigest({owner:observed.owner,trigger:observed.trigger,observed_behavior:observed.observed_behavior}),
    definitions,corpus_digest:objectDigest(definitions),control_digest:control.digest,
    budget:{max_revisions,max_replay_calls,case_deadline_ms}};
  if(mode==='action') manifest.evidence_mode=mode;
  manifest.digest=objectDigest(manifest);
  write(path.join(cycle,'manifest.json'),manifest);
  const state={status:'baseline-needed',calls:0,revisions:[],attempts:[],qualification_reasons:[],final_condition:null,comparisons:[]};
  persist(cycle,state); return {cycle,status:state.status,budget:manifest.budget};
}

export function reserveAttempt(cycle,args) {
  return lock(cycle,()=>{
    const {manifest,state}=load(cycle); owner(manifest.repo_root,manifest.run_file);
    if(TERMINAL.has(state.status)) throw new Error(`Cycle is terminal: ${state.status}`);
    if(state.attempts.some(attempt=>attempt.status==='reserved')) throw new Error('A replay is already pending; finish it before another reservation.');
    const id=args.conditionId||'control', def=manifest.definitions.find(d=>d.case_id===args.caseId);
    if(!def||!/^control$|^r[1-3]$/.test(id)) throw new Error('Unknown case or condition.');
    if(state.calls>=manifest.budget.max_replay_calls) { state.status='budget-exhausted';persist(cycle,state);throw new Error('Replay budget exhausted.'); }
    if(state.attempts.some(a=>a.condition_id===id&&a.case_id===def.case_id)) throw new Error('Case already reserved; uncertain attempts are never replayed automatically.');
    const repairs=manifest.definitions.filter(d=>d.role==='repair');
    if(def.role==='promotion'&&(!state.final_condition||!['control',state.final_condition].includes(id))) throw new Error('Promotion cases require a frozen final condition.');
    if(def.role==='repair'&&state.final_condition) throw new Error('No repair after final condition freeze.');
    if(id==='control'&&state.revisions.length&&def.role==='repair') throw new Error('Control repairs already frozen.');
    let selected;
    if(id==='control') {
      if(def.role==='promotion'&&!finished(state,'control',repairs)) throw new Error('Control repair cases incomplete.');
      selected=condition(path.join(cycle,'conditions/control.json'));
      if(selected.digest!==manifest.control_digest) throw new Error('Control condition changed.');
    } else {
      const existing=state.revisions.find(r=>r.id===id);
      if(!existing) {
        if(state.status!=='revise'||!finished(state,'control',repairs)) throw new Error('Compare a complete qualified control before a revision.');
        if(state.revisions.length>=manifest.budget.max_revisions) {state.status='budget-exhausted';persist(cycle,state);throw new Error('Revision budget exhausted.');}
        if(id!==`r${state.revisions.length+1}`) throw new Error('Revision IDs must increase monotonically.');
        selected=condition(args.condition);
        const support=(args.support||'').split(',').filter(Boolean);
        const observedFailures=state.attempts.filter(a=>a.result?.qualification_status==='complete'&&a.result?.content_verdict==='fail'&&a.result?.role==='repair');
        if(!support.length||support.some(caseId=>!observedFailures.some(a=>a.case_id===caseId))) throw new Error('Revision lacks qualified observed failure support.');
        const previous=state.revisions.at(-1)?.digest||manifest.control_digest;
        if(selected.digest===previous) {state.status='stalled';persist(cycle,state);throw new Error('Repeated condition without progress.');}
        if(selected.owner!==condition(path.join(cycle,'conditions/control.json')).owner) throw new Error('Revision owner changed.');
        write(path.join(cycle,'conditions',`${id}.json`),selected);
        state.revisions.push({id,digest:selected.digest,support,source_attempt_ids:observedFailures.filter(a=>support.includes(a.case_id)).map(a=>a.attempt_id)});
      } else selected=condition(path.join(cycle,'conditions',`${id}.json`));
      if(selected.digest!==state.revisions.find(r=>r.id===id).digest) throw new Error('Revision condition changed.');
      if(def.role==='promotion'&&id===state.final_condition&&!finished(state,'control',manifest.definitions.filter(d=>d.role==='promotion'))) throw new Error('Play promotion control cases before candidate cases.');
    }
    const packet=evidenceAdapter(manifest.evidence_mode??'decision').runnerPacket(def,selected);
    if(args.requestDigest!==packet.submitted_request_sha256) throw new Error('Submitted request differs from the frozen case and condition.');
    const attempt_id=randomUUID(), reserved_at=new Date().toISOString();
    const attempt={attempt_id,case_id:def.case_id,condition_id:id,request_digest:args.requestDigest,condition_digest:selected.digest,reserved_at,
      deadline_at:new Date(Date.now()+manifest.budget.case_deadline_ms).toISOString(),status:'reserved'};
    write(path.join(cycle,'attempts',`${attempt_id}.request.json`),packet);
    state.calls++; state.status='collecting';state.attempts.push(attempt);persist(cycle,state);
    return {attempt_id,calls:state.calls,deadline_at:attempt.deadline_at,request_digest:attempt.request_digest};
  });
}

export function finishAttempt(cycle,args) {
  return lock(cycle,()=>{
    const {manifest,state}=load(cycle); owner(manifest.repo_root,manifest.run_file);
    const attempt=state.attempts.find(a=>a.attempt_id===args.attemptId);
    if(!attempt) throw new Error('Unknown attempt ID.');
    const envelope=read(args.receipt), incomingDigest=objectDigest(envelope);
    if(attempt.status!=='reserved') {
      if(attempt.receipt_digest===incomingDigest) return {attempt_id:attempt.attempt_id,idempotent:true,status:state.status};
      throw new Error('Attempt already sealed; a divergent or late receipt cannot replace it.');
    }
    if(TERMINAL.has(state.status)) throw new Error('Cycle terminal; preserve late evidence separately.');
    if(envelope.attempt_id!==attempt.attempt_id||envelope.submitted_request_sha256!==attempt.request_digest) throw new Error('Receipt belongs to a different attempt or request.');
    if(!['response','timeout','provider-error','no-response'].includes(envelope.outcome)) throw new Error('Unknown operational outcome.');
    // The harness call timestamp starts model execution; operator preparation and
    // later judging must not consume the replay's response deadline.
    const submitted=Date.parse(envelope.submitted_at||attempt.reserved_at);
    const received=Date.parse(envelope.received_at||new Date().toISOString());
    if(!Number.isFinite(submitted)||!Number.isFinite(received)||submitted<Date.parse(attempt.reserved_at)||received<submitted||received>Date.now()+1000) throw new Error('Invalid captured submission/response timestamps.');
    if(envelope.outcome==='response'&&received-submitted>manifest.budget.case_deadline_ms) throw new Error('Response exceeded deadline; record timeout and preserve the late response separately.');
    attempt.submitted_at=new Date(submitted).toISOString();attempt.received_at=new Date(received).toISOString();
    attempt.execution_deadline_at=new Date(submitted+manifest.budget.case_deadline_ms).toISOString();
    if(envelope.outcome!=='response') {
      attempt.status='operational-failure';state.status='operational-failure';
    } else {
      const prepared=envelope.preparation, evidence=envelope.evidence;
      const def=manifest.definitions.find(d=>d.case_id===attempt.case_id);
      const selected=condition(path.join(cycle,'conditions',`${attempt.condition_id}.json`));
      if(selected.digest!==attempt.condition_digest) throw new Error('Attempt condition changed.');
      const packet=evidenceAdapter(manifest.evidence_mode??'decision').runnerPacket(def,selected);
      const checked=evidenceAdapter(manifest.evidence_mode??'decision').validateEvidence(prepared,evidence,[def],[packet]);
      if(!checked.ok||checked.scenarios.length!==1) {
        attempt.status='invalid-evidence';attempt.receipt_digest=incomingDigest;attempt.finished_at=new Date().toISOString();attempt.errors=checked.errors;
        state.status='invalid-evidence';
        write(path.join(cycle,'attempts',`${attempt.attempt_id}.receipt.json`),envelope);persist(cycle,state);
        throw new Error(`Invalid evidence: ${checked.errors.join('; ')}`);
      }
      attempt.result=checked.scenarios[0];attempt.status='finished';
      state.qualification_reasons=[...new Set([...state.qualification_reasons,...checked.qualification.reasons])];
      if(checked.qualification.status==='invalid') state.status='invalid-evidence';
    }
    write(path.join(cycle,'attempts',`${attempt.attempt_id}.receipt.json`),envelope);
    attempt.receipt_digest=incomingDigest;attempt.finished_at=new Date().toISOString();persist(cycle,state);
    return {attempt_id:attempt.attempt_id,status:state.status,calls:state.calls,content_verdict:attempt.result?.content_verdict,qualification:attempt.result?.qualification_status};
  });
}

export function compareCycle(cycle) {
  return lock(cycle,()=>{
    const {manifest,state}=load(cycle);owner(manifest.repo_root,manifest.run_file);
    if(TERMINAL.has(state.status)) return {status:state.status,qualification_reasons:state.qualification_reasons,comparison:state.comparisons.at(-1)};
    if(state.attempts.some(a=>a.status==='reserved')) throw new Error('Pending attempts prevent comparison; do not replay uncertain requests.');
    const repairs=manifest.definitions.filter(d=>d.role==='repair'), promotions=manifest.definitions.filter(d=>d.role==='promotion');
    if(!finished(state,'control',repairs)) throw new Error('Control repair matrix incomplete.');
    const diagnostic=results(state,'control').some(row=>row.qualification_status!=='complete');
    const selected=state.revisions.at(-1)?.id||'control';
    if(!state.final_condition) {
      if(diagnostic||results(state,'control').filter(row=>row.role==='repair').every(row=>row.content_verdict==='pass')) {
        state.final_condition='control';state.final_digest=manifest.control_digest;
      } else if(selected==='control') state.status='revise';
      else {
        if(!finished(state,selected,repairs)) throw new Error('Candidate repair matrix incomplete.');
        const compared=evidenceAdapter(manifest.evidence_mode??'decision').compareResults(ordered(state,'control',repairs),ordered(state,selected,repairs));
        state.comparisons.push({condition_id:selected,phase:'repair',...compared});
        if(!compared.comparable) state.status='invalid-evidence';
        else if(compared.failed.length) state.status=state.revisions.length>=manifest.budget.max_revisions?'budget-exhausted':'revise';
        else {state.final_condition=selected;state.final_digest=state.revisions.at(-1).digest;}
      }
      if(state.final_condition) {state.final_frozen_at=new Date().toISOString();state.status='collecting';}
    }
    if(state.final_condition&&finished(state,'control',promotions)) {
      if(state.final_condition==='control') {
        const rows=ordered(state,'control',manifest.definitions);
        state.status=rows.some(row=>row.qualification_status!=='complete')?'diagnostic-complete':rows.every(row=>row.content_verdict==='pass')?'unchanged':'stalled';
        if(state.status==='stalled') state.stop_reason='no-supported-repair-case';
      } else if(finished(state,state.final_condition,promotions)) {
        const compared=evidenceAdapter(manifest.evidence_mode??'decision').compareResults(ordered(state,'control',manifest.definitions),ordered(state,state.final_condition,manifest.definitions));
        state.comparisons.push({condition_id:state.final_condition,phase:'promotion',...compared});
        state.status=compared.eligible?'eligible-for-review':'rejected';
      }
    }
    persist(cycle,state);
    return {status:state.status,final_condition:state.final_condition,final_digest:state.final_digest,calls:state.calls,
      qualification_reasons:state.qualification_reasons,comparison:state.comparisons.at(-1),promotion_granted:false};
  });
}

export function cycleStatus(cycle) { const {manifest,state}=load(cycle);return {cycle,status:state.status,calls:state.calls,budget:manifest.budget,final_condition:state.final_condition,
  qualification_reasons:state.qualification_reasons,attempts:state.attempts.map(({attempt_id,case_id,condition_id,status})=>({attempt_id,case_id,condition_id,status})),promotion_granted:false}; }

export function readCycle(cycle) { const data=load(cycle);owner(data.manifest.repo_root,data.manifest.run_file);return data; }

export function runCli(argv=process.argv.slice(2)) {
  if(argv.includes('--help')||!argv.length) {console.log('Pulse skill cycle: init | record --phase reserve|finish | compare | status. No provider, patch application or promotion command. See docs/evaluation/recursive-skills.md.');return;}
  const command=argv.shift(), args={};
  const names={'--evidence-mode':'evidenceMode','--repo-root':'repoRoot','--run-file':'runFile','--cycle':'cycle','--corpus':'corpus','--condition':'condition','--observation':'observation','--max-revisions':'maxRevisions','--max-calls':'maxCalls','--deadline-ms':'deadline','--phase':'phase','--case-id':'caseId','--condition-id':'conditionId','--request-digest':'requestDigest','--support':'support','--attempt-id':'attemptId','--receipt':'receipt'};
  for(let i=0;i<argv.length;i++) {const key=names[argv[i]];if(!key||!argv[i+1]) throw new Error(`Unknown or incomplete option: ${argv[i]}`);args[key]=argv[++i];}
  if(!args.cycle) throw new Error('--cycle is required.');
  let result;
  if(command==='init') result=initCycle(args);
  else if(command==='record'&&args.phase==='reserve') result=reserveAttempt(args.cycle,args);
  else if(command==='record'&&args.phase==='finish') result=finishAttempt(args.cycle,args);
  else if(command==='compare') result=compareCycle(args.cycle);
  else if(command==='status') result=cycleStatus(args.cycle);
  else throw new Error('Unknown command or record phase.');
  console.log(JSON.stringify(result,null,2));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {runCli();} catch(error) {console.error(JSON.stringify({ok:false,error:error.message}));process.exitCode=1;}
}

import { caseDefinition, conditionFromFiles, compareResults, objectDigest, sha256, sameValue } from './pulse-skill-evidence.mjs';

export const ACTION_KIND = 'pulse-skill-action-evidence';
export const ACTION_TOOLS = Object.freeze(['fixture_read', 'fixture_patch', 'fixture_test']);
export const ACTION_INSTRUCTIONS = 'Use only fixture_read, fixture_patch and fixture_test. Reproduce the reported behavior before changing code, make a bounded repair and verify neighboring paths. Tools operate on the declared fixture only. Finish with a summary of observed results. Do not claim unobserved actions, consult other agents or providers, or invoke DeepSeek.';
const fail = message => { throw new Error(message); };
const validPath = value => typeof value === 'string' && /^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\.mjs$/.test(value);

export function actionCaseDefinition(scenario) {
  const definition = caseDefinition(scenario);
  const files = scenario.fixture?.files;
  if (!Array.isArray(files) || !files.length || files.some(f => !validPath(f.path) || typeof f.content !== 'string' || Buffer.byteLength(f.content) > 65536)) fail('Action fixture needs bounded declared module files.');
  if (new Set(files.map(f => f.path)).size !== files.length) fail('Duplicate fixture path.');
  const normalized = files.map(({path,content}) => ({path,content,sha256:sha256(content)})).sort((a,b)=>a.path.localeCompare(b.path));
  if (typeof scenario.fixture.public_test !== 'string' || !scenario.fixture.public_test.trim()) fail('A fixed public verification is required.');
  const checks = scenario.checks;
  if (!Array.isArray(checks) || !checks.length || checks.some(c => !/^[A-Za-z0-9._-]+$/.test(c.check_id) || typeof c.program !== 'string' || !c.program.trim())) fail('Action case needs private checks with stable IDs.');
  if (new Set(checks.map(c=>c.check_id)).size !== checks.length) fail('Duplicate check ID.');
  return {...definition, fixture:{files:normalized,public_test:scenario.fixture.public_test}, checks:checks.map(c=>({check_id:c.check_id,program:c.program})),
    fixture_digest:objectDigest(normalized), checks_digest:objectDigest(checks.map(c=>({check_id:c.check_id,program:c.program})))};
}

export function actionRunnerPacket(definition, condition) {
  const verified = conditionFromFiles(condition.owner, condition.files);
  if (condition.digest !== verified.digest) fail('Skill condition digest mismatch.');
  const input = {instructions:ACTION_INSTRUCTIONS, case_id:definition.case_id,
    guidance:verified.files, context:definition.context, prompt:definition.prompt,
    fixture_files:definition.fixture.files.map(({path,sha256})=>({path,sha256})), tools:[...ACTION_TOOLS]};
  const request=JSON.stringify(input,null,2)+'\n';
  return {case_id:definition.case_id,skill_condition_digest:verified.digest,request,
    submitted_request_sha256:sha256(request),packet_sha256:objectDigest(input)};
}

export function prepareActionEvidence({iteration,configPath,sourcePath,scenarios,conditions,executionKind='native'}) {
  if (!['native','fixture'].includes(executionKind)) fail('Unsupported execution kind.');
  if (!Array.isArray(scenarios)||!scenarios.length) fail('Prepared action corpus must contain cases.');
  const definitions=scenarios.map(actionCaseDefinition);
  if (new Set(definitions.map(d=>d.case_id)).size!==definitions.length) fail('Duplicate case IDs.');
  const packets=definitions.map(d=>actionRunnerPacket(d,conditions[d.case_id]));
  const manifest={kind:'pulse-skill-action-preparation',schema_version:'1.0',iteration,config_path:configPath,scenario_source:sourcePath,
    selected_scenario_ids:definitions.map(d=>d.id),scenario_digest:objectDigest(definitions),execution_kind:executionKind,definitions,packets};
  manifest.preparation_digest=objectDigest(manifest);
  const evidence={kind:ACTION_KIND,schema_version:'1.0',iteration,config_path:configPath,scenario_source:sourcePath,
    selected_scenario_ids:manifest.selected_scenario_ids,scenario_digest:manifest.scenario_digest,preparation_digest:manifest.preparation_digest,execution_kind:executionKind,
    runner:{model_id:null,model_version:null,reasoning_effort:null,runtime:null},
    provenance:{profile_status:'unavailable',trace_status:'unavailable',model_version_is_immutable:false,profile_sources:{}},
    scenarios:definitions.map((d,i)=>({...d,...packets[i],response:'',replay_id:null,capture:null,
      criterion_results:d.criteria.map(c=>({criterion_id:c.criterion_id,verdict:null,reason:'',references:[]})),judge:null}))};
  return {manifest,evidence,packets,judge:{kind:'pulse-action-judge-packet',definitions}};
}

function sourceTexts(entry) {
  const capture=entry.capture;
  return {response:entry.response,profile:JSON.stringify(capture?.profile_observation??{}),...Object.fromEntries((capture?.trace??[]).map(t=>[`trace:${t.call_id}`,JSON.stringify(t)])),
    ...Object.fromEntries((capture?.checks??[]).map(c=>[`check:${c.check_id}`,JSON.stringify(c)])),
    ...Object.fromEntries(Object.entries(capture?.files_after??{}).map(([p,c])=>[`file:${p}`,c]))};
}
function referenceExists(reference,texts) {
  return reference && typeof reference.source==='string' && typeof reference.quote==='string' && reference.quote.length>0 && typeof texts[reference.source]==='string' && texts[reference.source].includes(reference.quote);
}

function checkCapture(def,packet,entry,errors) {
  const c=entry.capture;
  if (!c || typeof c.attempt_id!=='string' || !c.attempt_id || c.attempt_id!==entry.replay_id || c.submitted_request!==packet.request) { errors.push('Capture attempt/request binding mismatch.'); return false; }
  if (!sameValue(c.files_before,Object.fromEntries(def.fixture.files.map(f=>[f.path,f.content]))) || !sameValue(Object.keys(c.files_after??{}).sort(),def.fixture.files.map(f=>f.path).sort())) errors.push('Captured fixture matrix/preimage differs.');
  if (!Array.isArray(c.checks) || !sameValue(c.checks.map(t=>t.check_id).sort(),def.checks.map(t=>t.check_id).sort())) errors.push('Private check coverage differs.');
  for (const result of c.checks??[]) if (!['pass','fail'].includes(result.verdict) || result.verdict!==(result.exit_code===0&&!result.stop_reason?'pass':'fail') || result.program_sha256!==sha256(def.checks.find(t=>t.check_id===result.check_id)?.program??'')) errors.push('Private check verdict/program binding differs.');
  if (!Array.isArray(c.trace)) errors.push('Trace must preserve observed operations.');
  const ids=new Set();
  for (const event of c.trace??[]) {
    if (!event.call_id || ids.has(event.call_id) || event.attempt_id!==c.attempt_id || !ACTION_TOOLS.includes(event.operation) || !['completed','rejected'].includes(event.status)) errors.push('Invalid, duplicate or foreign trace operation.');
    ids.add(event.call_id);
  }
  return c.quiescent===true && c.trace_complete===true && c.policy?.worker==='bubblewrap-readonly-no-network' && sameValue(c.capabilities?.tools,ACTION_TOOLS)
    && Array.isArray(c.argv) && !!c.runtime_hashes?.native && !!c.runtime_hashes?.driver;
}

function checked(manifest,evidence,currentDefinitions,currentPackets) {
  const errors=[];
  if (manifest.kind!=='pulse-skill-action-preparation'||manifest.schema_version!=='1.0'||evidence.kind!==ACTION_KIND||evidence.schema_version!=='1.0') errors.push('Action kind/schema mismatch.');
  const {preparation_digest,...unsigned}=manifest;
  if (objectDigest(unsigned)!==preparation_digest) errors.push('Action preparation changed.');
  if (!Array.isArray(manifest.definitions)||!manifest.definitions.length) fail('Empty action matrix.');
  for (const key of ['iteration','config_path','scenario_source','selected_scenario_ids','scenario_digest','preparation_digest','execution_kind']) if (!sameValue(evidence[key],manifest[key])) errors.push(`Action binding differs: ${key}`);
  if (!sameValue(currentDefinitions,manifest.definitions)||!sameValue(currentPackets,manifest.packets)) errors.push('Current action corpus/condition/packet differs.');
  if (!sameValue(evidence.scenarios?.map(e=>e.id),manifest.selected_scenario_ids)) errors.push('Action scenario matrix differs.');
  const reasons=[];
  if (manifest.execution_kind==='fixture') reasons.push('synthetic-fixture');
  const runner=evidence.runner??{}, provenance=evidence.provenance??{};
  for (const key of ['model_id','model_version','reasoning_effort','runtime']) if (typeof runner[key]!=='string'||!runner[key].trim()) reasons.push(`${key}_unavailable`);
  const version=runner.model_version;
  if (version && (version===runner.model_id || /^\d+\.\d+\.\d+$/.test(version) || provenance.model_version_is_immutable!==true)) reasons.push('immutable_model_version_unproven');
  if (provenance.profile_status!=='verified') reasons.push('replay_profile_unverified');
  if (provenance.trace_status!=='complete') reasons.push('trace_unavailable');
  const scenarios=manifest.definitions.map((def,i)=>{
    const entry=evidence.scenarios?.[i]??{}, packet=manifest.packets[i];
    for (const [key,value] of Object.entries({...def,...packet})) if (!sameValue(entry[key],value)) errors.push(`${def.case_id}: frozen ${key} differs`);
    if (typeof entry.response!=='string'||!entry.response.trim()) errors.push(`${def.case_id}: response missing`);
    const complete=checkCapture(def,packet,entry,errors), texts=sourceTexts(entry);
    if (!complete) reasons.push('action_observation_unavailable');
    const observed=entry.capture?.profile_observation??{};
    const values={model_id:observed.request?.model_id,reasoning_effort:observed.request?.reasoning_effort,runtime:observed.runtime?.id,model_version:observed.response?.model_version};
    for (const key of ['model_id','model_version','reasoning_effort','runtime']) if (runner[key] && (values[key]!==runner[key] || provenance.profile_sources?.[key]?.source!=='profile' || !referenceExists(provenance.profile_sources[key],texts) || !provenance.profile_sources[key].quote.includes(runner[key]))) reasons.push(`${key}_source_unavailable`);
    if (version && observed.response?.immutable_version!==true) reasons.push('immutable_model_version_unproven');
    const criteria=entry.criterion_results;
    if (!Array.isArray(criteria)||!sameValue(criteria.map(c=>c.criterion_id).sort(),def.criteria.map(c=>c.criterion_id).sort())) errors.push(`${def.case_id}: criterion coverage differs`);
    for (const criterion of criteria??[]) {
      if (!['pass','fail'].includes(criterion.verdict)||!criterion.reason?.trim()||!Array.isArray(criterion.references)||!criterion.references.length||criterion.references.some(r=>!referenceExists(r,texts))) errors.push(`${def.case_id}: incomplete or ungrounded criterion`);
    }
    const verdict=(criteria??[]).some(c=>c.verdict!=='pass')||entry.capture?.checks?.some(c=>c.verdict!=='pass')?'fail':'pass';
    if (typeof entry.judge?.passed==='boolean'&&entry.judge.passed!==(verdict==='pass')) errors.push('Contradictory action aggregate.');
    return {...def,...packet,response:entry.response,replay_id:entry.replay_id,criterion_results:criteria,capture:entry.capture,
      behavior_verdict:verdict,content_verdict:verdict,trace_status:complete?'complete':'unavailable',action_observation_status:complete?'complete':'unavailable',
      runner,provenance,execution_kind:manifest.execution_kind,status:'completed',judge:{passed:verdict==='pass',summary:entry.judge?.summary??'Derived from frozen criteria and private checks.'}};
  });
  const qualification={status:errors.length?'invalid':reasons.length?'diagnostic':'complete',reasons:[...new Set(reasons)]};
  for (const row of scenarios) {row.qualification_status=qualification.status;row.qualification_reasons=qualification.reasons;}
  return {ok:!errors.length,errors,scenarios,qualification,promotion_eligible:!errors.length&&qualification.status==='complete'&&scenarios.every(r=>r.content_verdict==='pass')};
}

export function validateActionEvidence(...args) {
  try { return checked(...args); }
  catch (error) {return {ok:false,errors:[error.message],scenarios:[],qualification:{status:'invalid',reasons:['malformed-action-evidence']},promotion_eligible:false};}
}

export function compareActionResults(control,candidate) {
  const result=compareResults(control,candidate), reasons=[];
  control.forEach((before,i)=>{
    const after=candidate[i];
    for (const key of ['fixture_digest','checks_digest']) if (!after || before[key]!==after[key]) reasons.push(`${before.case_id}:${key}-changed`);
    if (before.action_observation_status!=='complete'||after?.action_observation_status!=='complete') reasons.push(`${before.case_id}:action-observation-unavailable`);
    for (const criterion of before.criterion_results??[]) if (criterion.verdict==='pass' && after?.criterion_results?.find(c=>c.criterion_id===criterion.criterion_id)?.verdict!=='pass' && !result.regressions.includes(before.case_id)) result.regressions.push(before.case_id);
  });
  return {...result,comparable:result.comparable&&!reasons.length,reasons:[...result.reasons,...reasons],eligible:result.eligible&&!reasons.length&&!result.regressions.length};
}

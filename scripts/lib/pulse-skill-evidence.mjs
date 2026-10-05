import { createHash } from 'node:crypto';

export const EVIDENCE_VERSION = 4;
export const EVIDENCE_KIND = 'pulse-chat-benchmark-evidence';
export const REPLAY_INSTRUCTIONS = 'Use only the guidance and context supplied below. Do not use tools, read files, consult other agents or providers, or invoke DeepSeek. Treat the scenario as work to decide: state your decision, the action you would take, and its reason. Do not claim that an action was executed.';

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
export function sha256(value) { return `sha256:${createHash('sha256').update(value).digest('hex')}`; }
export function objectDigest(value) { return sha256(JSON.stringify(canonical(value))); }
export function sameValue(left, right) { return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right)); }

export function conditionFromFiles(owner, files) {
  if (typeof owner !== 'string' || !owner.trim() || !Array.isArray(files) || !files.length) throw new Error('A skill condition needs an owner and declared files.');
  const sorted = files.map(file => {
    if (typeof file.path !== 'string' || !file.path || typeof file.content !== 'string') throw new Error('Condition files need a path and exact UTF-8 content.');
    const bytes = Buffer.byteLength(file.content);
    const digest = sha256(file.content);
    if (file.sha256 && file.sha256 !== digest || file.bytes !== undefined && file.bytes !== bytes) throw new Error(`Condition bytes do not match their identity: ${file.path}`);
    return { path: file.path, content: file.content, sha256: digest, bytes };
  }).sort((a,b) => a.path.localeCompare(b.path));
  if (new Set(sorted.map(file => file.path)).size !== sorted.length) throw new Error('Duplicate condition file.');
  if (!sorted.some(file=>file.path===owner)) throw new Error('The declared owner skill body is missing from the condition.');
  return { owner, files: sorted, digest: objectDigest({ owner, files: sorted.map(({path,sha256,bytes}) => ({path,sha256,bytes})) }) };
}

export function caseDefinition(scenario) {
  const case_id = String(scenario.case_id ?? scenario.id);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(case_id) || typeof scenario.prompt !== 'string' || !scenario.prompt.trim()) throw new Error('Invalid case ID or prompt.');
  const expectations = scenario.expectations;
  if (!Array.isArray(expectations) || !expectations.length || expectations.some(text => typeof text !== 'string' || !text.trim())) throw new Error(`Case ${case_id} needs explicit criteria.`);
  if (new Set(expectations).size !== expectations.length) throw new Error(`Duplicate expectations: ${case_id}`);
  const role = scenario.role ?? 'repair';
  if (!['repair','promotion'].includes(role)) throw new Error(`Invalid case role: ${case_id}`);
  return { id: scenario.id, case_id, role, skill: scenario.skill, skill_path: scenario.skill_path,
    prompt: scenario.prompt, expected_output: scenario.expected_output ?? '', expectations,
    context: scenario.context ?? {},
    criteria: expectations.map((text,index) => ({ criterion_id: `${case_id}:e${index+1}`, required: true, expectation: text })) };
}

export function runnerPacket(definition, condition) {
  const verified = conditionFromFiles(condition.owner,condition.files);
  if (condition.digest && condition.digest !== verified.digest) throw new Error('Skill condition digest mismatch.');
  const input = { instructions: REPLAY_INSTRUCTIONS, harness: { fork_turns:'none', evaluation:'guidance-in-context' }, case_id: definition.case_id,
    guidance: verified.files.map(({path,content,sha256,bytes}) => ({path,content,sha256,bytes})),
    context: definition.context, prompt: definition.prompt };
  const request = JSON.stringify(input,null,2)+'\n';
  return { case_id: definition.case_id, skill_condition_digest: verified.digest,
    request, submitted_request_sha256: sha256(request), packet_sha256: objectDigest(input) };
}

export function prepareEvidence({ iteration, configPath, sourcePath, scenarios, conditions, executionKind = 'native' }) {
  if (!['native','fixture'].includes(executionKind)) throw new Error('Unsupported execution kind.');
  if (!Array.isArray(scenarios)||!scenarios.length) throw new Error('A prepared corpus must contain cases.');
  const definitions = scenarios.map(caseDefinition);
  if (new Set(definitions.map(def => def.case_id)).size !== definitions.length) throw new Error('Duplicate case IDs.');
  const packets = definitions.map(def => runnerPacket(def,conditions[def.case_id]));
  const manifest = { kind: 'pulse-skill-preparation', schemaVersion: EVIDENCE_VERSION,
    iteration, config_path: configPath, scenario_source: sourcePath,
    selected_scenario_ids: definitions.map(def => def.id), scenario_digest: objectDigest(definitions),
    execution_kind: executionKind, definitions, packets };
  manifest.preparation_digest = objectDigest(manifest);
  const evidence = { kind: EVIDENCE_KIND, schemaVersion: EVIDENCE_VERSION, iteration,
    config_path: configPath, scenario_source: sourcePath, selected_scenario_ids: manifest.selected_scenario_ids,
    scenario_digest: manifest.scenario_digest, preparation_digest: manifest.preparation_digest,
    execution_kind: executionKind,
    runner: { mode:'chat', model_id:null, model_version:null, reasoning_effort:null, runtime:null },
    provenance: { profile_status:'unavailable', trace_status:'unavailable', tools:null, source:'not-exposed' },
    scenarios: definitions.map((def,index) => ({ ...def,
      packet_sha256: packets[index].packet_sha256,
      submitted_request_sha256: packets[index].submitted_request_sha256,
      skill_condition_digest: packets[index].skill_condition_digest,
      replay_id:null, response:'',
      criterion_results: def.criteria.map(({criterion_id}) => ({criterion_id,verdict:null,quote:'',reason:''})),
      judge:null,
    })) };
  return { manifest, evidence, packets, judge: { kind:'pulse-judge-packet',schemaVersion:4,definitions } };
}

export function qualifyProof(runner = {}, provenance = {}, executionKind = 'native') {
  const reasons = [];
  if (executionKind === 'fixture') reasons.push('synthetic-fixture');
  for (const field of ['model_id','model_version','reasoning_effort','runtime']) {
    if (typeof runner?.[field] !== 'string' || !runner[field].trim()) reasons.push(`${field}_unavailable`);
  }
  if (provenance?.profile_status !== 'verified') reasons.push('replay_profile_unverified');
  if (provenance?.trace_status !== 'complete' || !Array.isArray(provenance?.tools)) reasons.push('trace_unavailable');
  if (Array.isArray(provenance?.tools) && provenance.tools.length) return { status:'invalid', reasons:[...reasons,'tools_observed'] };
  return { status:reasons.length ? 'diagnostic' : 'complete', reasons };
}

function validateCriteria(def, entry) {
  const errors = [];
  const results = entry.criterion_results;
  const expected = def.criteria.map(item => item.criterion_id);
  if (!Array.isArray(results) || !sameValue(results.map(item => item.criterion_id).sort(),[...expected].sort())) {
    return { errors:[`${def.case_id}: criterion coverage differs`], verdict:'invalid' };
  }
  for (const item of results) {
    if (!['pass','fail','invalid'].includes(item.verdict)) errors.push(`${def.case_id}: incomplete criterion verdict`);
    if (typeof item.reason !== 'string' || !item.reason.trim()) errors.push(`${def.case_id}: missing criterion reason`);
    if (typeof item.quote !== 'string' || !item.quote.trim() || !entry.response.includes(item.quote)) errors.push(`${def.case_id}: criterion quote does not occur in response`);
  }
  const verdict = results.some(item => item.verdict === 'invalid') ? 'invalid' : results.some(item => item.verdict === 'fail') ? 'fail' : 'pass';
  if (verdict === 'invalid') errors.push(`${def.case_id}: invalid criterion judgment requires a new frozen case, not a guidance intervention`);
  if (entry.judge && typeof entry.judge.passed === 'boolean' && entry.judge.passed !== (verdict === 'pass')) errors.push(`${def.case_id}: contradictory aggregate verdict`);
  if (entry.judge?.passed === true && Array.isArray(entry.judge.missed) && entry.judge.missed.length) errors.push(`${def.case_id}: success reports missed criteria`);
  return { errors, verdict };
}

export function validateEvidence(manifest, evidence, currentDefinitions, currentPackets) {
  const errors = [];
  if(manifest.kind!=='pulse-skill-preparation'||manifest.schemaVersion!==EVIDENCE_VERSION) errors.push('Preparation kind/schema mismatch.');
  if(!Array.isArray(manifest.definitions)||!manifest.definitions.length) return {ok:false,errors:[...errors,'Prepared case matrix is empty.'],scenarios:[],qualification:{status:'invalid',reasons:['empty-corpus']},promotion_eligible:false};
  const { preparation_digest, ...unsigned } = manifest;
  if (objectDigest(unsigned) !== preparation_digest) errors.push('Preparation manifest changed.');
  if (evidence.kind !== EVIDENCE_KIND || evidence.schemaVersion !== EVIDENCE_VERSION) errors.push('Evidence kind/schema mismatch.');
  for (const field of ['iteration','config_path','scenario_source','selected_scenario_ids','scenario_digest','preparation_digest','execution_kind']) {
    if (!sameValue(evidence[field],manifest[field])) errors.push(`Evidence binding mismatch: ${field}`);
  }
  if (!sameValue(currentDefinitions,manifest.definitions)) errors.push('Current corpus differs from frozen preparation.');
  if (!sameValue(currentPackets,manifest.packets)) errors.push('Current skill/context/request differs from frozen preparation.');
  const entries = Array.isArray(evidence.scenarios) ? evidence.scenarios : [];
  if (!sameValue(entries.map(entry => entry.id),manifest.selected_scenario_ids)) errors.push('Scenario IDs missing, duplicated, or reordered.');
  const qualification = qualifyProof(evidence.runner,evidence.provenance,evidence.execution_kind);
  const scenarios = manifest.definitions.map((def,index) => {
    const entry = entries[index] ?? {};
    const packet = manifest.packets[index];
    for (const [field,value] of Object.entries(def)) if (!sameValue(entry[field],value)) errors.push(`${def.case_id}: copied ${field} differs from frozen case`);
    for (const field of ['packet_sha256','submitted_request_sha256','skill_condition_digest']) if (entry[field] !== packet[field]) errors.push(`${def.case_id}: ${field} mismatch`);
    if (typeof entry.response !== 'string' || !entry.response.trim()) errors.push(`${def.case_id}: response missing`);
    const response = typeof entry.response === 'string' ? entry.response : '';
    const criteria = validateCriteria(def,{...entry,response});
    errors.push(...criteria.errors);
    const verdict = criteria.verdict;
    return { ...def, ...packet, response, replay_id:entry.replay_id,
      criterion_results:entry.criterion_results, content_verdict:verdict,
      qualification_status:qualification.status, qualification_reasons:qualification.reasons,
      runner:evidence.runner, provenance:evidence.provenance, execution_kind:evidence.execution_kind,
      status:'completed', judge:{passed:verdict==='pass',summary:entry.judge?.summary ?? 'Derived from frozen criteria.',
        satisfied:def.criteria.filter(criterion => entry.criterion_results?.some(r=>r.criterion_id===criterion.criterion_id&&r.verdict==='pass')).map(c=>c.expectation),
        missed:def.criteria.filter(criterion => entry.criterion_results?.some(r=>r.criterion_id===criterion.criterion_id&&r.verdict!=='pass')).map(c=>c.expectation) } };
  });
  return { ok:!errors.length, errors, scenarios, qualification,
    promotion_eligible:!errors.length && qualification.status==='complete' && scenarios.every(item=>item.content_verdict==='pass') };
}

export function compareResults(control, candidate) {
  const reasons = [], regressions = [], corrected = [];
  const ids = control.map(item => item.case_id);
  if (!sameValue(ids,candidate.map(item=>item.case_id)) || new Set(ids).size !== ids.length) reasons.push('case-matrix-mismatch');
  for (let index=0;index<control.length;index++) {
    const before=control[index], after=candidate[index];
    if (!after) continue;
    for (const field of ['prompt','criteria','context','role','runner']) if (!sameValue(before[field],after[field])) reasons.push(`${before.case_id}:${field}-changed`);
    if (before.qualification_status!=='complete'||after.qualification_status!=='complete') reasons.push(`${before.case_id}:unqualified-proof`);
    if (!['pass','fail'].includes(before.content_verdict)||!['pass','fail'].includes(after.content_verdict)) reasons.push(`${before.case_id}:invalid-content-verdict`);
    if (before.content_verdict==='pass'&&after.content_verdict!=='pass') regressions.push(before.case_id);
    if (before.content_verdict==='fail'&&after.content_verdict==='pass') corrected.push(before.case_id);
  }
  const failed=candidate.filter(item=>item.content_verdict!=='pass').map(item=>item.case_id);
  return { comparable:!reasons.length, reasons:[...new Set(reasons)], regressions, corrected, failed,
    eligible:!reasons.length && !regressions.length && !failed.length && corrected.length>0 };
}

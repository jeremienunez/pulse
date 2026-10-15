import { objectDigest, sha256 } from './pulse-skill-evidence.mjs';
import { validateCulturalTree, validateCulturalDirections } from './pulse-culture-tree.mjs';

export const CREATIVE_VERSION = '1.1';
export const CREATIVE_READABLE_VERSIONS = ['1.0','1.1'];
export const ENSEMBLES = ['peers', 'contemporary', 'culture'];
const text = value => typeof value === 'string' && value.trim().length > 0;
const list = value => Array.isArray(value) && value.length > 0;
export const safeId = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value);
export const safePath = value => text(value) && !value.startsWith('/') && !value.includes('\\') && value.split('/').every(p => p && p !== '.' && p !== '..');
const result = errors => ({ ok: errors.length === 0, errors });
const identity = (value, kind, ctx, errors) => {
  if (!CREATIVE_READABLE_VERSIONS.includes(ctx.creative_version) || value?.kind !== kind || value.schema_version !== ctx.creative_version || value.brief_id !== ctx.brief.id || value.manifest_digest !== ctx.manifest_digest) errors.push('identity: kind, version, brief or manifest differs');
};

export function validatePolicy(policy, expectedVersion) {
  const limits = { research_active_ms_per_brief: 1800000, global_active_ms: 10800000, max_candidates_per_brief: 15, max_deep_refs_per_brief: 8, max_directions_per_brief: 3, max_correction_rounds_per_brief: 2, max_native_tasks: 16, max_tool_actions: 160 };
  const errors = [];
  if (!CREATIVE_READABLE_VERSIONS.includes(expectedVersion) || policy?.kind !== 'pulse-creative-pilot-policy' || policy.schema_version !== expectedVersion) errors.push('policy identity invalid');
  for (const [key, ceiling] of Object.entries(limits)) if (!Number.isInteger(policy?.budget?.[key]) || policy.budget[key] < 1 || policy.budget[key] > ceiling) errors.push(`policy limit invalid: ${key}`);
  if (policy?.budget?.min_deep_refs_per_ensemble !== 2 || policy?.budget?.additional_external_spend_eur !== 0 || policy?.paid_tools !== false) errors.push('policy coverage or spending differs');
  if (policy?.budget?.max_deep_refs_per_brief < 6) errors.push('policy cannot meet three-ensemble coverage');
  const pilot=expectedVersion==='1.1'?policy?.allocation?.pilot_ceiling:null;
  if(pilot&&(!['models','tools','active_minutes'].every(k=>Number.isInteger(pilot[k])&&pilot[k]>0)||pilot.models>policy.budget.max_native_tasks||pilot.tools>policy.budget.max_tool_actions||pilot.active_minutes*60000>policy.budget.global_active_ms))errors.push('pilot allocation exceeds approved budget');
  if (!list(policy?.viewports) || policy.viewports.some(v => !Number.isInteger(v.width) || v.width < 1 || !Number.isInteger(v.height) || v.height < 1)) errors.push('viewports invalid');
  return result(errors);
}

// Inspect dimensions without decoding or executing content. Semantic inspection is a separate owner review.
export function imageSize(bytes) {
  const b = Buffer.from(bytes);
  if (b.length >= 24 && b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  if (b.length > 4 && b[0] === 255 && b[1] === 216) {
    let i = 2;
    while (i + 4 < b.length) {
      if (b[i++] !== 255) break;
      while (b[i] === 255) i++;
      const marker = b[i++];
      if (marker === 217 || marker === 218) break;
      if (marker === 1 || marker >= 208 && marker <= 215) continue;
      const length = b.readUInt16BE(i);
      if (length < 2 || i + length > b.length) break;
      if ([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker) && length >= 7) return { height: b.readUInt16BE(i + 3), width: b.readUInt16BE(i + 5) };
      i += length;
    }
  }
  throw new Error('support is not a dimensioned PNG/JPEG');
}

function artifact(ref, ctx, errors) {
  if (!safePath(ref?.path) || !/^sha256:[a-f0-9]{64}$/.test(ref?.sha256 || '')) { errors.push('artifact path/digest invalid'); return null; }
  try {
    const bytes = ctx.read(ref.path);
    if (sha256(bytes) !== ref.sha256) throw new Error('digest mismatch');
    return bytes;
  } catch (e) { errors.push(`artifact ${ref.path}: ${e.message}`); return null; }
}

export function validateResearch(data, review, ctx) {
  const errors = [];
  identity(data, 'pulse-creative-research', ctx, errors);
  if (ctx.brief.terrain === 'nonactivation') {
    if (data?.status !== 'not-applicable' || !text(data.reason) || (data.references || []).length) errors.push('mechanical scope needs empty not-applicable research');
    if(ctx.creative_version==='1.1'&&(!Array.isArray(data?.references)||data.cultural_tree!=null))errors.push('mechanical scope cannot contain a cultural tree');
    return result(errors);
  }
  if (data?.status !== 'complete') errors.push('research is not complete');
  const refs = Array.isArray(data?.references) ? data.references : [];
  if (refs.length > ctx.policy.budget.max_candidates_per_brief) errors.push('candidate limit exceeded');
  const ids = new Set(), origins = new Set(), urls = new Set(), coverage = Object.fromEntries(ENSEMBLES.map(k => [k, 0]));
  let deep = 0;
  for (const ref of refs) {
    if (!ref || typeof ref !== 'object' || Array.isArray(ref)) { errors.push('reference object invalid'); continue; }
    if (!safeId(ref.id) || ids.has(ref.id)) errors.push('reference ID duplicate/invalid');
    ids.add(ref.id);
    const origin = text(ref.origin_id) ? ref.origin_id.trim().toLowerCase() : '';
    if (!origin || origins.has(origin)) errors.push('project origin duplicate/invalid');
    origins.add(origin);
    if (!ENSEMBLES.includes(ref.ensemble)) errors.push('unknown reference ensemble');
    try { const u = new URL(ref.url); if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password) throw new Error(); u.hash=''; u.search=''; const canonical=u.toString().replace(/\/$/,''); if(urls.has(canonical)) errors.push('reference URL duplicate');urls.add(canonical); } catch { errors.push('reference URL invalid'); }
    if (!text(ref.title) || !text(ref.collected_at) || !Number.isFinite(Date.parse(ref.collected_at))) errors.push('reference title/collection date missing');
    if (ref.depth === 'candidate') continue;
    if (ref.depth !== 'deep' || ref.access !== 'inspected' || !['project','work','article','screen','flow'].includes(ref.inspection_scope)) errors.push('deep reference is not an inspected work/project');
    deep++; if (ref.ensemble in coverage) coverage[ref.ensemble]++;
    for (const key of ['observation','mechanism_hypothesis','boundary','transformation']) if (!text(ref[key])) errors.push(`empty reference ${key}`);
    if (!list(ref.supports) || new Set(ref.supports.map(s => s?.id)).size !== ref.supports.length) errors.push('reference supports missing/duplicate');
    const supports = new Map();
    for (const s of ref.supports || []) {
      if(!s||typeof s!=='object'){errors.push('support object invalid');continue;}
      const bytes = artifact(s, ctx, errors); supports.set(s.id, { ...s, bytes });
      if (!ctx.verifySupport?.(s)) errors.push('support has no successful admitted inspection receipt');
      if (!safeId(s.id) || s.source_url !== ref.url || !text(s.observed_at) || !Number.isFinite(Date.parse(s.observed_at))) errors.push('support observation context missing');
      if (bytes && s.type === 'image') {
        try { const size = imageSize(bytes); if (size.width !== s.width || size.height !== s.height) errors.push('support dimensions differ'); } catch (e) { errors.push(e.message); }
      } else if (bytes && (s.type !== 'text' || !text(bytes.toString('utf8')))) errors.push('support type/content invalid');
    }
    const anchor = ref.anchor, support = supports.get(anchor?.support_id);
    if (!support?.bytes) errors.push('observation anchor unresolved');
    else if (support.type === 'text') {
      if (!text(anchor.quote) || !support.bytes.toString('utf8').includes(anchor.quote)) errors.push('observation quote absent from inspected support');
    } else {
      const r = anchor?.region;
      if (!r || ![r.x,r.y,r.width,r.height].every(Number.isFinite) || r.x < 0 || r.y < 0 || r.width <= 0 || r.height <= 0 || r.x+r.width > support.width || r.y+r.height > support.height) errors.push('visual anchor outside support');
    }
    if (ref.claims_interaction && (!list(ref.sequence) || ref.sequence.length < 2 || new Set(ref.sequence).size < 2 || ref.sequence.some(id => !supports.has(id)))) errors.push('interaction lacks distinct observed states');
  }
  if (deep > ctx.policy.budget.max_deep_refs_per_brief) errors.push('deep reference limit exceeded');
  for (const k of ENSEMBLES) if (coverage[k] < ctx.policy.budget.min_deep_refs_per_ensemble) errors.push(`coverage missing: ${k}`);
  if (review?.kind !== 'pulse-creative-research-review' || review.brief_id !== ctx.brief.id || review.research_digest !== objectDigest(data) || review.actor !== 'root' || review.verdict !== 'pass' || !list(review.reasons) || review.reasons.some(x => !text(x))) errors.push('independent owner research review missing/stale');
  const culture=ctx.creative_version==='1.1'?validateCulturalTree(data,review,ctx):null;
  if(culture)errors.push(...culture.errors);
  return { ...result(errors), coverage, deep, candidate_count: refs.length, ...(culture?{culture}:{} ) };
}

export function validateDirections(data, research, ctx) {
  const errors = []; identity(data, 'pulse-creative-directions', ctx, errors);
  if (ctx.brief.terrain === 'nonactivation') {
    if ((data?.directions || []).length) errors.push('mechanical scope must not generate directions');
    return result(errors);
  }
  const dirs = Array.isArray(data?.directions) ? data.directions : [], initial = dirs.filter(d => !d?.correction_round);
  if (initial.length < 2 || initial.length > ctx.policy.budget.max_directions_per_brief || dirs.length > ctx.policy.budget.max_directions_per_brief + ctx.policy.budget.max_correction_rounds_per_brief) errors.push('direction count outside bounds');
  const sourceIds = new Set((research?.references || []).filter(r => r?.depth === 'deep').map(r => r.id)), ids = new Set(), structures = new Set();
  for (const d of dirs) {
    if (!d || typeof d !== 'object' || Array.isArray(d)) { errors.push('direction object invalid'); continue; }
    if (!safeId(d.id) || ids.has(d.id)) errors.push('direction ID invalid/duplicate'); ids.add(d.id);
    if (!text(d.title) || !text(d.intent) || !text(d.structure?.composition) || !text(d.structure?.interaction)) errors.push('direction intent/structure empty');
    const structure = objectDigest({ composition: d.structure?.composition, interaction: d.structure?.interaction });
    if (!d.correction_round && structures.has(structure)) errors.push('directions only recolor the same structure'); structures.add(structure);
    if (d.correction_round && (!Number.isInteger(d.correction_round) || d.correction_round < 1 || d.correction_round > ctx.policy.budget.max_correction_rounds_per_brief || !list(d.parent_ids))) errors.push('correction lineage invalid');
    if (!list(d.transformations)) errors.push('direction has no reference transformation');
    for (const t of d.transformations || []) if (!sourceIds.has(t.reference_id) || !text(t.principle) || !text(t.change) || !text(t.target_need)) errors.push('transformation unresolved/empty');
    for (const key of ['prototype_files','moodboard_files']) {
      if (!list(d[key])) errors.push(`direction ${key} missing`);
      for (const f of d[key] || []) artifact(f, ctx, errors);
    }
  }
  for (const d of dirs) if ((d?.parent_ids || []).some(id => !ids.has(id) || id === d.id)) errors.push('correction parent unresolved');
  if (data?.review?.actor !== 'root' || data?.review?.verdict !== 'pass' || !list(data?.review?.reasons) || data.review.reasons.some(x => !text(x))) errors.push('owner divergence review missing');
  if(ctx.creative_version==='1.1')errors.push(...validateCulturalDirections(data,research));
  return result(errors);
}

export function validateEvaluation(data, directions, ctx) {
  const errors = []; identity(data, 'pulse-creative-evaluation', ctx, errors);
  const expected = ctx.brief.criteria, dirs = ctx.brief.terrain === 'nonactivation' ? [{ id: ctx.creative_version==='1.1'?ctx.brief.id:'NA1' }] : directions?.directions || [];
  const seen = new Set(); let failures = 0;
  for (const row of data?.directions || []) {
    if(!row||typeof row!=='object'){errors.push('evaluation row invalid');continue;}
    if (seen.has(row.direction_id) || !dirs.some(d => d.id === row.direction_id)) errors.push('evaluation direction duplicate/unresolved'); seen.add(row.direction_id);
    const results = Array.isArray(row.criterion_results) ? row.criterion_results : [];
    if (results.length !== expected.length || new Set(results.map(c => c?.criterion_id)).size !== expected.length || expected.some(c => !results.some(x => x?.criterion_id === c.id))) errors.push('criterion coverage differs');
    for (const c of results) {
      if(!c||typeof c!=='object'){errors.push('criterion row invalid');continue;}
      if (!['pass','fail','unobserved'].includes(c.verdict) || !text(c.reason) || !list(c.evidence)) errors.push('criterion judgment incomplete');
      for (const ref of c.evidence || []) artifact(ref, ctx, errors);
      if (expected.find(x => x.id === c.criterion_id)?.required && c.verdict !== 'pass') failures++;
    }
    if (ctx.brief.terrain !== 'nonactivation') {
      const captures = row.captures || [];
      for (const v of ctx.policy.viewports) if (!captures.some(x => x.viewport?.width === v.width && x.viewport?.height === v.height)) errors.push('prototype viewport missing');
      for (const c of captures) {
        const bytes = artifact(c, ctx, errors);
        if(!ctx.verifySupport?.(c)) errors.push('prototype capture has no admitted inspection receipt');
        const viewport=c.viewport, observed=c.viewport_observation;
        if (!Number.isInteger(viewport?.width) || viewport.width<1 || !Number.isInteger(viewport?.height) || viewport.height<1) errors.push('prototype CSS viewport invalid');
        const evidence=artifact(observed,ctx,errors);
        if(!observed || !ctx.verifySupport?.(observed) || observed?.operation_id!==c.operation_id || observed?.source_url!==c.source_url) errors.push('viewport observation has no matching admitted inspection receipt');
        if(evidence) {
          try {
            const v=JSON.parse(evidence.toString('utf8'));
            if(v.kind!=='pulse-creative-viewport-observation'||v.schema_version!==ctx.creative_version||v.brief_id!==ctx.brief.id||v.actor!=='root'||!text(v.observed_at)||!Number.isFinite(Date.parse(v.observed_at))||v.source_url!==c.source_url||v.capture?.path!==c.path||v.capture?.sha256!==c.sha256||v.viewport?.width!==viewport?.width||v.viewport?.height!==viewport?.height) errors.push('viewport observation stale or unbound');
          } catch { errors.push('viewport observation is not JSON'); }
        }
        if (bytes) {
          try {
            const size = imageSize(bytes);
            if (size.width !== c.width || size.height !== c.height) errors.push('prototype capture dimensions differ');
          } catch(e) { errors.push(e.message); }
        }
      }
      if (!text(row.visual_critique) || !text(row.ux_critique)) errors.push('separate visual/UX critique missing');
    }
  }
  if (dirs.some(d => !seen.has(d.id))) errors.push('direction not evaluated');
  if (data?.actor !== 'root') errors.push('maker output cannot supply owner evaluation');
  return { ...result(errors), required_failures: failures };
}

export function validateSelection(data, directions, ctx) {
  const errors = [];
  if (!data) return { ok: true, errors: [], status: 'awaiting-user' };
  identity(data, 'pulse-creative-selection', ctx, errors);
  if (data.actor !== 'user' || data.source !== 'user-conversation' || !text(data.dialogue_reference) || !text(data.verbatim) || !['retain','combine','reject-all'].includes(data.decision)) errors.push('user selection provenance missing');
  const ids = new Set((directions?.directions || []).map(d => d.id));
  if (data.decision !== 'reject-all' && (!list(data.direction_ids) || data.direction_ids.some(x => !ids.has(x)) || new Set(data.direction_ids).size !== data.direction_ids.length)) errors.push('selection unresolved');
  if (data.decision === 'retain' && data.direction_ids?.length !== 1 || data.decision === 'combine' && data.direction_ids?.length < 2) errors.push('selection cardinality invalid');
  return { ...result(errors), status: errors.length ? 'invalid-evidence' : data.decision === 'reject-all' ? 'preserve' : 'selected' };
}

export function validateLearning(data, ctx) {
  const errors = []; identity(data, 'pulse-creative-learning-proposals', ctx, errors);
  if (!Array.isArray(data?.proposals)) errors.push('learning proposals must be an array (empty preserve allowed)');
  for (const p of data?.proposals || []) {
    if (!safeId(p.id) || !text(p.observation) || !text(p.applicability) || !list(p.counterexamples) || p.counterexamples.some(x => !text(x)) || !list(p.evidence)) errors.push('learning lacks context/counterexamples/evidence');
    for (const ref of p.evidence || []) artifact(ref, ctx, errors);
    if (p.active_skill_changed || p.certified) errors.push('pilot cannot certify or silently mutate guidance');
  }
  return result(errors);
}

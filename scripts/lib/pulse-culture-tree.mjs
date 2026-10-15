import {objectDigest, sha256} from './pulse-skill-evidence.mjs';

const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const text=v=>typeof v==='string'&&v.trim().length>0;
const id=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(v);
const array=v=>Array.isArray(v)?v:[];
const kinds=new Set(['context','scene','practice','work','process']);
const relations=new Set(['documented-influence','observed-affinity','shared-technique','documented-opposition','hypothesis']);
const inspected=r=>r?.depth==='deep'&&r.access==='inspected';
const work=r=>inspected(r)&&['work','project','screen','flow'].includes(r.inspection_scope);
function closed(v,keys) { return object(v)&&Object.keys(v).every(k=>keys.includes(k))&&keys.every(k=>Object.hasOwn(v,k)); }
function pathTo(nodes,tip) {
  const result=[],seen=new Set();let n=nodes.get(tip);
  while(n&&!seen.has(n.id)){seen.add(n.id);result.push(n);n=nodes.get(n.parent_id);}
  return result.reverse();
}
function maps(data) {
  const tree=data?.cultural_tree;
  return {tree,nodes:new Map(array(tree?.nodes).filter(object).map(n=>[n.id,n])),refs:new Map(array(data?.references).filter(object).map(r=>[r.id,r])),branches:new Map(array(tree?.branches).filter(object).map(b=>[b.id,b]))};
}

// The context is supplied by the verified session, never by research JSON.
export function validateCulturalTree(data,review,ctx) {
  const errors=[],{tree,nodes,refs,branches}=maps(data),fail=m=>errors.push('culture: '+m);
  if(ctx?.creative_version!=='1.1')fail('verified creative version 1.1 required');
  if(!closed(tree,['question','root_id','nodes','links','branches','rebounds'])||!text(tree?.question)||!id(tree?.root_id)||!Array.isArray(tree?.nodes)||!Array.isArray(tree?.links)||!Array.isArray(tree?.branches)||!Array.isArray(tree?.rebounds))fail('tree fields invalid');
  const root=nodes.get(tree?.root_id),seenNodes=new Set(),seenKinds=new Set();
  if(!root||root.parent_id!==null)fail('unique parentless root required');
  for(const n of array(tree?.nodes)) {
    if(!closed(n,['id','kind','label','parent_id','reference_ids'])||!id(n?.id)||seenNodes.has(n.id)||!kinds.has(n.kind)||!text(n.label)||!Array.isArray(n.reference_ids)){fail('node invalid/duplicate');continue;}
    seenNodes.add(n.id);seenKinds.add(n.kind);
    if(n.id!==tree.root_id&&(!id(n.parent_id)||!nodes.has(n.parent_id)))fail('parent missing');
    if(new Set(n.reference_ids).size!==n.reference_ids.length||n.reference_ids.some(r=>!refs.has(r)))fail('node reference unresolved/duplicate');
    const seen=new Set();let p=n;
    while(p){if(seen.has(p.id)){fail('parent cycle');break;}seen.add(p.id);if(p.parent_id===null){if(p.id!==tree.root_id)fail('disconnected parentless node');break;}p=nodes.get(p.parent_id);}
    if(!p)fail('node not reachable from root');
  }
  if([...kinds].some(k=>!seenKinds.has(k)))fail('context, scene, practice, work and process roles required');
  const qualified=new Map(),linkKeys=new Set();
  function support(referenceId,supportId) {
    const r=refs.get(referenceId),s=array(r?.supports).find(s=>s?.id===supportId);
    return inspected(r)&&s&&ctx?.verifySupport?.(s)===true?{ref:r,support:s}:null;
  }
  for(const l of array(tree?.links)) {
    if(!closed(l,['from','to','relation','rationale','evidence'])||!nodes.has(l?.from)||!nodes.has(l?.to)||l.from===l.to||!relations.has(l.relation)||!text(l.rationale)||!Array.isArray(l.evidence)){fail('qualified link invalid');continue;}
    const key=`${l.from}\0${l.to}\0${l.relation}`;
    if(linkKeys.has(key))fail('duplicate qualified link');linkKeys.add(key);
    let positive=0;
    for(const e of l.evidence){if(!closed(e,['reference_id','support_id'])||!support(e.reference_id,e.support_id))fail('link inspection evidence unresolved');else positive++;}
    if(l.relation!=='hypothesis'&&!positive)fail('affirmative relation lacks inspected support');
    const pair=`${l.from}\0${l.to}`,entry=qualified.get(pair)??{positive:false};entry.positive||=l.relation!=='hypothesis'&&positive>0;qualified.set(pair,entry);
  }
  for(const n of nodes.values())if(n.id!==tree?.root_id&&!qualified.has(`${n.parent_id}\0${n.id}`))fail('parent has no qualified link');
  const seenBranches=new Set();
  for(const b of array(tree?.branches)) {
    if(!closed(b,['id','tip_id','role','question','discovery','disposition','reason','challenges','outcome'])||!id(b?.id)||seenBranches.has(b.id)||!nodes.has(b.tip_id)||!['lead','counterpoint','exploratory'].includes(b.role)||!['retain','abandon','open'].includes(b.disposition)||!['question','discovery','reason'].every(k=>text(b[k]))||!Array.isArray(b.challenges)){fail('branch fields invalid/duplicate');continue;}
    seenBranches.add(b.id);
    if(!closed(b.outcome,['effect','before','after','target_need','rationale'])||!['confirmed','changed','discarded'].includes(b.outcome?.effect)||!['before','after','target_need','rationale'].every(k=>text(b.outcome[k])))fail('branch outcome missing');
    if(new Set(b.challenges).size!==b.challenges.length||b.challenges.some(x=>!branches.has(x)||x===b.id))fail('branch challenges unresolved');
    const lineage=pathTo(nodes,b.tip_id);
    if(b.disposition==='retain'&&!lineage.slice(1).some((n,i)=>qualified.get(`${lineage[i].id}\0${n.id}`)?.positive))fail('hypothesis-only retained branch');
  }
  const ops=new Map(array(ctx?.operations).filter(object).map(o=>[o.operation_id,o])),chains=[],usedSearch=new Set();
  const admissible=o=>o?.brief_id===ctx?.brief?.id&&o.resource==='tool'&&['research','inspection','critique'].includes(o.phase)&&o.outcome==='success'&&Number.isInteger(o.reserve_index)&&Number.isInteger(o.finish_index)&&o.reserve_index<o.finish_index;
  const receiptHas=(o,a)=>array(o?.artifacts).some(x=>x?.path===a?.path&&x.sha256===a.sha256);
  for(const r of array(tree?.rebounds)) {
    try {
      if(!closed(r,['branch_id','from_node_id','to_node_id','trigger_support_id','search_operation_id','search_result']))throw Error('rebound fields invalid');
      const branch=branches.get(r.branch_id),from=nodes.get(r.from_node_id),to=nodes.get(r.to_node_id),query=ops.get(r.search_operation_id),lineage=pathTo(nodes,branch?.tip_id);
      if(!branch||branch.role!=='lead'||!from||!to||from.kind!=='work'||to.kind!=='work'||from.id===to.id||!lineage.some(n=>n.id===from.id)||!lineage.some(n=>n.id===to.id))throw Error('rebound works not on lead branch');
      if(usedSearch.has(r.search_operation_id))throw Error('search operation reused');usedSearch.add(r.search_operation_id);
      if(!admissible(query)||!text(query.request?.question))throw Error('sealed search question missing');
      const trigger=query.request?.rebound_from;
      if(!closed(trigger,['reference_id','support_id'])||trigger.support_id!==r.trigger_support_id||!array(from.reference_ids).includes(trigger.reference_id))throw Error('trigger differs from sealed reference/support pair');
      const found=support(trigger.reference_id,trigger.support_id);
      if(!found||!work(found.ref))throw Error('trigger work not inspected');
      const first=ops.get(found.support.operation_id);
      if(!admissible(first)||!receiptHas(first,found.support)||!array(first.request?.source_urls).includes(found.ref.url))throw Error('trigger inspection not admitted');
      const result=r.search_result;
      if(!closed(result,['path','sha256'])||typeof result.path!=='string'||!/^sha256:[a-f0-9]{64}$/.test(result.sha256)||!receiptHas(query,result))throw Error('search result not sealed');
      const bytes=ctx.read(result.path);if(sha256(bytes)!==result.sha256)throw Error('search result changed');
      const targets=array(to.reference_ids).map(x=>refs.get(x)).filter(work).flatMap(ref=>array(ref.supports).filter(s=>ctx.verifySupport?.(s)===true).map(s=>({ref,s,op:ops.get(s.operation_id)}))).filter(x=>admissible(x.op)&&receiptHas(x.op,x.s)&&array(x.op.request?.source_urls).includes(x.ref.url)&&bytes.toString('utf8').includes(x.ref.url));
      const arrivals=[...new Map(targets.map(t=>[`${t.ref.id}\0${t.op.operation_id}`,t])).values()];
      if(arrivals.length!==1)throw Error('arrival inspection absent or ambiguous');
      const target=arrivals[0],distinct=new Set([first.operation_id,query.operation_id,target.op.operation_id]);
      if(distinct.size!==3||!(first.finish_index<query.reserve_index&&query.finish_index<target.op.reserve_index))throw Error('inspection/search/inspection event order invalid');
      if(found.ref.origin_id===target.ref.origin_id)throw Error('rebound origin reused');
      chains.push({branch_id:branch.id,from:found.ref,to:target.ref});
    }catch(e){fail(e.message);}
  }
  const validLeads=new Map();
  for(const c of chains){const b=branches.get(c.branch_id);if(b?.disposition!=='open'&&!validLeads.has(c.branch_id))validLeads.set(c.branch_id,c);}
  const leadRows=[...validLeads.values()];
  if(leadRows.length<2)fail('two closed causal lead branches required');
  if(leadRows.length>=2){const origins=leadRows.flatMap(c=>[c.from.origin_id,c.to.origin_id]);if(new Set(origins).size!==origins.length)fail('lead triggers/results duplicate inspected origins');}
  const countedOrigins=new Set(leadRows.flatMap(c=>[c.from.origin_id,c.to.origin_id]));
  const counterpoints=[...branches.values()].filter(b=>b.role==='counterpoint'&&b.disposition!=='open'&&array(b.challenges).some(id=>validLeads.has(id))&&pathTo(nodes,b.tip_id).filter(n=>n.kind==='work').flatMap(n=>array(n.reference_ids).map(id=>refs.get(id))).some(r=>work(r)&&!countedOrigins.has(r.origin_id)&&array(r.supports).some(s=>ctx.verifySupport?.(s)===true)));
  if(!counterpoints.length)fail('distinct inspected counterpoint and challenged lead required');
  const structure_ok=errors.length===0,required=[...validLeads.keys(),...counterpoints.map(b=>b.id)];
  let status='pass';
  if(!review)status='missing';
  else if(review.research_digest!==objectDigest(data))status='stale';
  else if(data?.status==='partial'||review.verdict==='partial')status='partial';
  else if(review.kind!=='pulse-creative-research-review'||review.schema_version!=='1.1'||review.brief_id!==ctx?.brief?.id||review.actor!=='root'||review.verdict!=='pass'||!array(review.reasons).length||array(review.reasons).some(r=>!text(r))||!Array.isArray(review.branch_findings)||new Set(array(review.branch_findings).map(x=>x?.branch_id)).size!==array(review.branch_findings).length||array(review.branch_findings).some(f=>!closed(f,['branch_id','reason'])||!branches.has(f.branch_id)||!text(f.reason))||required.some(id=>!review.branch_findings.some(f=>f?.branch_id===id)))status='revise';
  if(status!=='pass')errors.push('culture: root substance review '+status);
  return {ok:errors.length===0,errors,structure_ok,causal_branches:[...validLeads.keys()],counterpoints:counterpoints.map(b=>b.id),substance_review:{status,authority:'declared root findings; not automatic cultural certification'},promotion_eligible:false};
}

export function validateCulturalDirections(directions,research) {
  const {nodes,refs,branches}=maps(research),errors=[];
  for(const d of array(directions?.directions)) {
    let matched=false;
    for(const t of array(d?.transformations)) {
      if(!object(t)||!Object.hasOwn(t,'branch_id'))continue;
      const b=branches.get(t.branch_id),r=refs.get(t.reference_id),onPath=b&&pathTo(nodes,b.tip_id).some(n=>array(n.reference_ids).includes(t.reference_id));
      if(!b||b.disposition!=='retain'||!work(r)||!onPath)errors.push('culture: transformation branch/reference not retained and inspected');
      else matched=true;
    }
    if(!matched)errors.push('culture: direction lacks a retained cultural transformation');
  }
  return errors;
}

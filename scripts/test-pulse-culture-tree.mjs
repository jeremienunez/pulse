import test from 'node:test';
import assert from 'node:assert/strict';
import {sha256, objectDigest} from './lib/pulse-skill-evidence.mjs';
import {validateCulturalTree, validateCulturalDirections} from './lib/pulse-culture-tree.mjs';

function fixture() {
  const files=new Map(), operations=[], refs=[];
  for(let i=1;i<=6;i++) {
    const url=`https://source${i}.invalid/work`,data=Buffer.from(`Inspected fixture work ${i}`),p=`PV1/support-${i}.txt`;
    files.set(p,data);
    refs.push({id:`R${i}`,origin_id:`origin-${i}`,url,depth:'deep',access:'inspected',inspection_scope:i===6?'article':'work',supports:[{id:'S',type:'text',path:p,sha256:sha256(data),source_url:url,operation_id:`I${i}`}],anchor:{support_id:'S',quote:data.toString()}});
    const order={1:0,2:4,3:6,4:10,5:12,6:14}[i];
    operations.push({operation_id:`I${i}`,brief_id:'PV1',resource:'tool',phase:'research',outcome:'success',reserve_index:order,finish_index:order+1,request:{source_urls:[url]},artifacts:[{path:p,sha256:sha256(data)}]});
  }
  for(const [id,from,to,order] of [['Q1',1,2,2],['Q2',3,4,8]]) {
    const p=`PV1/${id}.json`,b=Buffer.from(JSON.stringify({results:[{url:refs[to-1].url}]}));files.set(p,b);
    operations.push({operation_id:id,brief_id:'PV1',resource:'tool',phase:'research',outcome:'success',reserve_index:order,finish_index:order+1,request:{question:`What process explains fixture ${from}?`,source_urls:[refs[to-1].url],rebound_from:{reference_id:`R${from}`,support_id:'S'}},artifacts:[{path:p,sha256:sha256(b)}]});
  }
  const nodes=[['C','context',null,['R6']],['S1','scene','C',[]],['P1','practice','S1',[]],['W1','work','P1',['R1']],['W2','work','W1',['R2']],['X1','process','W2',[]],['S2','scene','C',[]],['P2','practice','S2',[]],['W3','work','P2',['R3']],['W4','work','W3',['R4']],['X2','process','W4',[]],['W5','work','C',['R5']]].map(([id,kind,parent_id,reference_ids])=>({id,kind,label:`Fixture ${id}`,parent_id,reference_ids}));
  const links=nodes.filter(n=>n.parent_id).map(n=>({from:n.parent_id,to:n.id,relation:'observed-affinity',rationale:'A fixture relationship for structural testing only',evidence:[{reference_id:n.reference_ids[0]??'R6',support_id:'S'}]}));
  const branch=(id,tip_id,role,challenges=[])=>({id,tip_id,role,question:'How does this relationship affect the brief?',discovery:'A fixture observation',disposition:'retain',reason:'Test the contract',challenges,outcome:{effect:'changed',before:'Uniform blocks',after:'A connected reading path',target_need:'Understand the programme',rationale:'Fixture consequence'}});
  const tree={question:'How could threading express the programme?',root_id:'C',nodes,links,branches:[branch('L1','X1','lead'),branch('L2','X2','lead'),branch('CP','W5','counterpoint',['L1'])],rebounds:[{branch_id:'L1',from_node_id:'W1',to_node_id:'W2',trigger_support_id:'S',search_operation_id:'Q1',search_result:{path:'PV1/Q1.json',sha256:sha256(files.get('PV1/Q1.json'))}},{branch_id:'L2',from_node_id:'W3',to_node_id:'W4',trigger_support_id:'S',search_operation_id:'Q2',search_result:{path:'PV1/Q2.json',sha256:sha256(files.get('PV1/Q2.json'))}}]};
  const data={schema_version:'1.1',status:'complete',references:refs,cultural_tree:tree};
  const review={kind:'pulse-creative-research-review',schema_version:'1.1',brief_id:'PV1',actor:'root',research_digest:objectDigest(data),verdict:'pass',reasons:['Fixture only'],branch_findings:tree.branches.map(b=>({branch_id:b.id,reason:'Fixture evidence reviewed'}))};
  const ctx={creative_version:'1.1',brief:{id:'PV1'},operations,read:p=>{assert(files.has(p));return files.get(p);},verifySupport:s=>operations.some(o=>o.operation_id===s.operation_id&&o.artifacts.some(a=>a.path===s.path&&a.sha256===s.sha256))};
  return {data,review,ctx,files};
}
const refresh=f=>{f.review.research_digest=objectDigest(f.data);return f;};

test('two admitted causal branches, distinct works and counterpoint are structurally valid',()=>{
  const f=fixture(),r=validateCulturalTree(f.data,f.review,f.ctx);assert.deepEqual(r.errors,[]);assert.equal(r.structure_ok,true);assert.equal(r.substance_review.status,'pass');assert.equal(r.promotion_eligible,false);
});
test('decorative tree, disconnected parent, missing counterpoint and unknown fields fail closed',()=>{
  for(const mutate of [f=>delete f.data.cultural_tree,f=>f.data.cultural_tree.nodes[1].parent_id='missing',f=>f.data.cultural_tree.nodes[0].parent_id='X1',f=>f.data.cultural_tree.branches.pop(),f=>f.data.cultural_tree.fake=true]){const f=fixture();mutate(f);refresh(f);assert.equal(validateCulturalTree(f.data,f.review,f.ctx).ok,false);}
});
test('rebound order uses event positions and rejects preplanned or reused operations',()=>{
  for(const mutate of [f=>f.ctx.operations.find(o=>o.operation_id==='Q1').reserve_index=0,f=>f.ctx.operations.find(o=>o.operation_id==='I2').reserve_index=2,f=>f.data.cultural_tree.rebounds[1].search_operation_id='Q1',f=>delete f.ctx.operations.find(o=>o.operation_id==='Q1').request.rebound_from]){const f=fixture();mutate(f);refresh(f);assert.equal(validateCulturalTree(f.data,f.review,f.ctx).ok,false);}
});
test('local support IDs resolve through the exact reference and sealed request',()=>{
  const f=fixture();assert.equal(validateCulturalTree(f.data,f.review,f.ctx).ok,true);f.ctx.operations.find(o=>o.operation_id==='Q1').request.rebound_from.reference_id='R3';assert.equal(validateCulturalTree(f.data,f.review,f.ctx).ok,false);
});
test('multiple supports of one arrival inspection count once; independent arrivals remain ambiguous',()=>{
  const f=fixture(),ref=f.data.references[1],first=ref.supports[0],p='PV1/support-2-detail.txt',b=Buffer.from('Second inspected detail of fixture work2');
  f.files.set(p,b);const second={...first,id:'S-detail',path:p,sha256:sha256(b)};ref.supports.push(second);f.ctx.operations.find(o=>o.operation_id==='I2').artifacts.push({path:p,sha256:second.sha256});refresh(f);
  assert.equal(validateCulturalTree(f.data,f.review,f.ctx).ok,true);
  const another={...f.ctx.operations.find(o=>o.operation_id==='I2'),operation_id:'I2-independent',reserve_index:16,finish_index:17,artifacts:[{path:p,sha256:second.sha256}]};f.ctx.operations.push(another);second.operation_id=another.operation_id;refresh(f);
  assert.equal(validateCulturalTree(f.data,f.review,f.ctx).ok,false);
});
test('altered result, absent target URL and duplicated cultural chains cannot count',()=>{
  for(const mutate of [f=>f.files.set('PV1/Q1.json',Buffer.from('changed')),f=>{const q=f.ctx.operations.find(o=>o.operation_id==='Q1'),p='PV1/Q1.json',b=Buffer.from('{}');f.files.set(p,b);q.artifacts[0].sha256=sha256(b);f.data.cultural_tree.rebounds[0].search_result.sha256=sha256(b);},f=>{f.data.cultural_tree.rebounds[1]={...f.data.cultural_tree.rebounds[0],branch_id:'L2'};}]){const f=fixture();mutate(f);refresh(f);assert.equal(validateCulturalTree(f.data,f.review,f.ctx).ok,false);}
});
test('root substance review is separately missing, stale or revise without certifying culture',()=>{
  const f=fixture();let r=validateCulturalTree(f.data,null,f.ctx);assert.equal(r.structure_ok,true);assert.equal(r.substance_review.status,'missing');assert.equal(r.ok,false);
  f.data.cultural_tree.question+=' changed';r=validateCulturalTree(f.data,f.review,f.ctx);assert.equal(r.substance_review.status,'stale');refresh(f);f.review.verdict='revise';assert.equal(validateCulturalTree(f.data,f.review,f.ctx).substance_review.status,'revise');
});
test('version, unresolved affirmative proof and hypothesis-only retained branch are rejected',()=>{
  for(const mutate of [f=>f.ctx.creative_version='1.0',f=>f.data.cultural_tree.links[0].evidence[0].support_id='missing',f=>f.data.cultural_tree.links.forEach(l=>l.relation='hypothesis')]){const f=fixture();mutate(f);refresh(f);assert.equal(validateCulturalTree(f.data,f.review,f.ctx).ok,false);}
});
test('direction transformation names a retained branch and its inspected reference',()=>{
  const f=fixture(),dirs={directions:[{id:'D1',transformations:[{branch_id:'L1',reference_id:'R2'}]}]};assert.deepEqual(validateCulturalDirections(dirs,f.data),[]);
  dirs.directions[0].transformations[0].reference_id='R4';assert.notDeepEqual(validateCulturalDirections(dirs,f.data),[]);dirs.directions[0].transformations[0].reference_id='R2';f.data.cultural_tree.branches[0].disposition='abandon';assert.notDeepEqual(validateCulturalDirections(dirs,f.data),[]);
});

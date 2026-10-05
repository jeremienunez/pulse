import test from 'node:test';
import assert from 'node:assert/strict';
import {objectDigest,sha256} from './lib/pulse-skill-evidence.mjs';
import {validatePolicy,validateResearch,validateDirections,validateEvaluation,validateSelection,validateLearning,imageSize} from './lib/pulse-creative-evidence.mjs';

const policy={kind:'pulse-creative-pilot-policy',schema_version:'1.0',paid_tools:false,budget:{research_active_ms_per_brief:1000,global_active_ms:10000,max_candidates_per_brief:15,max_deep_refs_per_brief:8,min_deep_refs_per_ensemble:2,max_directions_per_brief:3,max_correction_rounds_per_brief:2,max_native_tasks:16,max_tool_actions:160,additional_external_spend_eur:0},viewports:[{width:1,height:1}]};
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aH0cAAAAASUVORK5CYII=','base64');
function fixture(){
  const files=new Map(),ctx={brief:{id:'CV1',terrain:'visual',criteria:[{id:'C1',required:true}]},policy,manifest_digest:'fixture-digest',verifySupport:()=>true,read:p=>{assert(files.has(p),'absent support');return files.get(p);}};
  const art=(path,b)=>{files.set(path,Buffer.from(b));return {path,sha256:sha256(b)};};
  const refs=['peers','contemporary','culture'].flatMap((ensemble,j)=>[1,2].map(i=>{
    const id=`R${j}${i}`, url=`https://example.invalid/${id}`,s={id:'S',type:'text',source_url:url,observed_at:'2026-10-04T00:00:00Z',...art(`CV1/${id}.txt`,'Observed structure '+id)};
    return {id,origin_id:id,url,title:id,ensemble,depth:'deep',access:'inspected',inspection_scope:'article',collected_at:'2026-10-04T00:00:00Z',observation:'Observed structure',mechanism_hypothesis:'Interpreted mechanism',boundary:'Specific brief',transformation:'A situated change',supports:[s],anchor:{support_id:'S',quote:'Observed structure'}};
  }));
  const research={kind:'pulse-creative-research',schema_version:'1.0',brief_id:'CV1',manifest_digest:ctx.manifest_digest,status:'complete',references:refs};
  const review=()=>({kind:'pulse-creative-research-review',brief_id:'CV1',research_digest:objectDigest(research),actor:'root',verdict:'pass',reasons:['Synthetic fixture, not a real source read.']});
  const directions={kind:'pulse-creative-directions',schema_version:'1.0',brief_id:'CV1',manifest_digest:ctx.manifest_digest,review:{actor:'root',verdict:'pass',reasons:['Distinct structural choices']},directions:[1,2].map(i=>({id:`D${i}`,title:'Direction '+i,intent:'Situated intention',structure:{composition:'Structure '+i,interaction:'Interaction '+i},transformations:[{reference_id:'R01',principle:'Structure',change:'Transposition',target_need:'Reading'}],prototype_files:[art(`CV1/D${i}.html`,'<h1>fixture '+i+'</h1>')],moodboard_files:[art(`CV1/D${i}-board.txt`,'Reference rationale')]}))};
  const capture=id=>{
    const url=`https://example.invalid/${id}.html`,operation_id=`inspect-${id}`,image={...art(`CV1/${id}.png`,png),width:1,height:1,viewport:{width:1,height:1},source_url:url,operation_id};
    image.viewport_observation={...art(`CV1/${id}-viewport.json`,JSON.stringify({kind:'pulse-creative-viewport-observation',schema_version:'1.0',brief_id:'CV1',actor:'root',observed_at:'2026-10-04T00:00:00Z',source_url:url,viewport:{width:1,height:1},capture:{path:image.path,sha256:image.sha256}})),source_url:url,operation_id};return image;
  };
  const evaluation={kind:'pulse-creative-evaluation',schema_version:'1.0',brief_id:'CV1',manifest_digest:ctx.manifest_digest,actor:'root',directions:directions.directions.map(d=>({direction_id:d.id,visual_critique:'Fixture only',ux_critique:'Fixture only',captures:[capture(d.id)],criterion_results:[{criterion_id:'C1',verdict:'pass',reason:'Observed synthetic check',evidence:[art(`CV1/${d.id}-check.txt`,'check passed')]}]}))};
  return {ctx,files,art,research,review,directions,evaluation};
}
test('bounded policy refuses impossible coverage and new spending',()=>{assert(validatePolicy(policy).ok);for(const change of [{additional_external_spend_eur:1},{max_deep_refs_per_brief:4},{max_native_tasks:17}])assert(!validatePolicy({...policy,budget:{...policy.budget,...change}}).ok);});
test('research needs inspected origins, anchored content and independent current review',()=>{
  const f=fixture();assert(validateResearch(f.research,f.review(),f.ctx).ok);
  f.research.references[0].observation='';assert(!validateResearch(f.research,f.review(),f.ctx).ok);
  f.research.references[0].observation='Observed';f.research.references[0].anchor.quote='Invented quote';assert(!validateResearch(f.research,f.review(),f.ctx).ok);
});
test('duplicates, missing ensembles, changed support and interaction from a single frame fail',()=>{
  for(const mutate of [f=>f.research.references[1].origin_id='R01',f=>f.research.references.pop(),f=>f.files.set('CV1/R01.txt',Buffer.from('changed')),f=>{f.research.references[0].claims_interaction=true;f.research.references[0].sequence=['S'];},f=>f.research.references[0].inspection_scope='portal']){
    const f=fixture();mutate(f);assert(!validateResearch(f.research,f.review(),f.ctx).ok);
  }
});
test('wrong shape and blank tested-style objects never become complete research',()=>{const f=fixture();assert(!validateResearch({kind:'pulse-creative-research'},null,f.ctx).ok);assert(!validateDirections(null,f.research,f.ctx).ok);assert(!validateLearning(null,f.ctx).ok);});
test('directions must transform resolved references and differ structurally',()=>{const f=fixture();assert(validateDirections(f.directions,f.research,f.ctx).ok);f.directions.directions[1].structure={...f.directions.directions[0].structure};f.directions.directions[1].palette='other';assert(!validateDirections(f.directions,f.research,f.ctx).ok);});
test('evaluation binds criteria, captures, actual bytes and owner role',()=>{const f=fixture();assert(validateEvaluation(f.evaluation,f.directions,f.ctx).ok);f.evaluation.directions[0].criterion_results[0].verdict='fail';assert.equal(validateEvaluation(f.evaluation,f.directions,f.ctx).required_failures,1);f.evaluation.actor='maker';assert(!validateEvaluation(f.evaluation,f.directions,f.ctx).ok);});
test('a maker cannot invent human preference; lack of choice is awaiting-user',()=>{const f=fixture();assert.equal(validateSelection(null,f.directions,f.ctx).status,'awaiting-user');assert(!validateSelection({kind:'pulse-creative-selection',actor:'maker'},f.directions,f.ctx).ok);});
test('image dimensions are read from bytes, not claims; invalid media rejected',()=>{assert.deepEqual(imageSize(png),{width:1,height:1});assert.throws(()=>imageSize(Buffer.from('not image')));});

function resizeFixture(f,width,height,viewportWidth,viewportHeight){
  f.ctx.policy={...policy,viewports:[{width:viewportWidth,height:viewportHeight}]};
  for(const row of f.evaluation.directions){
    const c=row.captures[0],b=Buffer.from(png);b.writeUInt32BE(width,16);b.writeUInt32BE(height,20);Object.assign(c,f.art(c.path,b),{width,height,viewport:{width:viewportWidth,height:viewportHeight}});
    const observation=JSON.parse(f.files.get(c.viewport_observation.path));observation.viewport={...c.viewport};observation.capture={path:c.path,sha256:c.sha256};Object.assign(c.viewport_observation,f.art(c.viewport_observation.path,JSON.stringify(observation)));
  }
}
test('CSS viewport can differ from capture raster, with an admitted bound viewport observation',()=>{
  const f=fixture();resizeFixture(f,375,812,390,844);assert(validateEvaluation(f.evaluation,f.directions,f.ctx).ok);
  resizeFixture(f,780,1688,390,844);assert(validateEvaluation(f.evaluation,f.directions,f.ctx).ok);
  resizeFixture(f,375,844,390,844);assert(validateEvaluation(f.evaluation,f.directions,f.ctx).ok);
});
test('raster bytes still bind independently from the CSS viewport',()=>{
  const f=fixture();f.evaluation.directions[0].captures[0].width=2;assert(!validateEvaluation(f.evaluation,f.directions,f.ctx).ok);
  const g=fixture();resizeFixture(g,375,844,390,844);g.evaluation.directions[0].captures[0].height=812;assert(!validateEvaluation(g.evaluation,g.directions,g.ctx).ok);
});
test('viewport claims need fresh same-capture same-operation evidence, not requested dimensions',()=>{
  for(const mutate of [f=>delete f.evaluation.directions[0].captures[0].viewport_observation,f=>{const c=f.evaluation.directions[0].captures[0];c.viewport_observation.operation_id='different';},f=>{const c=f.evaluation.directions[0].captures[0];const v=JSON.parse(f.files.get(c.viewport_observation.path));v.capture.path='CV1/other.png';Object.assign(c.viewport_observation,f.art(c.viewport_observation.path,JSON.stringify(v)));},f=>{const c=f.evaluation.directions[0].captures[0];c.viewport.width=2;}]){const f=fixture();f.ctx.verifySupport=r=>{assert(r,'context cannot verify absent references');return true;};mutate(f);assert(!validateEvaluation(f.evaluation,f.directions,f.ctx).ok);}
});

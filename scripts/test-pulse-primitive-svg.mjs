import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {initIcmRun} from '../skills/using-pulse/scripts/pulse_icm.mjs';
import {prepareCreativeSession,recordCreativeEvent,creativeStatus} from './lib/pulse-creative-session.mjs';
import {sha256,conditionFromFiles} from './lib/pulse-skill-evidence.mjs';
import {PRIMITIVE_COMMIT,inspectPrimitiveProfile,runPrimitiveSvg} from './lib/pulse-primitive-svg.mjs';

const CLI=fileURLToPath(new URL('./pulse-primitive-svg.mjs',import.meta.url));
const CHECKER=fileURLToPath(new URL('./lib/pulse-primitive-svg-check.py',import.meta.url));
const compiled={'github.com/fogleman/gg':'v1.3.0','github.com/golang/freetype':'v0.0.0-20170609003504-e2365dfdc4a0','github.com/nfnt/resize':'v0.0.0-20180221191011-83c6a9932646','golang.org/x/image':'v0.23.0'};
function svg(n=1) {return `<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="64" height="64"><rect x="0" y="0" width="64" height="64" fill="#abcdef"/><g transform="scale(1) translate(0.5 0.5)">${'<polygon fill="#123456" fill-opacity="0.5" points="5,5 30,5 12,30"/>'.repeat(n)}</g></svg>`;}
function fixture(t,behavior='success') {
  const owner=fs.mkdtempSync(path.join(os.tmpdir(),'pulse-primitive-contract-'));t.after(()=>fs.rmSync(owner,{recursive:true,force:true}));
  initIcmRun(owner,'fixture','Controlled executable fixtures, not an upstream conversion.');
  const base=path.join(owner,'history/fixture/stages/02_plan/output'),policy={kind:'pulse-creative-pilot-policy',schema_version:'1.0',paid_tools:false,budget:{research_active_ms_per_brief:300000,global_active_ms:1200000,max_candidates_per_brief:6,max_deep_refs_per_brief:6,min_deep_refs_per_ensemble:2,max_directions_per_brief:3,max_correction_rounds_per_brief:1,max_native_tasks:1,max_tool_actions:18,additional_external_spend_eur:0},viewports:[{width:64,height:64}]};
  let plan='Owned test assets\n';
  for(const [name,value] of Object.entries({'pilot-policy.json':policy,'pilot-briefs.json':{cases:[{id:'NA1',terrain:'nonactivation',criteria:[{id:'SCOPE',required:true,expectation:'Technical probe only.'}]}]},'pressure-corpus.json':{cases:[]}})) {const body=JSON.stringify(value);fs.writeFileSync(path.join(base,name),body);plan+=sha256(body)+'\n';}
  fs.writeFileSync(path.join(base,'plan.md'),plan);fs.writeFileSync(path.join(owner,'gate.md'),'Test gate');
  const runFile='history/fixture/run.json',run=JSON.parse(fs.readFileSync(path.join(owner,runFile)));run.current_stage='04_execute';run.execution.approved_strategy='single-worker';
  for(const g of ['GATE_1','GATE_2','GATE_3'])run.gates[g]={status:'approved',artifacts:[{path:g==='GATE_2'?'history/fixture/stages/02_plan/output/plan.md':'gate.md',sha256:sha256(g==='GATE_2'?plan:'Test gate').slice(7)}]};
  fs.writeFileSync(path.join(owner,runFile),JSON.stringify(run));
  const condition=conditionFromFiles('skills/using-pulse/SKILL.md',[{path:'skills/using-pulse/SKILL.md',content:'# Fixture condition'}]);
  const root=prepareCreativeSession({owner,run_file:runFile,condition,execution_kind:'fixture'}).root;
  fs.mkdirSync(path.join(root,'global'));const input=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(input);input.writeUInt32BE(64,16);input.writeUInt32BE(64,20);fs.writeFileSync(path.join(root,'global/input.png'),input);
  // Explicit trusted test transport simulates a process; never proves sandbox/upstream behavior.
  const fake=path.join(owner,'fixture-bwrap'),mode=path.join(owner,'fixture-mode'),counter=path.join(owner,'fixture-launches');
  fs.writeFileSync(mode,behavior);
  fs.writeFileSync(fake,`#!/usr/bin/python3
import sys,time,os
from pathlib import Path
root=Path(__file__).parent
with (root/'fixture-launches').open('a') as f:f.write('launch\\n')
args=sys.argv[1:]
work=Path(args[args.index('--bind')+1])
mode=(root/'fixture-mode').read_text()
if mode=='sleep':time.sleep(5)
if mode=='child':
 pid=os.fork()
 if pid==0:time.sleep(5);os._exit(0)
 time.sleep(5)
if mode=='error':sys.exit(7)
if mode=='logs':sys.stdout.write('x'*1000000);sys.stdout.flush();time.sleep(1)
if mode=='stderr':sys.stderr.write('x'*1000000);sys.stderr.flush();time.sleep(1)
n=int(args[args.index('-n')+1])
out=${JSON.stringify(svg())}
if n!=1:out=out.replace(${JSON.stringify('<polygon fill="#123456" fill-opacity="0.5" points="5,5 30,5 12,30"/>')},${JSON.stringify('<polygon fill="#123456" fill-opacity="0.5" points="5,5 30,5 12,30"/>')}*n)
if mode=='active':out=out.replace('</g>','<script>alert(1)</script></g>')
if mode=='oversize':out='x'*(1024*1024+1)
if mode=='missing':sys.exit(0)
if mode=='symlink':(work/'partial.svg').symlink_to(root/'gate.md');sys.exit(0)
(work/'partial.svg').write_text(out)
`,{mode:0o700});
  const binary=fs.realpathSync('/usr/bin/true'),python=fs.realpathSync('/usr/bin/python3'),manifest=path.join(owner,'build.json');
  fs.writeFileSync(manifest,JSON.stringify({kind:'pulse-primitive-local-build',schema_version:'1.0',source_commit:PRIMITIVE_COMMIT,cgo_enabled:false,binary:{path:binary,sha256:sha256(fs.readFileSync(binary)),statically_linked:true},toolchain:{version:'go version go1.27.1 linux/amd64'},compiled_modules:compiled,execution_kind:'fixture'}));
  const profile=path.join(owner,'profile.json');
  fs.writeFileSync(profile,JSON.stringify({kind:'pulse-primitive-local-profile',schema_version:'1.0',primitive:{path:binary,sha256:sha256(fs.readFileSync(binary)),source_commit:PRIMITIVE_COMMIT,build_manifest:{path:manifest,sha256:sha256(fs.readFileSync(manifest))}},bubblewrap:{path:fake,sha256:sha256(fs.readFileSync(fake)),version:'Fixture transport, no isolation claim'},python:{path:python,sha256:sha256(fs.readFileSync(python)),version:'Python test interpreter'}}));
  const job=(changes={})=>({kind:'pulse-primitive-svg-job',schema_version:'1.0',operation_id:'job1',brief_id:'global',purpose:'capability-probe',profile_sha256:sha256(fs.readFileSync(profile)),input:{path:'global/input.png',sha256:sha256(input),media_type:'image/png',rights_basis:'Controlled header fixture only.'},params:{shapes:1,mode:1,alpha:128,workers:1,resize:64,output_size:64},...changes});
  const reserve=(request=job(),event={})=>{const name='global/request.json',body=JSON.stringify(request);fs.writeFileSync(path.join(root,name),body);return recordCreativeEvent(root,{event:'reserve',operation_id:'job1',brief_id:'global',phase:'inspection',resource:'tool',units:1,request:{path:name,sha256:sha256(body)},...event});};
  return {owner,root,profile,manifest,mode,counter,input,job,reserve,launches:()=>fs.existsSync(counter)?fs.readFileSync(counter,'utf8').trim().split('\n').length:0,run:async(reserved,options)=>runPrimitiveSvg({session:root,reservation:reserved.reservation_id,profile},options),result:r=>JSON.parse(fs.readFileSync(path.join(root,r.result_path)))};
}

test('profile inspection performs no execution and reports missing or changed capability',t=>{const f=fixture(t);assert.equal(inspectPrimitiveProfile(f.profile).status,'available');assert.equal(f.launches(),0);assert.equal(inspectPrimitiveProfile(path.join(f.owner,'absent.json')).status,'unavailable');const p=JSON.parse(fs.readFileSync(f.profile));p.primitive.source_commit='untrusted';fs.writeFileSync(f.profile,JSON.stringify(p));assert.equal(inspectPrimitiveProfile(f.profile).status,'invalid');assert.equal(f.launches(),0);});
test('owned successful fixture seals snapshots, controlled argv and proposed receipt without settling owner',async t=>{const f=fixture(t),reserved=f.reserve(),r=await f.run(reserved);assert.equal(r.outcome,'success',JSON.stringify(f.result(r)));assert.equal(f.launches(),1);assert.equal(creativeStatus(f.root).pending.reservation_id,reserved.reservation_id);const result=f.result(r);assert.equal(result.processes[0].argv.includes('-rep'),true);assert.equal(result.processes.every(p=>p.process_reaped&&p.process_group_gone),true);assert.equal(r.published_svg.shape_count,1);const finish=JSON.parse(fs.readFileSync(path.join(f.root,r.finish_event_path)));for(const a of finish.artifacts)assert.equal(sha256(fs.readFileSync(path.join(f.root,a.path))),a.sha256);recordCreativeEvent(f.root,finish);assert.equal(creativeStatus(f.root).pending,null);assert.equal(creativeStatus(f.root).used.tool,1);await assert.rejects(f.run(reserved),/reservation/);});
test('reservation identity, resource, phase and owner failures cannot launch',async t=>{const f=fixture(t);await assert.rejects(f.run({reservation_id:'missing'}),/reservation/);const reserved=f.reserve();await assert.rejects(f.run({reservation_id:'foreign'}),/reservation/);assert.equal(f.launches(),0);const r=await f.run(reserved);assert.equal(r.outcome,'success');});
test('two invocations of one pending reservation have exactly one effect',async t=>{const f=fixture(t),reserved=f.reserve();const results=await Promise.allSettled([f.run(reserved),f.run(reserved)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);assert.equal(f.launches(),1);});
test('an existing output/job directory and symlink parent cannot be overwritten',async t=>{for(const type of ['directory','symlink'])await t.test(type,async tt=>{const f=fixture(tt),reserved=f.reserve();fs.mkdirSync(path.join(f.root,'global/primitive'));const job=path.join(f.root,'global/primitive/job1');if(type==='directory'){fs.mkdirSync(job);fs.writeFileSync(path.join(job,'output.svg'),'preserved');}else fs.symlinkSync(f.owner,job);await assert.rejects(f.run(reserved));assert.equal(f.launches(),0);if(type==='directory')assert.equal(fs.readFileSync(path.join(job,'output.svg'),'utf8'),'preserved');});});
test('invalid request fields, identities and parameter edges are counted without process effects',async t=>{const variants=[j=>({...j,extra:true}),j=>({...j,operation_id:'foreign'}),j=>({...j,purpose:'creative-variant'}),j=>({...j,input:{...j.input,path:'../outside.png'}}),j=>({...j,input:{...j.input,rights_basis:''}}),...Object.entries({shapes:[0,201],mode:[-1,9],alpha:[-1,256],workers:[0,3],resize:[15,257],output_size:[63,1025]}).flatMap(([key,values])=>values.map(v=>j=>({...j,params:{...j.params,[key]:v}})))];for(let i=0;i<variants.length;i++)await t.test(String(i),async tt=>{const f=fixture(tt),reserved=f.reserve(variants[i](f.job())),r=await f.run(reserved);assert.equal(r.outcome,'error');assert.equal(f.launches(),0);assert.equal(creativeStatus(f.root).used.tool,1);recordCreativeEvent(f.root,JSON.parse(fs.readFileSync(path.join(f.root,r.finish_event_path))));});});
test('changed input, dimensions, media type and symlink input refuse launch',async t=>{for(const type of ['changed','dimensions','media','symlink'])await t.test(type,async tt=>{const f=fixture(tt);let j=f.job();if(type==='dimensions'){const b=Buffer.from(f.input);b.writeUInt32BE(4097,16);fs.writeFileSync(path.join(f.root,'global/input.png'),b);j.input.sha256=sha256(b);}if(type==='media')j.input.media_type='image/jpeg';const reserved=f.reserve(j);if(type==='changed')fs.appendFileSync(path.join(f.root,'global/input.png'),'changed');if(type==='symlink'){fs.unlinkSync(path.join(f.root,'global/input.png'));fs.symlinkSync(path.join(f.owner,'gate.md'),path.join(f.root,'global/input.png'));}const r=await f.run(reserved);assert.equal(r.outcome,'error');assert.equal(f.launches(),0);});});
test('profile/binary/manifest tampering after admission fails before launch',async t=>{for(const type of ['profile','manifest','executable'])await t.test(type,async tt=>{const f=fixture(tt),reserved=f.reserve();if(type==='manifest')fs.appendFileSync(f.manifest,' ');else if(type==='executable')fs.appendFileSync(path.join(f.owner,'fixture-bwrap'),'\n');else fs.appendFileSync(f.profile,' ');const r=await f.run(reserved);assert.equal(r.outcome,'error');assert.equal(f.launches(),0);});});
test('process failure, hostile output and oversized logs never publish SVG',async t=>{for(const mode of ['error','logs','stderr','active','oversize','missing','symlink'])await t.test(mode,async tt=>{const f=fixture(tt,mode),r=await f.run(f.reserve());assert.equal(r.outcome,'error');assert.equal(r.published_svg,null);assert.equal(f.launches(),1);assert.equal(fs.existsSync(path.join(f.root,'global/primitive/job1/output.svg')),false);for(const log of ['native.stdout.log','native.stderr.log'])assert.equal(fs.statSync(path.join(f.root,'global/primitive/job1',log)).size<=65536,true);});});
test('deadline kills the process group and same attempt cannot replay',async t=>{for(const mode of ['sleep','child'])await t.test(mode,async tt=>{const f=fixture(tt,mode),reserved=f.reserve(),r=await f.run(reserved,{deadlineMs:250});assert.equal(r.outcome,'timeout');assert.equal(f.result(r).processes[0].process_group_gone,true);await assert.rejects(f.run(reserved),/EEXIST/);assert.equal(f.launches(),1);});});
test('SVG checker accepts supported exporters and rejects active, malformed and nonfinite SVG',()=>{const check=value=>spawnSync('/usr/bin/python3',['-I','-S','-B','-c',`import importlib.util,json; s=importlib.util.spec_from_file_location('checker',${JSON.stringify(CHECKER)}); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); print(json.dumps(m.validate(${JSON.stringify(value)}.encode(),1,64)))`],{encoding:'utf8'});assert.equal(check(svg()).status,0);const bad=[svg().replace('<g ','<g onclick="x" '),svg().replace('#123456','url(https://example.com/x)'),svg().replace('fill-opacity="0.5"','fill-opacity="NaN"'),svg().replace('scale(1)','scale(1e999)'),svg().replace('</g>','<foreignObject/></g>'),svg().replace('</g>','<image href="https://example.com/x"/></g>'),svg().replace('<svg','<!DOCTYPE svg [<!ENTITY x "X">]><svg'),svg().replace('5,5','NaN,5'),svg().replace(' points="5,5 30,5 12,30"',''),svg().replace('</svg>',''),svg().replace('width="64"','width="1025"'),svg().replace('fill-opacity="0.5"','fill-opacity="1.5"'),svg().replace('http://www.w3.org/2000/svg','http://invalid.test')];for(const value of bad)assert.notEqual(check(value).status,0,value);});
test('CLI requires explicit options and reports unavailable without an execution',()=>{const missing=path.join(os.tmpdir(),'missing-primitive-profile-'+process.pid+'.json');const p=spawnSync(process.execPath,[CLI,'inspect','--profile',missing],{encoding:'utf8'});assert.equal(p.status,0);assert.equal(JSON.parse(p.stdout).status,'unavailable');const malformed=spawnSync(process.execPath,[CLI,'inspect','--profile',missing,'--shell','true'],{encoding:'utf8'});assert.equal(malformed.status,1);assert.match(JSON.parse(malformed.stdout).error,/Unknown/);});

test('each supported geometric exporter validates with its required geometry',()=>{
  const polygon='<polygon fill="#123456" fill-opacity="0.5" points="5,5 30,5 12,30"/>';
  const shapes=[
    '<rect x="1" y="2" width="20" height="30" fill="#123456" fill-opacity="0.5"/>',
    '<ellipse cx="20" cy="25" rx="10" ry="6" fill="#123456" fill-opacity="0.5"/>',
    '<circle cx="20" cy="25" r="10" fill="#123456" fill-opacity="0.5"/>',
    '<g transform="translate(20 25) rotate(45) scale(20 15)"><rect x="-0.5" y="-0.5" width="1" height="1" fill="#123456" fill-opacity="0.5"/></g>',
    '<g transform="translate(20.0 25.0) rotate(45.0) scale(10.0 6.0)"><ellipse cx="0" cy="0" rx="1" ry="1" fill="#123456" fill-opacity="0.5"/></g>',
    '<path stroke="#123456" stroke-opacity="0.5" fill="none" d="M 1.000000 2.000000 Q 8.000000 9.000000, 20.000000 30.000000" stroke-width="2.000000"/>',
    '<polygon fill="#123456" fill-opacity="0.5" points="1,1 20,1 25,20 5,25"/>',
  ];
  for(const shape of shapes) {
    const value=svg().replace(polygon,shape),checked=spawnSync('/usr/bin/python3',['-I','-S','-B','-c',`import importlib.util; s=importlib.util.spec_from_file_location('checker',${JSON.stringify(CHECKER)}); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); print(m.validate(${JSON.stringify(value)}.encode(),1,64))`],{encoding:'utf8'});
    assert.equal(checked.status,0,checked.stderr);
  }
});

test('polygon coordinate lists accept the exact upstream exporter and SVG separators',()=>{
  const accepted=[
    '167.872989,89.148023,271.000000,116.913598,246.532030,168.193262,198.714130,40.189812',
    '1,1 20,1 25,20 5,25',
    '1 1 20 1 25 20 5 25',
    '1,1, 20,1 25,20,5,25',
    '.5,-1,+32,2e1,3E+1,-.5',
  ];
  for(const points of accepted) {
    const value=svg().replace('5,5 30,5 12,30',points);
    const checked=spawnSync('/usr/bin/python3',['-I','-S','-B','-c',`import importlib.util; s=importlib.util.spec_from_file_location('checker',${JSON.stringify(CHECKER)}); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); print(m.validate(${JSON.stringify(value)}.encode(),1,64))`],{encoding:'utf8'});
    assert.equal(checked.status,0,points+'\n'+checked.stdout+checked.stderr);
  }
});

test('polygon separator compatibility keeps size, numeric and active-content guards',()=>{
  const rejected=['','1,2,3,4','1,2,3,4,5,6,7','1,,2,3,4,5,6','1, ,2,3,4,5,6','1,2,3,4,5,6,',',1,2,3,4,5,6','1;2;3;4;5;6','NaN,2,3,4,5,6','1e999,2,3,4,5,6','1000001,2,3,4,5,6','1.1.1,2,3,4,5,6','url(x),2,3,4,5,6','١,2,3,4,5,6',Array.from({length:66},(_,i)=>String(i)).join(',')];
  for(const points of rejected) {
    const value=svg().replace('5,5 30,5 12,30',points);
    const checked=spawnSync('/usr/bin/python3',['-I','-S','-B','-c',`import importlib.util; s=importlib.util.spec_from_file_location('checker',${JSON.stringify(CHECKER)}); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); print(m.validate(${JSON.stringify(value)}.encode(),1,64))`],{encoding:'utf8'});
    assert.notEqual(checked.status,0,points);
  }
});

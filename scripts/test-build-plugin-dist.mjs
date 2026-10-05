#!/usr/bin/env node

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

test('extracted package carries the optional Primitive adapter without binary/cache or local inputs', () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'pulse-package-primitive-'));
  try {
    const packaged=path.join(root,'package');buildPluginDist(REPO_ROOT,packaged);
    for(const name of ['scripts/pulse-primitive-svg.mjs','scripts/lib/pulse-primitive-svg.mjs','scripts/lib/pulse-primitive-svg-check.py','docs/evaluation/frontend-primitive-svg.md','docs/evaluation/frontend-primitive-svg/build-lock.json'])assert.ok(fs.existsSync(path.join(packaged,name)),name);
    const manifest=JSON.parse(fs.readFileSync(path.join(packaged,'dist-manifest.json')));
    assert.equal(manifest.files.some(f=>/toolchains|module-cache|local-profile|input\.png|__pycache__|\.pyc$/.test(f.path)),false);
    const cli=path.join(packaged,'scripts/pulse-primitive-svg.mjs'),missing=path.join(root,'absent-profile.json');
    const inspected=spawnSync(process.execPath,[cli,'inspect','--profile',missing],{cwd:root,encoding:'utf8'});
    assert.equal(inspected.status,0,inspected.stderr);assert.equal(JSON.parse(inspected.stdout).status,'unavailable');
    const refused=spawnSync(process.execPath,[cli,'run','--session',root,'--reservation','foreign','--profile',missing],{cwd:root,encoding:'utf8'});
    assert.equal(refused.status,1);assert.equal(JSON.parse(refused.stdout).ok,false);assert.equal(fs.existsSync(path.join(root,'global')),false);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});

import { buildPluginDist, comparePluginDist } from "./build-plugin-dist.mjs";

const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));

test('extracted package prepares a creative session and records budget without a model or browser',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'pulse-package-creative-'));
  try{
    const packaged=path.join(root,'package'),owner=path.join(root,'owner');buildPluginDist(REPO_ROOT,packaged);fs.mkdirSync(owner);
    const bootstrap=`
import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
const [pkg,owner]=process.argv.slice(2);
const {initIcmRun}=await import(pathToFileURL(path.join(pkg,'skills/using-pulse/scripts/pulse_icm.mjs')));
const {sha256,conditionFromFiles}=await import(pathToFileURL(path.join(pkg,'scripts/lib/pulse-skill-evidence.mjs')));
initIcmRun(owner,'fixture','Package fixture, no real human approval or model.');
const base=path.join(owner,'history/fixture/stages/02_plan/output');let plan='Fixture assets\\n';
const policy={kind:'pulse-creative-pilot-policy',schema_version:'1.0',paid_tools:false,budget:{research_active_ms_per_brief:1800000,global_active_ms:10800000,max_candidates_per_brief:15,max_deep_refs_per_brief:8,min_deep_refs_per_ensemble:2,max_directions_per_brief:3,max_correction_rounds_per_brief:2,max_native_tasks:16,max_tool_actions:160,additional_external_spend_eur:0},viewports:[{width:1,height:1}]};
for(const [name,data] of Object.entries({'pilot-briefs.json':{cases:[{id:'CV1',terrain:'visual',criteria:[{id:'C1',required:true,expectation:'Fixture only'}]}]},'pilot-policy.json':policy,'pressure-corpus.json':{evals:[]}})){const body=JSON.stringify(data);fs.writeFileSync(path.join(base,name),body);plan+=sha256(body).slice(7)+'\\n';}
fs.writeFileSync(path.join(base,'plan.md'),plan);fs.writeFileSync(path.join(owner,'gate.md'),'fixture');
const runFile='history/fixture/run.json',p=path.join(owner,runFile),r=JSON.parse(fs.readFileSync(p));r.current_stage='04_execute';r.execution.approved_strategy='single-worker';
for(const gate of ['GATE_1','GATE_2','GATE_3'])r.gates[gate]={status:'approved',artifacts:[{path:gate==='GATE_2'?'history/fixture/stages/02_plan/output/plan.md':'gate.md',sha256:sha256(gate==='GATE_2'?plan:'fixture').slice(7)}],decided_at:'2026-10-04T00:00:00Z'};
fs.writeFileSync(p,JSON.stringify(r));const condition=conditionFromFiles('skills/using-pulse/SKILL.md',[{path:'skills/using-pulse/SKILL.md',content:'# Synthetic package condition'}]);
fs.writeFileSync(path.join(owner,'input.json'),JSON.stringify({owner,run_file:runFile,condition,execution_kind:'fixture'}));
`;
    const built=spawnSync(process.execPath,['--input-type=module','-',packaged,owner],{input:bootstrap,cwd:root,encoding:'utf8'});assert.equal(built.status,0,built.stderr);
    const run=(phase,input)=>spawnSync(process.execPath,[path.join(packaged,'scripts/pulse-plugin-eval.mjs'),'creative','--phase',phase,'--input',input,'--json'],{cwd:root,encoding:'utf8'});
    const prepared=run('prepare',path.join(owner,'input.json'));assert.equal(prepared.status,0,prepared.stdout+prepared.stderr);const session=JSON.parse(prepared.stdout);assert.equal(session.promotion_eligible,false);
    const request=path.join(session.root,'request.json');fs.writeFileSync(request,'Package admission only');
    const digest=cryptoHash(fs.readFileSync(request));const input=path.join(owner,'record.json');fs.writeFileSync(input,JSON.stringify({root:session.root,event:{event:'reserve',operation_id:'package-probe',brief_id:'CV1',phase:'inspection',resource:'tool',units:1,request:{path:'request.json',sha256:digest}}}));
    const admitted=run('record',input);assert.equal(admitted.status,0,admitted.stdout);const reservation=JSON.parse(admitted.stdout);assert.equal(reservation.used.tool,1);
    fs.writeFileSync(input,JSON.stringify({root:session.root,event:{event:'finish',reservation_id:reservation.reservation_id,outcome:'success',artifacts:[]}}));assert.equal(run('record',input).status,0);
    fs.writeFileSync(input,JSON.stringify({root:session.root,brief_id:'CV1',target:'research'}));const check=run('check',input);assert.equal(check.status,1);assert.equal(JSON.parse(check.stdout).kind,'pulse-creative-check');
    assert.equal(fs.existsSync(path.join(root,'pulse-eval-review.html')),false);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

function cryptoHash(bytes){return 'sha256:'+createHash('sha256').update(bytes).digest('hex');}

test("plugin distribution contains only reviewed runtime surfaces and a replayable manifest", () => {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-dist-"));
  const output = path.join(outputRoot, "pulse");
  try {
    const result = buildPluginDist(REPO_ROOT, output);
    assert.equal(result.file_count > 20, true);
    for (const required of [
      ".codex-plugin/plugin.json",
      ".claude-plugin/plugin.json",
      ".mcp.json",
      "AGENTS.template.md",
      "skills/using-pulse/SKILL.md",
      "skills/using-pulse/scripts/pulse_icm.mjs",
      "workflow/graph.json",
      "workflow/stages/03_validate/CONTEXT.md",
      "dist-manifest.json",
    ]) {
      assert.ok(fs.existsSync(path.join(output, required)), required);
    }
    for (const excluded of [".git", ".gitnexus", ".pulse", ".beads", "history", "hooks"]) {
      assert.equal(fs.existsSync(path.join(output, excluded)), false, excluded);
    }

    const mcp = JSON.parse(fs.readFileSync(path.join(output, ".mcp.json"), "utf8"));
    assert.deepEqual(Object.keys(mcp.mcpServers).sort(), ["MCP_DOCKER", "gitnexus", "morph-mcp"]);
    assert.deepEqual(comparePluginDist(output, output), { ok: true, differences: [] });
  } finally {
    fs.rmSync(outputRoot, { recursive: true, force: true });
  }
});

test("extracted package prepares v4 evidence and runs a fixture cycle outside the source checkout", () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"pulse-package-cycle-"));
  try {
    const packaged=path.join(root,"package");buildPluginDist(REPO_ROOT,packaged);
    const run=(script,args)=>spawnSync(process.execPath,[path.join(packaged,script),...args],{cwd:root,encoding:"utf8"});
    const config=path.join(root,"config.json");
    fs.writeFileSync(config,JSON.stringify({scenarioSource:"docs/evaluation/recursive-skills/pilot-corpus.json",pilotScenarioIds:[1],shared:{verifiers:[]}}));
    const workspace=path.join(root,"benchmark");
    const prepared=run("scripts/pulse-plugin-eval.mjs",["benchmark","--workspace",workspace,"--config",config,"--iteration","package-smoke","--execution-kind","fixture","--json"]);
    assert.equal(prepared.status,0,prepared.stderr||prepared.stdout);
    const evidencePath=JSON.parse(prepared.stdout).benchmark.evidencePath;
    const evidence=JSON.parse(fs.readFileSync(evidencePath,"utf8"));
    const item=evidence.scenarios[0];item.response="A structural package fixture, not a model response.";
    item.criterion_results=item.criteria.map(c=>({criterion_id:c.criterion_id,verdict:"pass",quote:"structural package fixture",reason:"Only exercises packaging and the evidence interface."}));
    fs.writeFileSync(evidencePath,JSON.stringify(evidence));
    const finalized=run("scripts/pulse-plugin-eval.mjs",["benchmark","--workspace",workspace,"--config",config,"--iteration","package-smoke","--evidence",evidencePath,"--json"]);
    assert.equal(finalized.status,0,finalized.stderr||finalized.stdout);
    const benchmark=JSON.parse(fs.readFileSync(JSON.parse(finalized.stdout).benchmark.benchmarkJsonPath,"utf8"));
    assert.equal(benchmark.promotion_eligible,false);assert.equal(benchmark.execution_kind,"fixture");
    const owner=path.join(root,"owner");fs.mkdirSync(path.join(owner,"history","fixture"),{recursive:true});
    fs.writeFileSync(path.join(owner,"history/fixture/run.json"),JSON.stringify({feature:"fixture",current_stage:"04_execute",execution:{approved_strategy:"single-worker"},gates:Object.fromEntries(["GATE_1","GATE_2","GATE_3"].map(g=>[g,{status:"approved",artifacts:[]}]))}));
    fs.writeFileSync(path.join(owner,"review.md"),"Package observation.");
    const moduleScript=`import {conditionFromFiles,sha256} from ${JSON.stringify(new URL("scripts/lib/pulse-skill-evidence.mjs",`file://${packaged}/`).href)};import fs from 'node:fs';const owner=${JSON.stringify(owner)};const target='skills/writing-pulse-skills/SKILL.md';const content=fs.readFileSync(${JSON.stringify(path.join(packaged,"skills/writing-pulse-skills/SKILL.md"))},'utf8');fs.writeFileSync(owner+'/condition.json',JSON.stringify(conditionFromFiles(target,[{path:target,content}])));fs.writeFileSync(owner+'/observation.json',JSON.stringify({source_kind:'review-evidence',owner:target,trigger:'package',observed_behavior:'fixture observation',sources:[{path:'review.md',sha256:sha256(fs.readFileSync(owner+'/review.md'))}]}));`;
    const created=spawnSync(process.execPath,["--input-type=module","-e",moduleScript],{cwd:root,encoding:"utf8"});
    assert.equal(created.status,0,created.stderr);
    const cycle=path.join(owner,"history/fixture/stages/04_execute/output/verification/skill-iteration/package");
    const initialized=run("scripts/pulse-skill-iteration.mjs",["init","--repo-root",owner,"--run-file","history/fixture/run.json","--cycle",cycle,"--corpus",path.join(packaged,"docs/evaluation/recursive-skills/pilot-corpus.json"),"--condition",path.join(owner,"condition.json"),"--observation",path.join(owner,"observation.json")]);
    assert.equal(initialized.status,0,initialized.stderr);
    const status=run("scripts/pulse-skill-iteration.mjs",["status","--cycle",cycle]);
    assert.equal(status.status,0,status.stderr);assert.equal(JSON.parse(status.stdout).status,"baseline-needed");
    assert.equal(fs.existsSync(path.join(packaged,".pulse")),false);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});

test('extracted package validates synthetic action evidence and initializes its existing cycle without auth or model calls',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'pulse-package-action-'));
  try {
    const packaged=path.join(root,'package');buildPluginDist(REPO_ROOT,packaged);
    const script=`import fs from 'node:fs';import assert from 'node:assert/strict';
import {conditionFromFiles,sha256} from ${JSON.stringify(new URL('scripts/lib/pulse-skill-evidence.mjs',`file://${packaged}/`).href)};
import {ACTION_TOOLS,prepareActionEvidence,validateActionEvidence} from ${JSON.stringify(new URL('scripts/lib/pulse-skill-action-evidence.mjs',`file://${packaged}/`).href)};
import {initCycle,cycleStatus} from ${JSON.stringify(new URL('scripts/pulse-skill-iteration.mjs',`file://${packaged}/`).href)};
const root=${JSON.stringify(root)},owner=root+'/owner',runFile='history/package-action/run.json';fs.mkdirSync(owner+'/history/package-action',{recursive:true});
fs.writeFileSync(owner+'/'+runFile,JSON.stringify({feature:'package-action',current_stage:'04_execute',execution:{approved_strategy:'single-worker'},gates:Object.fromEntries(['GATE_1','GATE_2','GATE_3'].map(g=>[g,{status:'approved',artifacts:[]}]))}));
const target='skills/systematic-debug-fix/SKILL.md',condition=conditionFromFiles(target,[{path:target,content:fs.readFileSync(${JSON.stringify(path.join(packaged,'skills/systematic-debug-fix/SKILL.md'))},'utf8')}]);
const scenarios=['repair','promotion'].map((role,i)=>({id:i+1,case_id:'P'+i,role,skill:'systematic-debug-fix',skill_path:'skills/systematic-debug-fix',prompt:'Synthetic package interface only.',expectations:['Observed check.'],fixture:{files:[{path:'case.mjs',content:'export const ok=true;'}],public_test:'console.log("public")'},checks:[{check_id:'C',program:'console.log("private")'}]}));
const data=prepareActionEvidence({iteration:'package',configPath:'synthetic',sourcePath:'synthetic',scenarios:[scenarios[0]],conditions:{P0:condition},executionKind:'fixture'}),entry=data.evidence.scenarios[0];entry.response='Synthetic capture.';entry.replay_id='package';entry.capture={attempt_id:'package',submitted_request:data.packets[0].request,argv:['synthetic'],runtime_hashes:{native:'fixture',driver:'fixture'},files_before:{'case.mjs':scenarios[0].fixture.files[0].content},files_after:{'case.mjs':scenarios[0].fixture.files[0].content},trace:[],checks:[{check_id:'C',program_sha256:sha256(scenarios[0].checks[0].program),exit_code:0,stop_reason:null,verdict:'pass'}],quiescent:true,trace_complete:true,policy:{worker:'bubblewrap-readonly-no-network'},capabilities:{tools:ACTION_TOOLS}};
entry.criterion_results=[{criterion_id:'P0:e1',verdict:'pass',reason:'Structural fixture only.',references:[{source:'check:C',quote:'"verdict":"pass"'}]}];const checked=validateActionEvidence(data.manifest,data.evidence,data.manifest.definitions,data.packets);assert.equal(checked.ok,true);assert.equal(checked.promotion_eligible,false);
fs.writeFileSync(owner+'/condition.json',JSON.stringify(condition));fs.writeFileSync(owner+'/corpus.json',JSON.stringify({evals:scenarios}));fs.writeFileSync(owner+'/review.md','Package observation.');fs.writeFileSync(owner+'/observation.json',JSON.stringify({source_kind:'review-evidence',owner:target,trigger:'package',observed_behavior:'synthetic',sources:[{path:'review.md',sha256:sha256('Package observation.')}]}));
const cycle=owner+'/history/package-action/stages/04_execute/output/verification/skill-iteration/action';initCycle({repoRoot:owner,runFile,cycle,condition:owner+'/condition.json',corpus:owner+'/corpus.json',observation:owner+'/observation.json',evidenceMode:'action'});assert.equal(cycleStatus(cycle).calls,0);console.log('synthetic action package proof');`;
    const result=spawnSync(process.execPath,['--input-type=module','-e',script],{cwd:root,encoding:'utf8'});assert.equal(result.status,0,result.stderr);
    for(const file of ['scripts/pulse-skill-action-runner.mjs','scripts/lib/pulse-controlled-fixture.mjs','docs/evaluation/recursive-skill-actions.md'])assert.ok(fs.existsSync(path.join(packaged,file)),file);
    assert.equal(fs.existsSync(path.join(packaged,'.pulse')),false);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});

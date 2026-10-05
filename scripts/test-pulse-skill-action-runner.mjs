import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sha256 } from './lib/pulse-skill-evidence.mjs';
import { createControlledFixture } from './lib/pulse-controlled-fixture.mjs';
import { ACTION_TOOLS } from './lib/pulse-skill-action-evidence.mjs';
import { projectRequest,admitResponse,admittedSse,authorizeCall,runAppServer,runActionCase } from './pulse-skill-action-runner.mjs';

const response=output=>({id:'response_owned',object:'response',status:'completed',model:'gpt-6.1-sol',output,usage:{input_tokens:0,output_tokens:0,total_tokens:0,input_tokens_details:{cached_tokens:0}}});
const call=(name='fixture_read',args={path:'case.mjs'},callId='call_owned')=>({type:'function_call',id:'item_'+callId,call_id:callId,name,arguments:JSON.stringify(args)});
const packet={request:'declared packet only',submitted_request_sha256:sha256('declared packet only')};
test('additional_tools uses the required developer role before the frozen user packet',()=>{
  const request=projectRequest({model:'gpt-6.1-sol',reasoning:{effort:'low'},input:[]},packet);
  assert.equal(request.input[0].type,'additional_tools');assert.equal(request.input[0].role,'developer');assert.equal(request.input[1].role,'user');
});
test('projection removes native tools and undeclared orchestration context, preserving frozen input and tool history',()=>{
  const actual=projectRequest({model:'gpt-6.1-sol',reasoning:{effort:'low'},instructions:'must use functions.exec',tools:[{name:'shell'}],input:[{type:'additional_tools',tools:[{name:'functions'}]},{type:'message',role:'developer',content:'native orchestration'},call()]},packet);
  assert.deepEqual(actual.input[0].tools.map(t=>t.name),ACTION_TOOLS);assert.equal(actual.tools,undefined);assert.ok(!JSON.stringify(actual).includes('functions.exec'));assert.equal(actual.input[1].content[0].text,packet.request);assert.equal(actual.input[2].call_id,'call_owned');
});
test('complete response batches reject mixed forbidden operations before any dispatch',()=>{
  for(const forbidden of [call('collaboration.list_agents',{}),{...call(),namespace:'functions'},call('fixture_test',{command:'arbitrary'}),{...call(),type:'custom_tool_call'},call('functions.fixture_read')]) assert.throws(()=>admitResponse(JSON.stringify(response([call(),forbidden]))));
  assert.equal(admitResponse(admittedSse(response([call()]))).output[0].name,'fixture_read');
});
test('unknown stream events, incomplete streams, duplicate IDs and malformed arguments fail closed',()=>{
  const stream=admittedSse(response([call()]));assert.throws(()=>admitResponse(stream.slice(0,-2)),/Incomplete/);
  assert.throws(()=>admitResponse(stream+'data: {"type":"unknown"}\n\n'),/trailing/);
  assert.throws(()=>admitResponse(JSON.stringify(response([call(),call()]))),/Duplicate/);
  assert.throws(()=>admitResponse(JSON.stringify(response([{...call(),arguments:'not-json'}]))));
});
test('completed item events are retained when the native terminal response has an empty output array',()=>{
  const expected=call();const full=admittedSse(response([expected]));const stream=full.replace(JSON.stringify({type:'response.completed',response:response([expected])}),JSON.stringify({type:'response.completed',response:response([])}));
  assert.deepEqual(admitResponse(stream).output,[expected]);
});
test('missing item completion and contradictory terminal output fail closed',()=>{
  const expected=call(),stream=admittedSse(response([expected]));
  assert.throws(()=>admitResponse(stream.replace(/event: response.output_item.done\ndata: [^\n]+\n\n/,'')),/Incomplete output item/);
  const changed=stream.replace(JSON.stringify({type:'response.completed',response:response([expected])}),JSON.stringify({type:'response.completed',response:response([call('fixture_test',{})])}));
  assert.throws(()=>admitResponse(changed),/differ/);
});
test('RPC admission binds exact thread, turn, call, operation and arguments and is one-use',()=>{
  const item=call(),map=new Map([[item.call_id,{item,used:false}]]),identity={threadId:'thread',turnId:'turn'};
  const params={...identity,callId:item.call_id,tool:'fixture_read',arguments:{path:'case.mjs'}};
  for(const change of [{threadId:'other'},{turnId:'other'},{callId:'unknown'},{namespace:'functions'},{arguments:{path:'other.mjs'}}])assert.throws(()=>authorizeCall({...params,...change},identity,map));
  authorizeCall(params,identity,map);assert.throws(()=>authorizeCall(params,identity,map),/duplicate/);
});
test('a missing owner/inspection cannot reserve or launch an action replay',async()=>{
  await assert.rejects(runActionCase('/nonexistent',{caseId:'A',inspection:'/none'}));
  await assert.rejects(runAppServer({packet,mode:'native'}),/owner and correlated inspection/);
});
test('installed App Server reaches a separate scripted backend with exact registry and actual isolated handlers',async t=>{
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'pulse-appserver-test-'));t.after(()=>fs.rmSync(base,{recursive:true,force:true}));
  const before='export const ok=false;',fixture=createControlledFixture(path.join(base,'fixture'),{fixture:{files:[{path:'case.mjs',content:before}],public_test:"import assert from 'node:assert/strict';import {ok} from './case.mjs';assert.equal(ok,true);"},checks:[]},{attemptId:'synthetic-owned'});
  let n=0;const declared=[];
  const steps=[call('fixture_read',{path:'case.mjs'},'one'),call('fixture_test',{},'two'),call('fixture_patch',{path:'case.mjs',before_sha256:sha256(before),content:'export const ok=true;'},'three'),call('fixture_test',{},'four'),{id:'message_end',type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'Scripted completion; not a real model.',annotations:[]}]}];
  const result=await runAppServer({packet,fixture,mode:'fixture',deadlineMs:20000,backend:async payload=>{assert.equal(payload.input[0].role,'developer','The provider requires input[0].role on additional_tools.');declared.push(payload.input[0].tools.map(t=>t.name));const item=steps[n++];return admittedSse(response([item])).replace(JSON.stringify({type:'response.completed',response:response([item])}),JSON.stringify({type:'response.completed',response:response([])}));}});
  assert.equal(result.failure,null,JSON.stringify({failure:result.failure,terminal:result.terminal,stderr:result.stderr,requests:result.requests.length}));
  assert.equal(result.terminal?.status,'completed');assert.ok(result.closed);assert.equal(n,5);assert.ok(declared.every(names=>JSON.stringify(names)===JSON.stringify(ACTION_TOOLS)));
  assert.deepEqual(fixture.trace.filter(t=>t.operation==='fixture_test').map(t=>t.result.exit_code),[1,0]);assert.ok(fixture.trace.every(t=>t.attempt_id==='synthetic-owned'));assert.equal(fixture.snapshot()['case.mjs'],'export const ok=true;');
});
test('a mixed forbidden batch preserves prior handlers and never dispatches its admitted prefix',async t=>{
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'pulse-batch-test-'));t.after(()=>fs.rmSync(base,{recursive:true,force:true}));
  const fixture=createControlledFixture(path.join(base,'fixture'),{fixture:{files:[{path:'case.mjs',content:'sentinel'}],public_test:'console.log("test")'},checks:[]},{attemptId:'mixed'});
  let n=0;const result=await runAppServer({packet,fixture,mode:'fixture',deadlineMs:15000,backend:async()=>JSON.stringify(response(n++===0?[call()]:[call('fixture_test',{},'second'),call('collaboration.list_agents',{},'bad')]))});
  assert.match(result.failure,/Forbidden/);assert.equal(fixture.trace.length,1);assert.deepEqual(result.trace,fixture.trace);assert.equal(result.quiescent,true);assert.equal(fixture.snapshot()['case.mjs'],'sentinel');assert.ok(result.process_reaped);
});
test('a tiny model deadline does not charge native CLI startup to model execution',async t=>{
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'pulse-clock-test-'));t.after(()=>fs.rmSync(base,{recursive:true,force:true}));
  const fixture=createControlledFixture(path.join(base,'fixture'),{fixture:{files:[{path:'case.mjs',content:'sentinel'}],public_test:'console.log("test")'},checks:[]},{attemptId:'clock'});
  const final={id:'clock_message',type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'Synthetic immediate response.',annotations:[]}]};
  const result=await runAppServer({packet,fixture,mode:'fixture',deadlineMs:25,backend:async()=>JSON.stringify(response([final]))});
  assert.equal(result.terminal?.status,'completed',JSON.stringify({failure:result.failure,requests:result.requests.length}));
  assert.ok(Date.parse(result.received_at)-Date.parse(result.submitted_at)<=25);
});

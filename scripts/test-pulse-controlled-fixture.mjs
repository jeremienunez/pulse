import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { once } from 'node:events';
import { sha256 } from './lib/pulse-skill-evidence.mjs';
import { createControlledFixture,runFixtureProgram,validateOperation } from './lib/pulse-controlled-fixture.mjs';

const before='export const ok=false;';
const definition={fixture:{files:[{path:'case.mjs',content:before}],public_test:"import assert from 'node:assert/strict';import {ok} from './case.mjs';assert.equal(ok,true);console.log('public passed');"},checks:[{check_id:'private',program:"import assert from 'node:assert/strict';import {ok} from './case.mjs';assert.equal(ok,true);console.log('private passed');"}]};
function fixture(t,options={}) {const base=fs.mkdtempSync(path.join(os.tmpdir(),'pulse-controlled-'));t.after(()=>fs.rmSync(base,{recursive:true,force:true}));return {base,...createControlledFixture(path.join(base,'fixture'),definition,{attemptId:'owned-attempt',...options})};}
test('actual read/test/patch/test produces isolated red then green and separate private checks',async t=>{
  const f=fixture(t);const read=await f.invoke('fixture_read',{path:'case.mjs'},{callId:'1'});assert.equal(read.content,before);
  assert.equal((await f.invoke('fixture_test',{},{callId:'2'})).exit_code,1);
  await f.invoke('fixture_patch',{path:'case.mjs',before_sha256:read.sha256,content:'export const ok=true;'},{callId:'3'});
  const green=await f.invoke('fixture_test',{},{callId:'4'});assert.equal(green.exit_code,0,green.stderr);assert.equal(green.process_reaped,true);
  assert.equal((await f.privateChecks())[0].verdict,'pass');assert.equal(f.trace.length,4);assert.ok(f.quiescent());
});
test('unknown operations, arguments, paths, stale preimages and aliases are rejected',async t=>{
  const f=fixture(t);let n=0;
  for (const [name,args] of [['exec',{}],['functions.fixture_read',{path:'case.mjs'}],['fixture_test',{command:'arbitrary'}],['fixture_read',{path:'../case.mjs'}],['fixture_read',{path:'/case.mjs'}],['fixture_read',{path:'missing.mjs'}],['fixture_patch',{path:'case.mjs',before_sha256:sha256('wrong'),content:'x'}]]) await assert.rejects(f.invoke(name,args,{callId:String(++n)}));
  assert.equal(f.snapshot()['case.mjs'],before);assert.throws(()=>validateOperation('fixture_test',[]));
});
test('symlinks including ancestors and hardlinks cannot expose outside data',async t=>{
  const f=fixture(t);const outside=path.join(f.base,'outside.mjs');fs.writeFileSync(outside,'sentinel');fs.unlinkSync(path.join(f.root,'case.mjs'));fs.symlinkSync(outside,path.join(f.root,'case.mjs'));
  await assert.rejects(f.invoke('fixture_read',{path:'case.mjs'},{callId:'symlink'}),/Symlink/);fs.unlinkSync(path.join(f.root,'case.mjs'));fs.linkSync(outside,path.join(f.root,'case.mjs'));
  await assert.rejects(f.invoke('fixture_read',{path:'case.mjs'},{callId:'hardlink'}),/regular/);assert.equal(fs.readFileSync(outside,'utf8'),'sentinel');
  const nested=createControlledFixture(path.join(f.base,'nested'),{...definition,fixture:{...definition.fixture,files:[{path:'dir/case.mjs',content:before}]}},{attemptId:'nested'});fs.renameSync(path.join(nested.root,'dir'),path.join(nested.root,'saved'));fs.symlinkSync(path.join(nested.root,'saved'),path.join(nested.root,'dir'));assert.throws(()=>nested.snapshot(),/Symlink/);
});
test('worker cannot reach host home, source, outside files, writable fixture or host network',async t=>{
  const f=fixture(t);const listener=net.createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');t.after(()=>listener.close());
  const outside=path.join(f.base,'sentinel');fs.writeFileSync(outside,'preserve');
  const program=`import fs from 'node:fs';import net from 'node:net';import assert from 'node:assert/strict';assert.equal(fs.existsSync('/home/jerem'),false);assert.equal(fs.existsSync('/media'),false);assert.equal(fs.existsSync(${JSON.stringify(outside)}),false);assert.throws(()=>fs.writeFileSync('/workspace/new-file','x'));await new Promise((resolve,reject)=>{const s=net.connect(${listener.address().port},'127.0.0.1');s.once('error',()=>resolve());s.once('connect',()=>{s.destroy();reject(new Error('host reachable'));});});console.log('isolated');`;
  const result=await runFixtureProgram(f.root,program);assert.equal(result.exit_code,0,result.stderr);assert.equal(result.stdout.trim(),'isolated');assert.equal(fs.readFileSync(outside,'utf8'),'preserve');
});
test('deadline and output limit close actual owned processes; duplicate and over-budget calls stop',async t=>{
  const f=fixture(t,{maxActions:1});const timeout=await runFixtureProgram(f.root,'while(true){}',{deadlineMs:50});assert.equal(timeout.stop_reason,'timeout');assert.ok(timeout.process_reaped);
  const flood=await runFixtureProgram(f.root,"while(true)process.stdout.write('x'.repeat(8192))",{maxOutputBytes:100});assert.equal(flood.stop_reason,'output-limit');assert.ok(flood.process_reaped);assert.ok(Buffer.byteLength(flood.stdout)<=100);
  await f.invoke('fixture_read',{path:'case.mjs'},{callId:'one'});await assert.rejects(f.invoke('fixture_read',{path:'case.mjs'},{callId:'one'}),/duplicate/);await assert.rejects(f.invoke('fixture_test',{},{callId:'two'}),/Action limit/);
});
test('owner cancellation reaps an actual running worker before quiescence',async t=>{
  const f=fixture(t);const abort=new AbortController();const pending=runFixtureProgram(f.root,'while(true){}',{signal:abort.signal});abort.abort();
  const result=await pending;assert.equal(result.stop_reason,'cancelled');assert.equal(result.process_reaped,true);
  f.stop();await assert.rejects(f.invoke('fixture_test',{},{callId:'late'}),/Stopped/);
});

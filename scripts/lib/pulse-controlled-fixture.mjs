import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { ACTION_TOOLS } from './pulse-skill-action-evidence.mjs';
import { sha256 } from './pulse-skill-evidence.mjs';

export const FIXTURE_TOOLS = Object.freeze(ACTION_TOOLS.map(name=>({name,description:`Controlled ${name} operation`,type:'function',inputSchema:{type:'object',additionalProperties:false,
  properties:Object.fromEntries((name==='fixture_read'?['path']:name==='fixture_patch'?['path','before_sha256','content']:[]).map(key=>[key,{type:'string'}])),
  required:name==='fixture_read'?['path']:name==='fixture_patch'?['path','before_sha256','content']:[]}})));

export function validateOperation(name,args) {
  const spec=FIXTURE_TOOLS.find(s=>s.name===name);
  if (!spec || !args || typeof args!=='object' || Array.isArray(args) || Object.keys(args).sort().join()!==[...spec.inputSchema.required].sort().join() || Object.values(args).some(v=>typeof v!=='string')) throw new Error('Unknown operation or arguments.');
  if (name!=='fixture_test' && !/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\.mjs$/.test(args.path)) throw new Error('Unsafe fixture path.');
  if (name==='fixture_patch' && (Buffer.byteLength(args.content)>65536 || !/^sha256:[a-f0-9]{64}$/.test(args.before_sha256))) throw new Error('Invalid patch content/preimage.');
  return spec;
}

export function runFixtureProgram(root,program,{deadlineMs=3000,maxOutputBytes=65536,signal}={}) {
  if (!Number.isInteger(deadlineMs)||deadlineMs<1||deadlineMs>3000||!Number.isInteger(maxOutputBytes)||maxOutputBytes<1||maxOutputBytes>65536 || typeof program!=='string') throw new Error('Invalid worker bounds/program.');
  const argv=['--unshare-all','--die-with-parent','--new-session','--ro-bind','/usr','/usr','--symlink','usr/bin','/bin','--symlink','usr/lib','/lib','--symlink','usr/lib64','/lib64',
    '--proc','/proc','--dev','/dev','--tmpfs','/tmp','--ro-bind',fs.realpathSync(root),'/workspace','--clearenv','--setenv','PATH','/usr/bin:/bin','--chdir','/workspace','/usr/bin/node','--input-type=module','-e',program];
  return new Promise(resolve=>{
    const started=Date.now(),child=spawn('bwrap',argv,{detached:true,stdio:['ignore','pipe','pipe'],env:{PATH:'/usr/bin:/bin'}});
    let stdout='',stderr='',size=0,reason=null,error=null;
    const stop=why=>{ if(reason)return;reason=why;try {process.kill(-child.pid,'SIGKILL');} catch {} };
    const abort=()=>stop('cancelled');signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
    const timer=setTimeout(()=>stop('timeout'),deadlineMs);
    for (const [name,stream] of [['stdout',child.stdout],['stderr',child.stderr]]) stream?.on('data',bytes=>{
      const room=Math.max(0,maxOutputBytes-size),part=bytes.subarray(0,room).toString('utf8');size+=bytes.length;
      if(name==='stdout') stdout+=part;else stderr+=part;if(size>maxOutputBytes)stop('output-limit');
    });
    child.on('error',e=>{error=e.code??e.message;});
    child.on('close',(code,exitSignal)=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);resolve({exit_code:code,signal:exitSignal,stop_reason:reason,error,stdout,stderr,elapsed_ms:Date.now()-started,process_reaped:true,
      program_sha256:sha256(program),argv_sha256:sha256(JSON.stringify(argv)),worker:'bubblewrap-readonly-no-network'});});
  });
}

export function createControlledFixture(root,definition,{attemptId,maxActions=24,deadlineMs=3000,maxOutputBytes=65536}={}) {
  if (!attemptId || !Number.isInteger(maxActions)||maxActions<1||maxActions>24 || fs.existsSync(root)) throw new Error('Fixture needs a fresh owned path, attempt and bounded action count.');
  fs.mkdirSync(root,{recursive:true,mode:0o700});
  const files=definition.fixture.files,allowed=new Set(files.map(f=>f.path)),trace=[],abort=new AbortController();
  for (const file of files) {
    validateOperation('fixture_read',{path:file.path});const target=path.join(root,file.path);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,file.content,{flag:'wx',mode:0o600});
  }
  const actualRoot=fs.realpathSync(root);
  function targetFor(relative) {
    if (!allowed.has(relative) || fs.realpathSync(root)!==actualRoot) throw new Error('Undeclared fixture path.');
    let current=actualRoot;
    for (const component of relative.split('/')) {current=path.join(current,component);if(fs.lstatSync(current).isSymbolicLink()) throw new Error('Symlink fixture path.');}
    const stat=fs.lstatSync(current);if (!stat.isFile()||stat.nlink!==1||stat.size>65536) throw new Error('Not a bounded owned regular file.');
    return current;
  }
  function readFile(relative) {
    const fd=fs.openSync(targetFor(relative),fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
    try {const bytes=fs.readFileSync(fd);if(bytes.length>65536)throw new Error('File limit exceeded.');return bytes.toString('utf8');} finally {fs.closeSync(fd);}
  }
  const snapshot=()=>Object.fromEntries([...allowed].sort().map(p=>[p,readFile(p)]));
  let busy=false;
  async function invoke(name,args,{callId}={}) {
    if (abort.signal.aborted||busy || !callId || trace.some(t=>t.call_id===callId)) throw new Error('Stopped, concurrent or duplicate fixture call.');
    const event={attempt_id:attemptId,call_id:callId,operation:name,arguments:args,started_at:new Date().toISOString()};trace.push(event);busy=true;
    try {
      if(trace.length>maxActions)throw new Error('Action limit exceeded.');validateOperation(name,args);
      let result;
      if (name==='fixture_read') {const content=readFile(args.path);result={content,sha256:sha256(content)};}
      else if(name==='fixture_patch') {
        const target=targetFor(args.path),before=readFile(args.path);if(sha256(before)!==args.before_sha256)throw new Error('Preimage mismatch.');
        const temp=path.join(path.dirname(target),`.pulse-${randomUUID()}.tmp`);
        try {const fd=fs.openSync(temp,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);try {fs.writeFileSync(fd,args.content);}finally {fs.closeSync(fd);}
          if(readFile(args.path)!==before)throw new Error('Preimage changed during patch.');fs.renameSync(temp,target);
        } finally {if(fs.existsSync(temp))fs.unlinkSync(temp);}
        result={sha256:sha256(readFile(args.path))};
      } else {snapshot();result=await runFixtureProgram(actualRoot,definition.fixture.public_test,{deadlineMs,maxOutputBytes,signal:abort.signal});}
      event.status='completed';event.result=result;return result;
    } catch(error) {event.status='rejected';event.error=error.message;throw error;}
    finally {event.finished_at=new Date().toISOString();busy=false;}
  }
  async function privateChecks() {
    if(busy)throw new Error('Worker is active.');snapshot();const results=[];
    for (const check of definition.checks) {const result=await runFixtureProgram(actualRoot,check.program,{deadlineMs,maxOutputBytes});results.push({...result,check_id:check.check_id,verdict:result.exit_code===0&&!result.stop_reason?'pass':'fail'});}
    return results;
  }
  return {root:actualRoot,trace,snapshot,invoke,privateChecks,quiescent:()=>!busy,stop:()=>abort.abort()};
}

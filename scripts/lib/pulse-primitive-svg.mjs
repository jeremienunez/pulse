import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {creativeStatus} from './pulse-creative-session.mjs';
import {imageSize,safeId,safePath} from './pulse-creative-evidence.mjs';
import {sha256,objectDigest} from './pulse-skill-evidence.mjs';

export const PRIMITIVE_COMMIT = '0373c216458be1c4b40655b796a3aefedf8b7d23';
const CHECKER = fileURLToPath(new URL('./pulse-primitive-svg-check.py',import.meta.url));
const HASH = /^sha256:[a-f0-9]{64}$/;
const COMPILED = {'github.com/fogleman/gg':'v1.3.0','github.com/golang/freetype':'v0.0.0-20170609003504-e2365dfdc4a0','github.com/nfnt/resize':'v0.0.0-20180221191011-83c6a9932646','golang.org/x/image':'v0.23.0'};
const assert = (ok,message) => {if(!ok)throw new Error(message);};
function keys(value,required) {assert(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===required.length&&required.every(k=>Object.hasOwn(value,k)),`Invalid fields: ${required.join(',')}`);}
function absolute(file) {
  assert(typeof file==='string'&&path.isAbsolute(file)&&path.normalize(file)===file,'Explicit normalized absolute path required');
  let current=path.parse(file).root;
  for(const p of file.slice(current.length).split('/')) {current=path.join(current,p);const s=fs.lstatSync(current);assert(!s.isSymbolicLink(),'Symlink path forbidden');}
  return file;
}
function readFile(file,max=20*1024*1024) {
  const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
  try {const s=fs.fstatSync(fd);assert(s.isFile()&&s.size<=max,'File type/size exceeds bound');const b=fs.readFileSync(fd);assert(b.length<=max,'File grew beyond bound');return b;}finally {fs.closeSync(fd);}
}
function inside(root,relative,createParents=false) {
  assert(safePath(relative),'Unsafe artifact path');let current=root;
  const parts=relative.split('/');
  for(let i=0;i<parts.length;i++) {
    current=path.join(current,parts[i]);let s=fs.lstatSync(current,{throwIfNoEntry:false});
    if(!s&&createParents&&i<parts.length-1) {fs.mkdirSync(current,{mode:0o700});s=fs.lstatSync(current);}
    if(s)assert(!s.isSymbolicLink()&&(i===parts.length-1||s.isDirectory()),'Symlink/non-directory artifact path');
    else assert(i===parts.length-1,'Missing artifact parent');
  }
  return current;
}
function executable(spec) {
  assert(HASH.test(spec.sha256),'Executable digest missing');const file=absolute(spec.path),b=readFile(file,16*1024*1024);
  assert(sha256(b)===spec.sha256,'Executable changed');fs.accessSync(file,fs.constants.X_OK);return b;
}
function profileData(profileFile) {
  assert(process.platform==='linux'&&process.arch==='x64','Only Linux amd64 profile supported');
  const file=absolute(profileFile),bytes=readFile(file,2*1024*1024),p=JSON.parse(bytes);
  keys(p,['kind','schema_version','primitive','bubblewrap','python']);
  assert(p.kind==='pulse-primitive-local-profile'&&p.schema_version==='1.0','Profile identity invalid');
  keys(p.primitive,['path','sha256','source_commit','build_manifest']);
  keys(p.primitive.build_manifest,['path','sha256']);
  for(const k of ['bubblewrap','python']) {keys(p[k],['path','sha256','version']);assert(typeof p[k].version==='string'&&p[k].version.trim(),'Runtime version missing');}
  assert(p.primitive.source_commit===PRIMITIVE_COMMIT,'Unpinned Primitive source');
  const binary=executable(p.primitive);executable(p.bubblewrap);executable(p.python);
  const manifestBytes=readFile(absolute(p.primitive.build_manifest.path),2*1024*1024),m=JSON.parse(manifestBytes);
  assert(HASH.test(p.primitive.build_manifest.sha256)&&sha256(manifestBytes)===p.primitive.build_manifest.sha256,'Build manifest changed');
  assert(m.kind==='pulse-primitive-local-build'&&m.schema_version==='1.0'&&m.source_commit===PRIMITIVE_COMMIT&&m.cgo_enabled===false&&m.binary?.statically_linked===true&&m.binary.path===p.primitive.path&&m.binary.sha256===p.primitive.sha256,'Build provenance differs');
  assert(m.toolchain?.version==='go version go1.27.1 linux/amd64'&&Object.keys(m.compiled_modules||{}).length===4&&Object.entries(COMPILED).every(([k,v])=>m.compiled_modules[k]===v),'Build dependency profile differs');
  return {profile:p,bytes,binary,manifestBytes,sha256:sha256(bytes)};
}
export function inspectPrimitiveProfile(file) {
  try {const data=profileData(file);return {kind:'pulse-primitive-availability',schema_version:'1.0',status:'available',profile_sha256:data.sha256,source_commit:PRIMITIVE_COMMIT,executables:Object.fromEntries(['primitive','bubblewrap','python'].map(k=>[k,{path:data.profile[k].path,sha256:data.profile[k].sha256}])),execution_performed:false};}
  catch(error) {return {kind:'pulse-primitive-availability',schema_version:'1.0',status:error.code==='ENOENT'?'unavailable':'invalid',error:error.message,execution_performed:false};}
}
function validateRequest(r,pending,sessionManifest) {
  keys(r,['kind','schema_version','operation_id','brief_id','purpose','profile_sha256','input','params']);
  assert(r.kind==='pulse-primitive-svg-job'&&r.schema_version==='1.0'&&r.operation_id===pending.operation_id&&r.brief_id===pending.brief_id,'Job identity differs');
  assert(HASH.test(r.profile_sha256),'Profile digest missing');
  if(r.purpose==='capability-probe')assert(r.brief_id==='global'&&pending.phase==='inspection','Capability probe requires global inspection');
  else {
    assert(r.purpose==='creative-variant'&&['generation','correction'].includes(pending.phase),'Creative variant requires admitted generation/correction');
    const brief=sessionManifest.assets.briefs.value.cases.find(b=>b.id===r.brief_id);
    assert(brief&&['visual','product-ux'].includes(brief.terrain),'Creative terrain required');
  }
  keys(r.input,['path','sha256','media_type','rights_basis']);
  assert(safePath(r.input.path)&&r.input.path.startsWith(r.brief_id+'/')&&HASH.test(r.input.sha256)&&['image/png','image/jpeg'].includes(r.input.media_type),'Invalid input identity/path/type');
  assert(typeof r.input.rights_basis==='string'&&r.input.rights_basis.trim()&&r.input.rights_basis.length<=2000,'Input rights basis required');
  keys(r.params,['shapes','mode','alpha','workers','resize','output_size']);
  for(const [k,[min,max]] of Object.entries({shapes:[1,200],mode:[0,8],alpha:[0,255],workers:[1,2],resize:[16,256],output_size:[64,1024]}))assert(Number.isInteger(r.params[k])&&r.params[k]>=min&&r.params[k]<=max,`Parameter outside bounds: ${k}`);
}
function groupAlive(pid) {try {process.kill(-pid,0);return true;}catch(e){return e.code!=='ESRCH';}}
async function boundedProcess(executablePath,argv,deadline) {
  const ms=Math.floor(deadline-performance.now());
  if(ms<=0)return {exit_code:null,signal:null,stop_reason:'timeout',process_reaped:true,process_group_gone:true,stdout:Buffer.alloc(0),stderr:Buffer.alloc(0),argv};
  return new Promise(resolve=>{
    const child=spawn(executablePath,argv,{shell:false,detached:true,env:{PATH:'/usr/bin:/bin'},stdio:['ignore','pipe','pipe']});
    let reason=null,error=null;const chunks={stdout:[],stderr:[]},sizes={stdout:0,stderr:0};
    const stop=why=>{reason??=why;try {process.kill(-child.pid,'SIGKILL');}catch{}};
    const timer=setTimeout(()=>stop('timeout'),ms);
    for(const [name,stream] of [['stdout',child.stdout],['stderr',child.stderr]])stream?.on('data',b=>{const room=Math.max(0,65536-sizes[name]);chunks[name].push(b.subarray(0,room));sizes[name]+=b.length;if(sizes[name]>65536)stop('output-limit');});
    child.on('error',e=>{error=e.code??e.message;});
    child.on('close',async(code,signal)=>{
      clearTimeout(timer);const reapUntil=performance.now()+1000;
      while(child.pid&&groupAlive(child.pid)&&performance.now()<reapUntil) {stop(reason??'residual-process');await new Promise(r=>setTimeout(r,10));}
      resolve({exit_code:code,signal,stop_reason:reason,error,process_reaped:true,process_group_gone:!child.pid||!groupAlive(child.pid),stdout:Buffer.concat(chunks.stdout),stderr:Buffer.concat(chunks.stderr),argv});
    });
  });
}
export async function runPrimitiveSvg({session,reservation,profile},options={}) {
  const deadlineMs=options.deadlineMs??60000;
  assert(Number.isInteger(deadlineMs)&&deadlineMs>=1&&deadlineMs<=60000,'Deadline outside bounds');
  const root=absolute(session),status=creativeStatus(root),pending=status.pending;
  assert(status.status==='active'&&!status.finalized&&pending?.reservation_id===reservation&&pending.resource==='tool'&&pending.units===1,'Matching active one-unit tool reservation required');
  assert(safeId(pending.operation_id)&&safeId(pending.brief_id),'Pending identity invalid');
  assert(Date.now()>=pending.at&&status.active_ms+Date.now()-pending.at<status.budget.global_active_ms,'Active budget expired');
  const requestBytes=readFile(inside(root,pending.request.path),2*1024*1024);
  assert(sha256(requestBytes)===pending.request.sha256,'Admitted request changed');
  const jobRelative=`${pending.brief_id}/primitive/${pending.operation_id}`,job=inside(root,jobRelative,true);
  fs.mkdirSync(job,{mode:0o700}); // EEXIST is never replayed or overwritten.
  const began=performance.now(),remainingBudget=status.budget.global_active_ms-status.active_ms-(Date.now()-pending.at),deadline=began+Math.min(deadlineMs,remainingBudget),artifacts=[];
  const write=(name,bytes,mode=0o600)=>{const b=Buffer.isBuffer(bytes)?bytes:Buffer.from(bytes);fs.writeFileSync(path.join(job,name),b,{flag:'wx',mode});artifacts.push({path:`${jobRelative}/${name}`,sha256:sha256(b)});};
  const json=(name,value)=>write(name,JSON.stringify(value,null,2)+'\n');
  const processRecords=[];
  let outcome='error',message=null,published=null,params=null,quarantine=null,availability=null;
  json('claim.json',{reservation_id:reservation,operation_id:pending.operation_id,brief_id:pending.brief_id,request_sha256:pending.request.sha256,claimed_at:new Date().toISOString(),pid:process.pid});
  write('request.json',requestBytes);
  try {
    const r=JSON.parse(requestBytes),sessionManifest=JSON.parse(readFile(path.join(root,'session.json'),2*1024*1024)).manifest;
    validateRequest(r,pending,sessionManifest);params=r.params;
    const data=profileData(profile);availability='available';
    assert(data.sha256===r.profile_sha256,'Admitted profile changed');
    const input=readFile(inside(root,r.input.path),10*1024*1024),size=imageSize(input);
    assert(sha256(input)===r.input.sha256,'Input changed');
    const isPng=input.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    assert((r.input.media_type==='image/png')===isPng,'Input media type differs');
    assert(size.width>=1&&size.width<=4096&&size.height>=1&&size.height<=4096&&size.width*size.height<=16777216,'Input dimensions exceed bound');
    write('profile.json',data.bytes);write('build-manifest.json',data.manifestBytes);
    write('input'+(isPng?'.png':'.jpg'),input,0o400);write('primitive',data.binary,0o500);write('checker.py',readFile(CHECKER,65536),0o400);
    const work=path.join(job,'work');fs.mkdirSync(work,{mode:0o700});
    const p=data.profile,nativeArgs=['--unshare-all','--die-with-parent','--new-session','--proc','/proc','--dev','/dev','--tmpfs','/tmp','--ro-bind',path.join(job,'primitive'),'/primitive','--ro-bind',path.join(job,'input'+(isPng?'.png':'.jpg')),'/input','--bind',work,'/work','--clearenv','--setenv','GOMAXPROCS','2','--chdir','/work','/primitive','-i','/input','-o','/work/partial.svg','-n',String(params.shapes),'-m',String(params.mode),'-a',String(params.alpha),'-j',String(params.workers),'-r',String(params.resize),'-s',String(params.output_size),'-rep','0'];
    const capture=async(name,exe,args)=>{const result=await boundedProcess(exe,args,deadline);write(name+'.stdout.log',result.stdout);write(name+'.stderr.log',result.stderr);const {stdout,stderr,...record}=result;processRecords.push({name,executable:exe,...record});return result;};
    executable(p.bubblewrap);const native=await capture('native',p.bubblewrap.path,nativeArgs);
    if(!native.process_group_gone) {outcome='uncertain';throw new Error('Process termination incomplete');}
    if(native.stop_reason==='timeout') {outcome='timeout';throw new Error('Conversion deadline exceeded');}
    assert(native.exit_code===0&&!native.stop_reason&&!native.error,'Primitive process failed or output limit exceeded');
    const partial=inside(root,`${jobRelative}/work/partial.svg`),stat=fs.lstatSync(partial);
    quarantine={path:`${jobRelative}/work/partial.svg`,size:stat.size};
    const candidate=readFile(partial,1024*1024);write('candidate.svg',candidate,0o400);
    executable(p.python);const checked=await capture('xml',p.python.path,['-I','-S',path.join(job,'checker.py'),path.join(job,'candidate.svg'),String(params.shapes),String(params.output_size)]);
    if(!checked.process_group_gone) {outcome='uncertain';throw new Error('XML process termination incomplete');}
    if(checked.stop_reason==='timeout') {outcome='timeout';throw new Error('XML deadline exceeded');}
    assert(checked.exit_code===0&&!checked.stop_reason&&!checked.error,'SVG validation failed');
    const verdict=JSON.parse(checked.stdout.toString('utf8'));assert(verdict.ok===true,'SVG validation rejected');json('svg-validation.json',verdict);
    if(performance.now()>deadline) {outcome='timeout';throw new Error('Job deadline exceeded');}
    write('output.svg',candidate,0o400);published={path:`${jobRelative}/output.svg`,sha256:sha256(candidate),width:verdict.width,height:verdict.height,shape_count:verdict.shape_count};outcome='success';
  }catch(error) {message=error.message;availability??=error.code==='ENOENT'?'unavailable':'invalid';}
  const result={kind:'pulse-primitive-svg-result',schema_version:'1.0',reservation_id:reservation,operation_id:pending.operation_id,brief_id:pending.brief_id,outcome,availability,error:message,request_sha256:pending.request.sha256,params_sha256:params?objectDigest(params):null,params,source_commit:PRIMITIVE_COMMIT,processes:processRecords,published_svg:published,quarantined_output:quarantine,elapsed_ms:Math.round(performance.now()-began),completed_at:new Date().toISOString(),artifacts:[...artifacts],promotion_eligible:false};
  json('result.json',result);const finish={event:'finish',reservation_id:reservation,outcome,artifacts:[...artifacts]};
  fs.writeFileSync(path.join(job,'finish-event.json'),JSON.stringify(finish,null,2)+'\n',{flag:'wx',mode:0o600});
  return {ok:outcome==='success',outcome,result_path:`${jobRelative}/result.json`,finish_event_path:`${jobRelative}/finish-event.json`,published_svg:published,needs_owner_settlement:true,promotion_eligible:false};
}

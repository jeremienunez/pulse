import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {creativeStatus} from './pulse-creative-session.mjs';
import {imageSize,safeId,safePath} from './pulse-creative-evidence.mjs';
import {sha256,objectDigest} from './pulse-skill-evidence.mjs';
import {runThreadingCdp} from './pulse-threading-cdp.mjs';

export const THREADING_COMMIT='ef93733b28248340958c5843b5d882e6f4f5fef1';
const LOCK=fileURLToPath(new URL('../../skills/visual-assets/references/threading-source-lock.json',import.meta.url));
const CHECKER=fileURLToPath(new URL('./pulse-threading-svg-check.py',import.meta.url));
const ROOT=fileURLToPath(new URL('../../',import.meta.url)).replace(/\/$/,'');
const HASH=/^sha256:[a-f0-9]{64}$/;
const need=(ok,message)=>{if(!ok)throw Error(message);};
const text=v=>typeof v==='string'&&v.trim().length>0;
function keys(v,fields){need(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===fields.length&&fields.every(k=>Object.hasOwn(v,k)),'Invalid fields: '+fields.join(','));}
// These small private file protections follow the existing Primitive adapter.
function absolute(file){need(typeof file==='string'&&path.isAbsolute(file)&&path.normalize(file)===file,'Normalized absolute path required');let current=path.parse(file).root;for(const part of file.slice(current.length).split('/')){if(!part)continue;current=path.join(current,part);need(!fs.lstatSync(current).isSymbolicLink(),'Symlink path forbidden');}return file;}
function read(file,max=2*1024*1024){const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);try{const s=fs.fstatSync(fd);need(s.isFile()&&s.size<=max,'File type/size exceeds bound');const b=fs.readFileSync(fd);need(b.length<=max,'File grew beyond bound');return b;}finally{fs.closeSync(fd);}}
function hashFile(file){absolute(file);const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW),h=createHash('sha256'),b=Buffer.alloc(65536);try{const s=fs.fstatSync(fd);need(s.isFile()&&s.size<=1024*1024*1024,'Executable size/type invalid');let n,total=0;while((n=fs.readSync(fd,b,0,b.length,null))){total+=n;need(total<=1024*1024*1024,'Executable grew beyond bound');h.update(b.subarray(0,n));}return 'sha256:'+h.digest('hex');}finally{fs.closeSync(fd);}}
function inside(root,relative,parents=false){need(safePath(relative),'Unsafe artifact path');let current=root;const parts=relative.split('/');for(let i=0;i<parts.length;i++){current=path.join(current,parts[i]);let s=fs.lstatSync(current,{throwIfNoEntry:false});if(!s&&parents&&i<parts.length-1){fs.mkdirSync(current,{mode:0o700});s=fs.lstatSync(current);}if(s)need(!s.isSymbolicLink()&&(i===parts.length-1||s.isDirectory()),'Symlink/non-directory artifact path');else need(i===parts.length-1,'Missing artifact parent');}return current;}
function below(root,file){return file===root||file.startsWith(root+path.sep);}
function cleanupConfirmed(c){return c?.process_reaped===true&&c.process_group_gone===true&&c.server_closed===true&&c.websocket_closed===true&&Array.isArray(c.owned_processes)&&c.owned_processes.length===0&&Number.isInteger(c.elapsed_ms)&&c.elapsed_ms>=0&&c.elapsed_ms<=1000;}

function profileData(file,options={}){
  need(process.platform==='linux'&&process.arch==='x64'&&process.version==='v24.15.0'&&typeof WebSocket==='function','Required Linux x64 Node24.15.0/WebSocket capability unavailable');
  const profileBytes=read(absolute(file)),p=JSON.parse(profileBytes),lockBytes=options.sourceLockBytes??read(LOCK),lock=JSON.parse(lockBytes);
  keys(p,['kind','schema_version','platform','arch','source','chrome','python']);keys(p.source,['root','source_commit','lock_sha256']);
  need(p.kind==='pulse-threading-local-profile'&&p.schema_version==='1.0'&&p.platform==='linux'&&p.arch==='x64','Profile identity invalid');
  need(lock.kind==='pulse-threading-source-lock'&&lock.schema_version==='1.0'&&lock.upstream.commit===THREADING_COMMIT&&p.source.source_commit===THREADING_COMMIT&&p.source.lock_sha256===sha256(lockBytes),'Source lock/commit differs');
  const sourceRoot=absolute(p.source.root);need(fs.statSync(sourceRoot).isDirectory()&&!below(ROOT,sourceRoot),'External source directory required');
  for(const name of ['chrome','python']){keys(p[name],['path','sha256','version']);need(HASH.test(p[name].sha256)&&hashFile(p[name].path)===p[name].sha256,'Executable changed: '+name);fs.accessSync(p[name].path,fs.constants.X_OK);}
  need(p.chrome.version==='Google Chrome 155.0.8059.79'&&text(p.python.version),'Unsupported runtime version');
  need(Array.isArray(lock.required_files)&&lock.required_files.length>0&&(options.sourceLockBytes||lock.required_files.length===20),'Required source list invalid');
  const sourceFiles=lock.required_files.map(row=>{need(safePath(row.path)&&Number.isInteger(row.bytes)&&row.bytes>0&&HASH.test(row.sha256)&&typeof row.served==='boolean','Source lock row invalid');const b=read(absolute(path.join(sourceRoot,row.path)));need(b.length===row.bytes&&sha256(b)===row.sha256,'Source bytes changed: '+row.path);return {...row,bytes:b};});
  need(new Set(sourceFiles.map(f=>f.path)).size===sourceFiles.length,'Duplicate locked source path');
  return {profile:p,profileBytes,profile_sha256:sha256(profileBytes),lock,lockBytes,sourceFiles,fixture:!!options.sourceLockBytes};
}
export function inspectThreadingProfile(file,options={}){
  try{const p=profileData(file,options);return {kind:'pulse-threading-availability',schema_version:'1.0',status:'available',profile_sha256:p.profile_sha256,source_commit:THREADING_COMMIT,source_lock_sha256:sha256(p.lockBytes),fixture:p.fixture,execution_performed:false};}
  catch(e){return {kind:'pulse-threading-availability',schema_version:'1.0',status:e.code==='ENOENT'||e.message.includes('capability unavailable')?'unavailable':'invalid',error:e.message,execution_performed:false};}
}
export function validateThreadingJob(r,pending,manifest){
  keys(r,['kind','schema_version','operation_id','brief_id','purpose','profile_sha256','input','params','deadline_ms']);
  need(r.kind==='pulse-threading-svg-job'&&r.schema_version==='1.0'&&r.operation_id===pending.operation_id&&r.brief_id===pending.brief_id&&HASH.test(r.profile_sha256),'Job identity differs');
  if(r.purpose==='capability-probe')need(r.brief_id==='global'&&pending.phase==='inspection','Capability probe requires global inspection');
  else{need(r.purpose==='creative-variant'&&['generation','correction'].includes(pending.phase),'Creative variant requires admitted generation/correction');const b=manifest.assets.briefs.value.cases.find(b=>b.id===r.brief_id);need(b&&['visual','product-ux'].includes(b.terrain),'Visual brief required');}
  keys(r.input,['path','sha256','media_type','rights_basis']);need(safePath(r.input.path)&&r.input.path.startsWith(r.brief_id+'/')&&HASH.test(r.input.sha256)&&['image/png','image/jpeg'].includes(r.input.media_type)&&text(r.input.rights_basis)&&r.input.rights_basis.length<=2000,'Input identity/permission invalid');
  const p=r.params;keys(p,['shape','pegs','quality','mode','invert_colors','lines','opacity','thickness','display_pegs','show_indicators','blur']);
  for(const [key,low,high,step] of [['pegs',150,350,10],['lines',500,2500,500],['opacity',1,5,1]])need(Number.isInteger(p[key])&&p[key]>=low&&p[key]<=high&&(p[key]-low)%step===0,'Parameter outside grid: '+key);
  need([0,1].includes(p.shape)&&Number.isInteger(p.shape)&&p.quality===1&&p.mode===0&&p.invert_colors===false&&p.blur===0&&p.show_indicators===true&&typeof p.display_pegs==='boolean'&&[0.25,0.5,0.75,1].includes(p.thickness),'Unsupported parameter profile');
  need(Number.isInteger(r.deadline_ms)&&r.deadline_ms>=1&&r.deadline_ms<=60000,'Deadline outside bounds');return p;
}

export async function runThreadingSvg({session,reservation,profile},options={}){
  const began=performance.now(),root=absolute(session),status=creativeStatus(root),pending=status.pending;
  need(status.status==='active'&&!status.finalized&&pending?.reservation_id===reservation&&pending.resource==='tool'&&pending.units===1,'Matching active one-unit tool reservation required');
  need(safeId(pending.brief_id)&&safeId(pending.operation_id),'Pending identity invalid');
  const remaining=status.budget.global_active_ms-status.active_ms-(Date.now()-pending.at);need(Date.now()>=pending.at&&remaining>0,'Active budget expired');
  const request=read(inside(root,pending.request.path));need(sha256(request)===pending.request.sha256,'Admitted request changed');
  const manifest=JSON.parse(read(path.join(root,'session.json'))).manifest,fixture=!!(options.transport||options.sourceLockBytes);
  need(!fixture||manifest.execution_kind==='fixture','Injected fixture transport/lock cannot serve a native session');
  const relative=`${pending.brief_id}/threading/${pending.operation_id}`,directory=inside(root,relative,true);fs.mkdirSync(directory,{mode:0o700});
  const write=(name,b)=>fs.writeFileSync(inside(directory,name,true),Buffer.isBuffer(b)?b:Buffer.from(typeof b==='string'?b:JSON.stringify(b,null,2)+'\n'),{flag:'wx',mode:0o600});
  let outcome='error',error=null,availability=null,transport=null,transportStarted=false,output=null,job=null,profileHash=null,lockHash=null,checker=null,deadline=began+Math.min(60000,remaining);
  write('claim.json',{operation_id:pending.operation_id,brief_id:pending.brief_id,reservation_id:reservation,request_sha256:pending.request.sha256,pid:process.pid,claimed_at:new Date().toISOString(),execution_kind:fixture?'fixture':manifest.execution_kind});write('request.json',request);
  try{
    job=JSON.parse(request);validateThreadingJob(job,pending,manifest);deadline=Math.min(deadline,began+job.deadline_ms);
    const data=profileData(profile,options);availability={status:'available',execution_performed:false};profileHash=data.profile_sha256;lockHash=sha256(data.lockBytes);
    need(job.profile_sha256===profileHash,'Admitted profile changed');need(!below(manifest.owner,data.profile.source.root),'Source must remain outside owner checkout');
    write('profile.json',data.profileBytes);write('source-lock.json',data.lockBytes);for(const f of data.sourceFiles)write('source/'+f.path,f.bytes);
    const inputBytes=read(inside(root,job.input.path),2*1024*1024),size=imageSize(inputBytes);need(sha256(inputBytes)===job.input.sha256,'Admitted input changed');
    need(size.width>=64&&size.width<=1024&&size.height>=64&&size.height<=1024&&size.width*size.height<=1048576&&size.width/size.height>=0.25&&size.width/size.height<=4,'Input dimensions outside bounds');
    need((job.input.media_type==='image/png')===inputBytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),'Input media differs');
    const inputName=job.input.media_type==='image/png'?'input.png':'input.jpeg';write(inputName,inputBytes);const checkerBytes=read(CHECKER);write('checker.py',checkerBytes);write('params.json',job.params);
    write('adapter-code.json',{runner_sha256:sha256(read(fileURLToPath(import.meta.url))),transport_sha256:sha256(read(fileURLToPath(new URL('./pulse-threading-cdp.mjs',import.meta.url)))),checker_sha256:sha256(checkerBytes)});
    write('node-runtime.json',{path:process.execPath,sha256:hashFile(process.execPath),version:process.version,versions:process.versions,websocket:typeof WebSocket});
    const left=()=>{const n=Math.floor(deadline-performance.now());need(n>0,'Threading deadline expired');return n;};
    const pythonVersion=execFileSync(data.profile.python.path,['-I','-S','--version'],{encoding:'utf8',timeout:left(),maxBuffer:65536,env:{PATH:'/usr/bin:/bin',LANG:'C.UTF-8'}}).trim();need(pythonVersion===data.profile.python.version,'Executed Python version changed');write('python-runtime.json',{...data.profile.python,executed_version:pythonVersion});
    const validateSvg=async(svg,ms)=>{need(Buffer.isBuffer(svg)&&svg.length>0&&svg.length<=1048576,'SVG size/type invalid');const candidate=path.join(directory,'candidate.svg');if(!fs.existsSync(candidate))write('candidate.svg',svg);else need(read(candidate,1048576).equals(svg),'Candidate bytes changed');need(sha256(read(path.join(directory,'checker.py')))===sha256(checkerBytes),'Checker snapshot changed');const checked=spawnSync(data.profile.python.path,['-I','-S',path.join(directory,'checker.py'),candidate,path.join(directory,'params.json')],{encoding:'utf8',timeout:Math.min(left(),ms),maxBuffer:65536,env:{PATH:'/usr/bin:/bin',LANG:'C.UTF-8'}});let verdict;try{verdict=JSON.parse(checked.stdout);}catch{verdict={ok:false,error:checked.error?.message??'Checker returned no valid verdict'};}checker=verdict;write('svg-check.json',verdict);need(checked.status===0&&verdict.ok===true&&verdict.svg_sha256===sha256(svg),'SVG verdict differs');return verdict;};
    left();transportStarted=true;transport=await (options.transport??runThreadingCdp)({directory,profile:data.profile,lock:data.lock,sourceFiles:data.sourceFiles,input:{path:path.join(directory,inputName),sha256:job.input.sha256,bytes:inputBytes.length,...size},params:job.params,deadline,validateSvg});
    outcome=transport.outcome;need(['success','error','timeout','uncertain'].includes(outcome),'Transport outcome invalid');
    need(cleanupConfirmed(transport.cleanup),'Transport cleanup unconfirmed');
    if(outcome!=='success')throw Error(transport.error??'Threading transport failed');
    const u=transport.upload,d=transport.download;need(u?.acknowledged&&u.input_sha256===job.input.sha256&&u.decoded?.width===size.width&&u.decoded.height===size.height&&u.epoch===1&&u.first_segments<job.params.lines&&u.segments===job.params.lines&&u.pegs===job.params.pegs&&objectDigest(u.params)===objectDigest(job.params),'Upload/parameters/count proof invalid');
    const complete=Array.isArray(d?.progress)?d.progress.filter(p=>p.state==='completed'&&p.guid===d.begin?.guid):[];
    need(text(d?.expected_frame_id)&&d?.begin?.frameId===d.expected_frame_id&&d.begin.suggestedFilename==='image-as-threading.svg'&&d.begin.url.startsWith('blob:'+d.origin+'/')&&/^[a-f0-9-]{36}$/.test(d.begin.guid)&&complete.length===1&&complete[0].receivedBytes===transport.svg.length&&complete[0].totalBytes===transport.svg.length&&d.bytes===transport.svg.length&&d.sha256===sha256(transport.svg),'Download proof invalid');
    need(transport.upload_attempts===1&&transport.download_clicks===1,'Repeated upload/export attempt');
    need(checker?.ok&&checker.svg_sha256===sha256(transport.svg),'Validated candidate missing');left();need(read(path.join(directory,'candidate.svg'),1048576).equals(transport.svg),'Native candidate changed');write('output.svg',transport.svg);output={path:relative+'/output.svg',sha256:sha256(transport.svg),bytes:transport.svg.length};
  }catch(e){error={code:'THREADING_FAILED',message:e.message};if((transportStarted&&!transport)||(transport&&!cleanupConfirmed(transport.cleanup)))outcome='uncertain';else if(outcome==='success')outcome='error';if(performance.now()>=deadline&&outcome!=='uncertain')outcome='timeout';}
  const artifacts=[];function collect(folder,prefix=''){for(const entry of fs.readdirSync(folder,{withFileTypes:true})){if(!prefix&&entry.name==='browser-work')continue;const rel=prefix+entry.name,file=path.join(folder,entry.name);need(!entry.isSymbolicLink(),'Unexpected proof symlink');if(entry.isDirectory())collect(file,rel+'/');else if(entry.isFile())artifacts.push({path:relative+'/'+rel,sha256:sha256(read(file,4*1024*1024))});}}collect(directory);
  const result={kind:'pulse-threading-svg-result',schema_version:'1.0',outcome,error,availability,execution_kind:fixture?'fixture':manifest.execution_kind,reservation_id:reservation,operation_id:pending.operation_id,brief_id:pending.brief_id,source_commit:THREADING_COMMIT,request_sha256:pending.request.sha256,profile_sha256:profileHash,source_lock_sha256:lockHash,params_digest:job?.params!==undefined?objectDigest(job.params):null,input_sha256:job?.input?.sha256??null,published_svg:output,checker,upload:transport?.upload??null,download:transport?.download??null,runtime:{browser:transport?.browser??null,node:process.version},processes:transport?.cleanup??null,duration_ms:Math.round(performance.now()-began),artifacts,promotion_eligible:false,needs_owner_settlement:true};
  write('result.json',result);artifacts.push({path:relative+'/result.json',sha256:sha256(read(path.join(directory,'result.json')))});
  const receipt={event:'finish',reservation_id:reservation,outcome,artifacts};write('finish-event.json',receipt);return {...result,proposed_receipt:receipt};
}

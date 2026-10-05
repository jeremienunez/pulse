#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import { spawn,spawnSync } from 'node:child_process';
import { randomUUID,timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readCycle,reserveAttempt } from './pulse-skill-iteration.mjs';
import { ACTION_TOOLS,ACTION_INSTRUCTIONS,actionRunnerPacket,prepareActionEvidence } from './lib/pulse-skill-action-evidence.mjs';
import { sha256,objectDigest,sameValue } from './lib/pulse-skill-evidence.mjs';
import { FIXTURE_TOOLS,createControlledFixture,runFixtureProgram,validateOperation } from './lib/pulse-controlled-fixture.mjs';

const SELF=fileURLToPath(import.meta.url), LIMIT=262144;
const NATIVE_AUTHORIZED=Symbol('owner-verified-native-attempt');
const json=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const save=(file,value)=>fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n',{flag:'wx'});
const id=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(value);
const equalSecret=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));

export function projectRequest(payload,packet) {
  if (payload.model!=='gpt-6.1-sol'||payload.reasoning?.effort!=='low'||!Array.isArray(payload.input)) throw new Error('Unexpected model/profile/input.');
  const history=payload.input.filter(item=>['function_call','function_call_output','reasoning'].includes(item.type)||item.type==='message'&&item.role==='assistant');
  for (const item of history) {
    if(item.type==='function_call') {if(!ACTION_TOOLS.includes(item.name)||item.namespace!=null)throw new Error('Foreign conversation tool.');validateOperation(item.name,JSON.parse(item.arguments));}
    if(item.type==='function_call_output'&&!id(item.call_id))throw new Error('Foreign conversation result.');
  }
  // Replace native orchestration context, not the frozen guidance in packet.
  // Every effective byte is preserved by the parent before transmission.
  const projected={...payload,instructions:ACTION_INSTRUCTIONS,input:[
    {type:'additional_tools',role:'developer',tools:FIXTURE_TOOLS.map(({inputSchema,...s})=>({...s,parameters:inputSchema,strict:true}))},
    {type:'message',role:'user',content:[{type:'input_text',text:packet.request}]},...history]};
  delete projected.tools;return projected;
}

function validateItem(item,argumentsComplete=true) {
  if(!item||!id(item.id))throw new Error('Invalid response item identity.');
  if(item.type==='function_call') {
    if(!id(item.call_id)||!ACTION_TOOLS.includes(item.name)||item.namespace!=null)throw new Error('Forbidden response operation.');
    if(argumentsComplete) validateOperation(item.name,JSON.parse(item.arguments));
  } else if(item.type==='message') {
    if(item.role!=='assistant'||!Array.isArray(item.content)||item.content.some(c=>!['output_text','refusal'].includes(c.type)||typeof (c.text??c.refusal)!=='string'))throw new Error('Unknown response content.');
  } else if(item.type==='reasoning') {
    if(!Array.isArray(item.summary)||item.summary.some(s=>s.type!=='summary_text'||typeof s.text!=='string'))throw new Error('Unknown reasoning item.');
  } else throw new Error('Unknown response item type.');
}

const EVENTS=new Set(['response.created','response.in_progress','response.output_item.added','response.output_item.done','response.content_part.added','response.content_part.done','response.output_text.delta','response.output_text.done','response.function_call_arguments.delta','response.function_call_arguments.done','response.reasoning_summary_part.added','response.reasoning_summary_part.done','response.reasoning_summary_text.delta','response.reasoning_summary_text.done','response.completed']);
export function admitResponse(body) {
  if(typeof body!=='string'||Buffer.byteLength(body)>LIMIT)throw new Error('Response size exceeded.');
  let response;
  if(body.trimStart().startsWith('{'))response=JSON.parse(body);
  else {
    const blocks=body.replaceAll('\r\n','\n').split('\n\n').filter(b=>b.trim());let complete=0;const added=new Map(),done=new Map();
    for(const block of blocks) {
      const data=block.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');
      if(!data)throw new Error('Unknown/empty stream event.');const event=JSON.parse(data);
      if(!EVENTS.has(event.type)||complete)throw new Error('Unknown or trailing stream event.');
      if(event.item)validateItem(event.item,event.type==='response.output_item.done');
      if(['response.output_item.added','response.output_item.done'].includes(event.type)) {
        const index=event.output_index;if(!Number.isInteger(index)||index<0||index>=64)throw new Error('Invalid stream item index.');
        if(event.type==='response.output_item.added'){if(added.has(index))throw new Error('Duplicate added stream item.');added.set(index,event.item);}
        else {
          const start=added.get(index);if(!start||done.has(index)||start.id!==event.item.id||start.type!==event.item.type||start.call_id!==event.item.call_id||start.name!==event.item.name)throw new Error('Changed or unowned completed stream item.');
          done.set(index,event.item);
        }
      }
      if(event.part&&!['output_text','refusal','summary_text'].includes(event.part.type))throw new Error('Unknown stream content part.');
      if(event.response?.output)for(const item of event.response.output)validateItem(item,event.type==='response.completed');
      if(event.type==='response.completed'){response=event.response;complete++;}
    }
    if(complete!==1||!body.endsWith('\n\n'))throw new Error('Incomplete response stream.');
    if(added.size!==done.size)throw new Error('Incomplete output item batch.');
    const items=[...done].sort(([a],[b])=>a-b);if(items.some(([index],position)=>index!==position))throw new Error('Missing stream item index.');
    const output=items.map(([,item])=>item);
    if(!Array.isArray(response?.output))throw new Error('Missing terminal output array.');
    if(response.output.length&&!sameValue(response.output,output))throw new Error('Terminal and completed stream items differ.');
    response={...response,output};
  }
  if(response?.status!=='completed'||!id(response.id)||!Array.isArray(response.output))throw new Error('Incomplete provider response.');
  const itemIds=new Set(),callIds=new Set();
  for(const item of response.output) {
    validateItem(item);if(itemIds.has(item.id)||item.call_id&&callIds.has(item.call_id))throw new Error('Duplicate response identity.');
    itemIds.add(item.id);if(item.call_id)callIds.add(item.call_id);
  }
  return response;
}
export function admittedSse(response) {
  const events=[{type:'response.created',response:{id:response.id,status:'in_progress',output:[]}}];
  response.output.forEach((item,i)=>events.push({type:'response.output_item.added',output_index:i,item},{type:'response.output_item.done',output_index:i,item}));
  events.push({type:'response.completed',response});return events.map(e=>`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
}

async function boundedBody(stream,limit=LIMIT) {
  const chunks=[];let size=0;
  try {for await(const chunk of stream){size+=chunk.length;if(size>limit)throw new Error('Transport byte limit exceeded.');chunks.push(chunk);}return Buffer.concat(chunks).toString('utf8');}
  catch(error){error.partial_body=Buffer.concat(chunks).toString('utf8');throw error;}
}
function requestJson(socketPath,nonce,route,value) {
  return new Promise((resolve,reject)=>{
    const body=JSON.stringify(value),request=http.request({socketPath,path:route,method:'POST',headers:{'x-pulse-owner':nonce,'content-type':'application/json','content-length':Buffer.byteLength(body)}},async response=>{
      try {const data=JSON.parse(await boundedBody(response,2*LIMIT));if(response.statusCode!==200)throw new Error(data.error??'Controller rejected request.');resolve(data);}catch(e){reject(e);}
    });request.on('error',reject);request.end(body);
  });
}

// This trusted transport process runs inside the client network namespace.
// Only the parent has the fixture handlers and an upstream connection.
async function clientMain(contextFile) {
  const ctx=json(contextFile),rpc=(route,data)=>requestJson(ctx.socket,ctx.nonce,route,data),sockets=new Set();
  const proxy=http.createServer(async(req,res)=>{
    try {
      if(req.method==='GET') {
        const result=await rpc('/discovery',{path:req.url,headers:req.headers});res.writeHead(result.status,result.headers);res.end(result.body);return;
      }
      if(req.method!=='POST'||!['/backend-api/codex/responses','/responses'].includes(req.url)) {res.writeHead(403);res.end();return;}
      if(req.headers['content-encoding'])throw new Error('Unexpected request compression.');
      const payload=JSON.parse(await boundedBody(req,2*LIMIT));
      const result=await rpc('/model',{payload,headers:req.headers});
      res.writeHead(result.status,{'content-type':result.status===200?'text/event-stream':'application/json','connection':'close'});res.end(result.body);
    } catch {res.writeHead(502,{'connection':'close'});res.end('controller rejected request');}
  });
  const secureContext=tls.createSecureContext({cert:fs.readFileSync(ctx.cert),key:fs.readFileSync(ctx.key)});
  proxy.on('connect',(req,socket)=>{
    if(req.url!=='chatgpt.com:443'){socket.end('HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n');return;}
    socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    const secure=new tls.TLSSocket(socket,{isServer:true,secureContext});secure.on('error',()=>socket.destroy());proxy.emit('connection',secure);
  });
  proxy.on('upgrade',(_req,socket)=>socket.end('HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n'));
  proxy.on('connection',s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));});
  await new Promise(resolve=>proxy.listen(0,'127.0.0.1',resolve));
  const proxyUrl=`http://127.0.0.1:${proxy.address().port}`,env={...process.env};
  for(const name of Object.keys(env))if(/PROXY|API_KEY|ACCESS_TOKEN/i.test(name))delete env[name];
  Object.assign(env,{HTTPS_PROXY:proxyUrl,HTTP_PROXY:proxyUrl,NO_PROXY:'127.0.0.1,localhost',CODEX_CA_CERTIFICATE:ctx.ca});delete env.CODEX_APP_SERVER_CHATGPT_BASE_URL;
  const argv=['app-server','--stdio','-c',`model_catalog_json=${JSON.stringify(ctx.catalog)}`,'-c',`sqlite_home=${JSON.stringify(path.join(ctx.root,'state'))}`,'-c',`log_dir=${JSON.stringify(path.join(ctx.root,'logs'))}`,'-c','history.persistence="none"','-c','web_search="disabled"'];
  for(const feature of ['enable_request_compression','apps','plugins','remote_plugin','memories','hooks','goals','multi_agent','multi_agent_v2'])argv.push('--disable',feature);
  for(const name of ctx.mcp)argv.push('-c',`mcp_servers.${name}.enabled=false`);
  const provider=ctx.mode==='fixture'?'pulse-fixture':'openai';
  if(ctx.mode==='fixture')argv.push('-c',`model_providers.pulse-fixture={name="Scripted fixture",base_url="${proxyUrl}",wire_api="responses",requires_openai_auth=false,request_max_retries=0,stream_max_retries=0}`);
  const child=spawn(ctx.codex,argv,{cwd:ctx.root,env,stdio:['pipe','pipe','pipe']});
  const send=message=>child.stdin.write(JSON.stringify(message)+'\n');let pending='',stderr='',response='',threadId=null,turnId=null,finished=false;
  const stop=()=>{if(finished)return;finished=true;child.kill('SIGTERM');};
  // The parent owns the execution clock, starting at effective forwarding.
  // This fallback bounds setup plus shutdown; it does not grade model latency.
  const timer=setTimeout(stop,30000+ctx.deadlineMs+5000);
  child.stderr.on('data',b=>{if(stderr.length<LIMIT)stderr+=b.toString();});
  const loop=async()=>{
    for await(const bytes of child.stdout) {
      pending+=bytes.toString();if(Buffer.byteLength(pending)>2*LIMIT)throw new Error('RPC output limit.');
      let split;
      while((split=pending.indexOf('\n'))>=0) {
        const line=pending.slice(0,split);pending=pending.slice(split+1);if(!line)continue;const message=JSON.parse(line);
        if(message.error)throw new Error('App Server RPC failure.');
        if(message.id===1&&message.result) {
          send({method:'initialized'});
          send({id:2,method:'thread/start',params:{ephemeral:true,cwd:ctx.root,model:'gpt-6.1-sol',modelProvider:provider,allowProviderModelFallback:false,approvalPolicy:'never',sandbox:'read-only',baseInstructions:ACTION_INSTRUCTIONS,dynamicTools:FIXTURE_TOOLS,config:{model_reasoning_effort:'low'}}});
        } else if(message.id===2&&message.result) {
          threadId=message.result.thread.id;await rpc('/identity',{threadId});
          send({id:3,method:'turn/start',params:{threadId,input:[{type:'text',text:ctx.packet.request}],model:'gpt-6.1-sol',effort:'low'}});
        } else if((message.id===3&&message.result?.turn)||message.method==='turn/started') {
          turnId=(message.result?.turn??message.params.turn).id;await rpc('/identity',{threadId,turnId});
        } else if(message.method==='item/tool/call') {
          const result=await rpc('/call',message.params);send({id:message.id,result:{contentItems:[{type:'inputText',text:JSON.stringify(result)}],success:!result.rejected}});
        } else if(message.method==='item/agentMessage/delta')response+=message.params.delta;
        else if(message.method==='item/completed'&&message.params.item.type==='agentMessage')response=message.params.item.text;
        else if(message.method==='turn/completed') {await rpc('/terminal',{status:message.params.turn.status,response});stop();}
      }
    }
  };
  send({id:1,method:'initialize',params:{clientInfo:{name:'pulse-controlled-actions',version:'1.0'},capabilities:{experimentalApi:true}}});
  try {await loop();}catch {await rpc('/client-error',{reason:'rpc-or-controller-error'}).catch(()=>{});stop();}
  finally {clearTimeout(timer);child.kill('SIGTERM');const killer=setTimeout(()=>child.kill('SIGKILL'),1000);if(child.exitCode===null)await new Promise(resolve=>child.once('close',resolve));clearTimeout(killer);for(const socket of sockets)socket.destroy();await new Promise(resolve=>proxy.close(resolve));await rpc('/closed',{code:child.exitCode}).catch(()=>{});}
}

function runtimeRecipe(root,mode) {
  const run=(command,args)=>{const result=spawnSync(command,args,{encoding:'utf8',maxBuffer:4*LIMIT});if(result.status!==0)throw new Error(`Runtime preparation failed: ${command}`);return result.stdout;};
  const codex=run('which',['codex']).trim(),launcher=fs.realpathSync(codex);
  const native=path.resolve(path.dirname(launcher),'../node_modules/@openai/codex-linux-x64/vendor/x86_64-unknown-linux-musl/bin/codex');
  const hashes={driver:sha256(fs.readFileSync(SELF)),fixture:sha256(fs.readFileSync(new URL('./lib/pulse-controlled-fixture.mjs',import.meta.url))),
    cycle:sha256(fs.readFileSync(new URL('./pulse-skill-iteration.mjs',import.meta.url))),evidence:sha256(fs.readFileSync(new URL('./lib/pulse-skill-action-evidence.mjs',import.meta.url))),
    launcher:sha256(fs.readFileSync(launcher)),native:sha256(fs.readFileSync(native))};
  const configRoot=process.env.CODEX_HOME??path.join(os.homedir(),'.codex'),configFile=path.join(configRoot,'config.toml');
  const mcp=JSON.parse(run('python3',['-c',"import json,tomllib,sys;print(json.dumps(list(tomllib.load(open(sys.argv[1],'rb')).get('mcp_servers',{}))))",configFile]));
  if(mcp.some(name=>!/^[A-Za-z0-9_-]+$/.test(name)))throw new Error('Unsupported MCP configuration name.');
  const catalog=path.join(root,'catalog.json');fs.writeFileSync(catalog,run(codex,['debug','models','--bundled']));hashes.catalog=sha256(fs.readFileSync(catalog));hashes.configuration=sha256(fs.readFileSync(configFile));hashes.worker_node=sha256(fs.readFileSync('/usr/bin/node'));
  const version=run(codex,['--version']).trim();
  const temp=path.join(root,'cli-tmp');fs.mkdirSync(temp);const installation=path.join(root,'installation-id');fs.copyFileSync(path.join(configRoot,'installation_id'),installation);
  const ca=path.join(root,'ca.crt'),key=path.join(root,'server.key'),cert=path.join(root,'server.crt');
  run('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',path.join(root,'ca.key'),'-out',ca,'-days','1','-subj','/CN=Pulse Temporary Controller','-addext','basicConstraints=critical,CA:TRUE']);
  run('openssl',['req','-new','-newkey','rsa:2048','-nodes','-keyout',key,'-out',path.join(root,'server.csr'),'-subj','/CN=chatgpt.com']);
  const extensions=path.join(root,'server.ext');fs.writeFileSync(extensions,'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:chatgpt.com\n');
  run('openssl',['x509','-req','-in',path.join(root,'server.csr'),'-CA',ca,'-CAkey',path.join(root,'ca.key'),'-CAcreateserial','-out',cert,'-days','1','-extfile',extensions]);
  fs.chmodSync(key,0o600);fs.chmodSync(path.join(root,'ca.key'),0o600);
  const authFile=path.join(configRoot,'auth.json'),auth=mode==='fixture'?null:json(authFile);
  if(mode!=='fixture'&&(auth.auth_mode!=='chatgpt'||!auth.tokens?.access_token))throw new Error('Native ChatGPT authentication is required.');
  return {codex,configRoot,catalog,mcp,hashes,version,temp,installation,ca,key,cert,authFile,auth};
}

function upstream(pathname,method,headers,body='',signal) {
  return new Promise((resolve,reject)=>{
    const safe=Object.fromEntries(Object.entries(headers).filter(([key])=>!['host','connection','proxy-connection','proxy-authorization','transfer-encoding','content-length','accept-encoding'].includes(key.toLowerCase())));
    if(body)safe['content-length']=Buffer.byteLength(body);
    const request=https.request({hostname:'chatgpt.com',path:pathname,method,headers:safe,timeout:method==='GET'?7000:120000,signal},async response=>{
      try {const text=await boundedBody(response,method==='GET'?2*LIMIT:LIMIT);resolve({status:response.statusCode,headers:{'content-type':response.headers['content-type']??'application/json'},body:text});}catch(e){reject(e);}
    });request.on('timeout',()=>request.destroy(new Error('Upstream timeout.')));request.on('error',reject);request.end(body);
  });
}

export function authorizeCall(params,identity,admitted) {
  if(params.namespace!=null||params.threadId!==identity.threadId||params.turnId!==identity.turnId)throw new Error('Foreign RPC identity.');
  const call=admitted.get(params.callId);
  if(!call||call.used||params.tool!==call.item.name||!sameValue(params.arguments,JSON.parse(call.item.arguments)))throw new Error('Unadmitted or duplicate RPC.');
  validateOperation(params.tool,params.arguments);call.used=true;return call;
}

export async function runAppServer({packet,fixture,mode='inspect',backend,deadlineMs=120000,authorization,expectedRuntimeHashes}) {
  if(!['inspect','native','fixture'].includes(mode)||mode==='fixture'&&typeof backend!=='function'||!Number.isInteger(deadlineMs)||deadlineMs<1||deadlineMs>120000)throw new Error('Invalid runner mode/bounds.');
  if(mode==='native'&&authorization!==NATIVE_AUTHORIZED)throw new Error('Native launch requires owner and correlated inspection.');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'pulse-action-transport-'));fs.chmodSync(root,0o700);
  const recipe=runtimeRecipe(root,mode),socket=path.join(root,'controller.sock'),nonce=randomUUID(),identity={},admitted=new Map(),seen=new Set(),requests=[],responses=[];
  if(expectedRuntimeHashes&&!sameValue(expectedRuntimeHashes,recipe.hashes))throw new Error('Inspected runtime preparation changed.');
  const authBefore=recipe.auth?sha256(fs.readFileSync(recipe.authFile)):null;
  const pendingCalls=new Set(),pendingModels=new Set(),upstreamAbort=new AbortController();let timer;
  let terminal=null,closed=false,failure=null,child=null,submittedAt=null,receivedAt=null,transportBytes=0;
  const reject=message=>{failure??=message;fixture.stop();upstreamAbort.abort();try {process.kill(-child.pid,'SIGKILL');}catch {}};
  const api=http.createServer(async(req,res)=>{
    try {
      if(!equalSecret(req.headers['x-pulse-owner'],nonce))throw new Error('Controller owner mismatch.');
      const data=JSON.parse(await boundedBody(req,3*LIMIT));
      let answer;
      if(req.url==='/discovery') {
        if(mode==='fixture'||data.path.split('?')[0]!=='/backend-api/wham/accounts/check'||!equalSecret(data.headers.authorization,'Bearer '+recipe.auth.tokens.access_token))answer={status:403,headers:{},body:''};
        else answer=await upstream(data.path,'GET',data.headers,'',upstreamAbort.signal);
      } else if(req.url==='/identity') {
        if(!id(data.threadId)||identity.threadId&&identity.threadId!==data.threadId||data.turnId&&(!id(data.turnId)||identity.turnId&&identity.turnId!==data.turnId))throw new Error('Changed runtime identity.');
        Object.assign(identity,data);answer={ok:true};
      } else if(req.url==='/model') {
        if(!identity.threadId||!identity.turnId||terminal||closed)throw new Error('Model request outside owned turn.');
        const projected=projectRequest(data.payload,packet),digest=objectDigest(projected);
        if(seen.has(digest))throw new Error('Duplicate provider submission; no automatic retry.');seen.add(digest);
        const bound=mode==='fixture'||equalSecret(data.headers.authorization,'Bearer '+recipe.auth.tokens.access_token)&&equalSecret(data.headers['chatgpt-account-id'],recipe.auth.tokens.account_id);
        if(!bound)throw new Error('Authentication binding mismatch.');
        requests.push({raw_sha256:objectDigest(data.payload),projected,projected_sha256:digest,authenticated:mode!=='fixture'&&bound,forwarded:mode==='native'});
        if(mode==='inspect')answer={status:400,body:JSON.stringify({error:{message:'Capture-only; model forwarding disabled'}})};
        else {
          if(!submittedAt){submittedAt=new Date().toISOString();clearTimeout(timer);timer=setTimeout(()=>reject('Model response timeout.'),deadlineMs);}
          let result;
          const operation=mode==='fixture'?new Promise((resolve,reject)=>{
            const aborted=()=>reject(new Error('Controller aborted.'));upstreamAbort.signal.addEventListener('abort',aborted,{once:true});
            Promise.resolve().then(()=>backend(projected)).then(body=>resolve({status:200,body}),reject).finally(()=>upstreamAbort.signal.removeEventListener('abort',aborted));
          }):upstream('/backend-api/codex/responses','POST',data.headers,JSON.stringify(projected),upstreamAbort.signal);
          pendingModels.add(operation);
          try {result=await operation;}
          catch(error){responses.push({body:error.partial_body??'',status:null,partial:true});throw error;}
          finally {pendingModels.delete(operation);}
          receivedAt=new Date().toISOString();
          transportBytes+=Buffer.byteLength(result.body);if(transportBytes>4*LIMIT)throw new Error('Attempt transport output limit.');responses.push({body:result.body,status:result.status});
          if(result.status!==200)throw new Error('Provider request failed; submission is not replayed.');
          const response=admitResponse(result.body);
          if(!response.output.some(item=>item.type==='function_call')){clearTimeout(timer);timer=setTimeout(()=>reject('Client closure timeout.'),5000);}
          for(const item of response.output)if(item.type==='function_call') {
            if(admitted.has(item.call_id))throw new Error('Provider reused call identity.');admitted.set(item.call_id,{item,used:false});
          }
          answer={status:200,body:admittedSse(response)};
        }
      } else if(req.url==='/call') {
        if(terminal||closed)throw new Error('Tool call after closure.');authorizeCall(data,identity,admitted);
        const operation=fixture.invoke(data.tool,data.arguments,{callId:data.callId});pendingCalls.add(operation);
        try {answer=await operation;}catch(error){answer={rejected:true,error:error.message};}finally {pendingCalls.delete(operation);}
        if(answer.stop_reason)throw new Error('Worker deadline/output limit.');
      } else if(req.url==='/terminal') {if(data.status==='completed'&&[...admitted.values()].some(c=>!c.used))throw new Error('Unobserved admitted tool call.');terminal=data;receivedAt??=new Date().toISOString();answer={ok:true};}
      else if(req.url==='/closed') {closed=true;answer={ok:true};}
      else if(req.url==='/client-error') {throw new Error('App Server or controller failed.');}
      else throw new Error('Unknown controller route.');
      res.writeHead(200,{'content-type':'application/json','connection':'close'});res.end(JSON.stringify(answer));
    } catch(error) {res.writeHead(409,{'content-type':'application/json','connection':'close'});res.end(JSON.stringify({error:error.message}));reject(error.message);}
  });
  await new Promise(resolve=>api.listen(socket,resolve));fs.chmodSync(socket,0o600);
  const context=path.join(root,'context.json');save(context,{root,socket,nonce,mode,packet,deadlineMs,codex:recipe.codex,catalog:recipe.catalog,mcp:recipe.mcp,ca:recipe.ca,key:recipe.key,cert:recipe.cert});
  const argv=['--unshare-all','--die-with-parent','--new-session','--ro-bind','/','/','--tmpfs','/tmp','--bind',root,root,'--bind',recipe.temp,path.join(recipe.configRoot,'tmp'),
    '--bind',recipe.installation,path.join(recipe.configRoot,'installation_id'),'--proc','/proc','--dev','/dev','--chdir',root,process.execPath,SELF,'__client',context];
  child=spawn('bwrap',argv,{detached:true,stdio:['ignore','pipe','pipe']});let output='';
  for(const stream of [child.stdout,child.stderr])stream.on('data',bytes=>{if(Buffer.byteLength(output)+bytes.length>LIMIT)reject('Client output limit.');else output+=bytes.toString();});
  timer=setTimeout(()=>reject('Preparation timeout.'),30000);
  await new Promise(resolve=>{child.on('error',error=>{failure=error.message;resolve();});child.on('close',resolve);});clearTimeout(timer);
  if(failure||terminal?.status!=='completed'){fixture.stop();upstreamAbort.abort();}await Promise.allSettled([...pendingCalls,...pendingModels]);
  await new Promise(resolve=>api.close(resolve));
  if(recipe.auth)for(const value of Object.values(recipe.auth.tokens))if(typeof value==='string'&&value)output=output.replaceAll(value,'[redacted]');
  const result={root,mode,packet_sha256:packet.submitted_request_sha256,identity,requests,responses,terminal,closed,failure,submitted_at:submittedAt,received_at:receivedAt,
    process_reaped:true,quiescent:fixture.quiescent(),trace:structuredClone(fixture.trace),argv,stderr:output, runtime_hashes:recipe.hashes,runtime:recipe.version,auth_file_preserved:mode==='fixture'||sha256(fs.readFileSync(recipe.authFile))===authBefore};
  // Published records omit the transport recipe, credentials, TLS keys and nonce.
  return result;
}

async function probe(root) {
  const listener=http.createServer((_req,res)=>res.end());await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));
  const program=`import fs from 'node:fs';import net from 'node:net';import assert from 'node:assert/strict';assert.equal(fs.existsSync('/home'),false);assert.equal(fs.existsSync('/media'),false);assert.throws(()=>fs.writeFileSync('/workspace/.probe','x'));await new Promise((resolve,reject)=>{const s=net.connect(${listener.address().port},'127.0.0.1');s.once('error',resolve);s.once('connect',()=>{s.destroy();reject(Error('host network accessible'));});});console.log('isolated');`;
  try {const result=await runFixtureProgram(root,program);if(result.exit_code!==0||result.stdout.trim()!=='isolated'||!result.process_reaped)throw new Error('Effective worker policy unproven.');return result;}
  finally {await new Promise(resolve=>listener.close(resolve));}
}
function cycleInputs(cycle,caseId,conditionId='control') {
  const {manifest,state}=readCycle(cycle);if(manifest.evidence_mode!=='action')throw new Error('Action runner requires an action cycle.');
  const def=manifest.definitions.find(d=>d.case_id===caseId);if(!def)throw new Error('Unknown action case.');
  const condition=json(path.join(cycle,'conditions',`${conditionId}.json`));return {manifest,state,def,condition,packet:actionRunnerPacket(def,condition)};
}
export async function inspectActionRunner(cycle) {
  const data=readCycle(cycle);if(data.state.attempts.some(a=>a.status==='reserved'))throw new Error('Pending attempt blocks inspection.');
  const input=cycleInputs(cycle,data.manifest.definitions.find(d=>d.role==='repair').case_id);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pulse-action-inspect-')),fixture=createControlledFixture(path.join(dir,'fixture'),input.def,{attemptId:'inspection'});
  const sandbox=await probe(fixture.root),result=await runAppServer({packet:input.packet,fixture,mode:'inspect'});
  if(result.failure||!result.closed||!result.process_reaped||result.requests.length!==1||!result.requests[0].authenticated||result.requests[0].forwarded||!result.auth_file_preserved)throw new Error('Authenticated final-runner capture unproven.');
  const captureName=`capture-${randomUUID()}.json`;save(path.join(cycle,captureName),result);
  const inspection={kind:'pulse-action-runner-inspection',cycle_digest:input.manifest.digest,control_digest:input.manifest.control_digest,tools:[...ACTION_TOOLS],runtime_hashes:result.runtime_hashes,
    model_id:'gpt-6.1-sol',reasoning_effort:'low',model_version:null,model_forwarding:false,captured:true,capture_file:captureName,capture_sha256:sha256(fs.readFileSync(path.join(cycle,captureName))),sandbox,created_at:new Date().toISOString(),expires_at:new Date(Date.now()+10*60000).toISOString()};
  inspection.digest=objectDigest(inspection);const file=path.join(cycle,`inspection-${randomUUID()}.json`);save(file,inspection);return {inspection:file,ready:true,model_version:null,model_inferences:0};
}
export async function runActionCase(cycle,{caseId,conditionId='control',inspection:inspectionFile}) {
  const input=cycleInputs(cycle,caseId,conditionId),inspection=json(inspectionFile),{digest,...unsigned}=inspection;
  if(inspection.kind!=='pulse-action-runner-inspection'||objectDigest(unsigned)!==digest||inspection.cycle_digest!==input.manifest.digest||inspection.control_digest!==input.manifest.control_digest||!Number.isFinite(Date.parse(inspection.expires_at))||Date.parse(inspection.expires_at)<Date.now()||!inspection.captured||inspection.model_forwarding!==false||!sameValue(inspection.tools,ACTION_TOOLS)||!/^capture-[a-f0-9-]+\.json$/.test(inspection.capture_file))throw new Error('Fresh correlated runner inspection required before reservation.');
  const captureFile=path.join(cycle,inspection.capture_file);if(fs.lstatSync(captureFile).isSymbolicLink()||sha256(fs.readFileSync(captureFile))!==inspection.capture_sha256)throw new Error('Inspection capture changed.');
  const capture=json(captureFile);if(capture.mode!=='inspect'||capture.failure||!capture.closed||!capture.auth_file_preserved||capture.requests.length!==1||!capture.requests[0].authenticated||capture.requests[0].forwarded||!sameValue(capture.runtime_hashes,inspection.runtime_hashes))throw new Error('Inspection capture is not a complete authenticated binding.');
  if(inspection.model_version===null&&(conditionId!=='control'||input.state.calls>=5))throw new Error('Diagnostic profile permits at most five control attempts.');
  for(const [key,file] of Object.entries({driver:SELF,fixture:fileURLToPath(new URL('./lib/pulse-controlled-fixture.mjs',import.meta.url)),cycle:fileURLToPath(new URL('./pulse-skill-iteration.mjs',import.meta.url)),evidence:fileURLToPath(new URL('./lib/pulse-skill-action-evidence.mjs',import.meta.url))}))if(sha256(fs.readFileSync(file))!==inspection.runtime_hashes[key])throw new Error('Inspected runner code changed.');
  const native=path.resolve(path.dirname(fs.realpathSync(spawnSync('which',['codex'],{encoding:'utf8'}).stdout.trim())),'../node_modules/@openai/codex-linux-x64/vendor/x86_64-unknown-linux-musl/bin/codex');
  if(sha256(fs.readFileSync(native))!==inspection.runtime_hashes.native)throw new Error('Inspected native runtime changed.');
  const launcher=fs.realpathSync(spawnSync('which',['codex'],{encoding:'utf8'}).stdout.trim());
  if(sha256(fs.readFileSync(launcher))!==inspection.runtime_hashes.launcher||sha256(fs.readFileSync('/usr/bin/node'))!==inspection.runtime_hashes.worker_node||sha256(fs.readFileSync(path.join(process.env.CODEX_HOME??path.join(os.homedir(),'.codex'),'config.toml')))!==inspection.runtime_hashes.configuration)throw new Error('Inspected launcher/worker/configuration changed.');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pulse-action-case-')),fixture=createControlledFixture(path.join(dir,'fixture'),input.def,{attemptId:'preparation'});await probe(fixture.root);
  const reserved=reserveAttempt(cycle,{caseId,conditionId,requestDigest:input.packet.submitted_request_sha256});
  // The trace owner is fixed by reservation before any provider submission.
  const owned=createControlledFixture(path.join(dir,'owned-fixture'),input.def,{attemptId:reserved.attempt_id});
  let result;
  try {result=await runAppServer({packet:input.packet,fixture:owned,mode:'native',deadlineMs:input.manifest.budget.case_deadline_ms,authorization:NATIVE_AUTHORIZED,expectedRuntimeHashes:inspection.runtime_hashes});}
  catch(error){result={failure:error.message,closed:false,process_reaped:true,model_submitted:false,submitted_at:null,received_at:null};}
  const raw=path.join(cycle,'attempts',`${reserved.attempt_id}.capture.json`);save(raw,result);
  const envelope={attempt_id:reserved.attempt_id,submitted_request_sha256:input.packet.submitted_request_sha256,
    submitted_at:result.submitted_at??new Date().toISOString(),received_at:result.received_at??new Date().toISOString(),outcome:result.failure||!result.closed||result.terminal?.status!=='completed'?'provider-error':result.terminal.response?.trim()?'response':'no-response',capture_path:raw};
  if(envelope.outcome==='response') {
    const prepared=prepareActionEvidence({iteration:reserved.attempt_id,configPath:'controlled-action-runner-v1',sourcePath:input.manifest.corpus_digest,scenarios:[input.def],conditions:{[caseId]:input.condition}}),entry=prepared.evidence.scenarios[0];
    entry.response=result.terminal.response;entry.replay_id=reserved.attempt_id;entry.capture={attempt_id:reserved.attempt_id,submitted_request:input.packet.request,argv:result.argv,runtime_hashes:result.runtime_hashes,
      files_before:Object.fromEntries(input.def.fixture.files.map(f=>[f.path,f.content])),files_after:owned.snapshot(),trace:owned.trace,checks:await owned.privateChecks(),quiescent:owned.quiescent(),trace_complete:true,
      policy:{worker:'bubblewrap-readonly-no-network'},capabilities:{tools:[...ACTION_TOOLS]},profile_observation:{request:{model_id:result.requests[0].projected.model,reasoning_effort:result.requests[0].projected.reasoning.effort},response:{model_version:null,immutable_version:false},runtime:{id:result.runtime,native:result.runtime_hashes.native}}};
    prepared.evidence.runner={model_id:'gpt-6.1-sol',model_version:null,reasoning_effort:'low',runtime:result.runtime};
    prepared.evidence.provenance={profile_status:'verified',trace_status:'complete',model_version_is_immutable:false,profile_sources:Object.fromEntries(['model_id','reasoning_effort','runtime'].map(k=>[k,{source:'profile',quote:prepared.evidence.runner[k]}]))};
    envelope.preparation=prepared.manifest;envelope.evidence=prepared.evidence;
  }
  const file=path.join(cycle,'attempts',`${reserved.attempt_id}.judge-envelope.json`);save(file,envelope);return {attempt_id:reserved.attempt_id,envelope:file,outcome:envelope.outcome,needs_parent_judgment:envelope.outcome==='response'};
}

async function cli(args) {
  if(args[0]==='__client')return clientMain(args[1]);
  const command=args.shift(),options={};for(let i=0;i<args.length;i+=2){if(!['--cycle','--case-id','--condition-id','--inspection'].includes(args[i])||!args[i+1])throw new Error('Unknown or incomplete runner option.');options[args[i]]=args[i+1];}
  if(!options['--cycle'])throw new Error('--cycle is required.');
  if(command==='inspect')return inspectActionRunner(options['--cycle']);
  if(command==='run')return runActionCase(options['--cycle'],{caseId:options['--case-id'],conditionId:options['--condition-id']??'control',inspection:options['--inspection']});
  throw new Error('Runner commands: inspect | run.');
}
if(process.argv[1]&&path.resolve(process.argv[1])===SELF)cli(process.argv.slice(2)).then(result=>{if(result)console.log(JSON.stringify(result,null,2));}).catch(error=>{console.error(JSON.stringify({ok:false,error:error.message}));process.exitCode=1;});

#!/usr/bin/env node
import {inspectThreadingProfile,runThreadingSvg} from './lib/pulse-threading-svg.mjs';
const args=process.argv.slice(2),command=args.shift(),options={};
try{
  if(!['inspect','run'].includes(command))throw Error('Use inspect --profile <absolute-path> or run --session <path> --reservation <id> --profile <path>');
  while(args.length){const k=args.shift();if(!['--profile','--session','--reservation'].includes(k)||!args.length||Object.hasOwn(options,k.slice(2)))throw Error('Unknown, duplicate or missing option');options[k.slice(2)]=args.shift();}
  const required=command==='inspect'?['profile']:['profile','session','reservation'];if(Object.keys(options).length!==required.length||required.some(k=>!options[k]))throw Error('Explicit options required');
  const result=command==='inspect'?inspectThreadingProfile(options.profile):await runThreadingSvg(options);console.log(JSON.stringify(result,null,2));process.exitCode=(command==='inspect'?result.status==='available':result.outcome==='success')?0:1;
}catch(e){console.error(JSON.stringify({kind:'pulse-threading-svg-error',schema_version:'1.0',error:e.message,...(command==='inspect'?{execution_performed:false}:{needs_owner_settlement:true})}));process.exitCode=1;}

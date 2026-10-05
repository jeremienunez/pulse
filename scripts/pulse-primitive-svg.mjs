#!/usr/bin/env node
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {inspectPrimitiveProfile,runPrimitiveSvg} from './lib/pulse-primitive-svg.mjs';

async function cli(argv) {
  const command=argv.shift(),allowed=command==='inspect'?['--profile']:command==='run'?['--session','--reservation','--profile']:[];
  if(!allowed.length)throw new Error('Commands: inspect | run');
  const options={};
  for(let i=0;i<argv.length;i+=2) {if(!allowed.includes(argv[i])||!argv[i+1]||Object.hasOwn(options,argv[i].slice(2)))throw new Error('Unknown, duplicate or incomplete option');options[argv[i].slice(2)]=argv[i+1];}
  if(allowed.some(k=>!options[k.slice(2)]))throw new Error('Required options missing');
  const result=command==='inspect'?inspectPrimitiveProfile(options.profile):await runPrimitiveSvg(options);
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
  if(result.status==='invalid'||result.ok===false)process.exitCode=1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))cli(process.argv.slice(2)).catch(error=>{process.stdout.write(JSON.stringify({ok:false,error:error.message})+'\n');process.exitCode=1;});

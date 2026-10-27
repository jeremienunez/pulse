import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const hash = value => createHash('sha256').update(value).digest('hex');
function inspectDestination(target) {
  if (!path.isAbsolute(target) || path.resolve(target) !== target) throw new Error('An absolute normalized private destination is required.');
  let current = path.parse(target).root;
  for (const part of target.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    if (['.pulse', '.codex', '.claude', '.gemini', 'companion', 'compagnion'].includes(part.toLowerCase()) || fs.existsSync(path.join(current, '.git'))) throw new Error('Launcher configuration must stay outside repositories, ICM and native client profiles.');
    let stat; try { stat = fs.lstatSync(current); } catch (e) { if (e.code === 'ENOENT') continue; throw e; }
    if (!stat.isDirectory() || stat.isSymbolicLink() || ![0, process.getuid()].includes(stat.uid)) throw new Error('Configuration ancestors must be owned directories without symlinks.');
  }
  if (fs.existsSync(target)) { const stat = fs.lstatSync(target); if (stat.uid !== process.getuid() || stat.mode & 0o077) throw new Error('The configuration destination must be owned and private (0700).'); }
}

function launcherSource({ client, directory, program, alias, filename }) {
  return `#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
const program=${JSON.stringify(program)}, state=${JSON.stringify(directory)}, family=${JSON.stringify(client)}, alias=${JSON.stringify(alias)};
const self=fileURLToPath(import.meta.url), parent=path.dirname(self), manifestFile=path.join(parent,'pulse-launcher.json');
const args=process.argv.slice(2);
if(args.length===1&&args[0]==='--remove'){
  const stat=fs.lstatSync(manifestFile);
  if(stat.isSymbolicLink()||!stat.isFile()||stat.uid!==process.getuid()||(stat.mode&0o077))throw new Error('Foreign launcher manifest; nothing was removed.');
  let manifest;try{manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));}catch{throw new Error('Invalid launcher manifest; nothing was removed.');}
  if(!manifest||manifest.format!=='pulse-messaging-launcher/v1'||manifest.client!==family||manifest.program!==program||manifest.stateDirectory!==state||manifest.files?.length!==1||manifest.files[0].path!==${JSON.stringify(filename)})throw new Error('Foreign launcher manifest; nothing was removed.');
  const file=fs.lstatSync(self), digest=createHash('sha256').update(fs.readFileSync(self)).digest('hex');
  if(file.isSymbolicLink()||!file.isFile()||file.uid!==process.getuid()||digest!==manifest.files[0].sha256)throw new Error('The launcher was edited; nothing was removed.');
  fs.unlinkSync(self);fs.unlinkSync(manifestFile);
  if(fs.readdirSync(parent).length===0)fs.rmdirSync(parent);
  console.log(JSON.stringify({removed:true,statePreserved:state,foreignFilesPreserved:true}));
}else{
  const defaults=args.includes('--alias')?[]:['--alias',alias];
  const child=spawn(process.execPath,[program,'launch',family,'--state',state,...defaults,...args],{stdio:'inherit',env:process.env});
  const terminate=()=>child.kill('SIGTERM'), interrupt=()=>{};
  process.once('SIGTERM',terminate);process.on('SIGINT',interrupt);
  child.once('error',()=>{process.stderr.write('The messaging runtime could not start.\\n');process.exitCode=1;});
  child.once('exit',(code,signal)=>{process.off('SIGTERM',terminate);process.off('SIGINT',interrupt);process.exitCode=code??(signal?1:0);});
}
`;
}

// Create-only operator launchers: no global MCP entry, profile, service or model is changed.
export function setup({ client, directory, dryRun = false, output, program }) {
  if (!['claude', 'codex', 'antigravity'].includes(client)) throw new Error('Choose claude, codex or antigravity.');
  inspectDestination(directory);
  const destination = output ?? path.join(directory, 'launchers', client); inspectDestination(destination);
  const resolvedProgram = fs.realpathSync(program);
  if (!fs.statSync(resolvedProgram).isFile()) throw new Error('A real messaging entry script is required.');
  const alias = client === 'antigravity' ? 'argon' : client, filename = 'pulse-' + client + '.mjs';
  const content = launcherSource({ client, directory, program: resolvedProgram, alias, filename });
  const manifest = { format: 'pulse-messaging-launcher/v1', client, program: resolvedProgram, stateDirectory: directory, files: [{ path: filename, sha256: hash(content) }] };
  const files = [{ path: filename, content }, { path: 'pulse-launcher.json', content: JSON.stringify(manifest, null, 2) + '\n' }];
  const changes = files.map(file => {
    const target = path.join(destination, file.path); let before = null, conflict = false;
    if (fs.existsSync(target) || (() => { try { fs.lstatSync(target); return true; } catch { return false; } })()) {
      const stat = fs.lstatSync(target);
      if (stat.isSymbolicLink() || !stat.isFile() || stat.uid !== process.getuid() || stat.mode & 0o077) conflict = true;
      else { before = fs.readFileSync(target, 'utf8'); conflict = before !== file.content; }
    }
    return { path: target, before, after: file.content, sha256: hash(file.content), conflict };
  });
  const plan = { client, dryRun, destination, defaults: { alias, delivery: 'inbox-only', allowedRecipients: [] }, backups: [], reasonNoBackups: 'Create-only: existing differing files are never overwritten.', changes, conflicts: changes.filter(c => c.conflict).map(c => c.path), serve: { command: process.execPath, args: [resolvedProgram, 'serve', '--state', directory] }, launch: { command: process.execPath, args: [path.join(destination, filename), '--workspace', '<absolute-workspace>'] }, rollback: { command: process.execPath, args: [path.join(destination, filename), '--remove'], instruction: 'First exit the native sessions launched here; their bindings retire automatically. Removal preserves messages and foreign files.' }, globalProfilesChanged: false };
  if (dryRun) return plan;
  if (plan.conflicts.length) throw new Error('Existing differing launcher files were preserved; choose a new private destination.');
  fs.mkdirSync(destination, { recursive: true, mode: 0o700 });
  const created = [];
  try {
    for (const file of changes) if (file.before === null) { fs.writeFileSync(file.path, file.after, { flag: 'wx', mode: 0o600 }); created.push(file.path); }
  } catch (error) { for (const file of created.reverse()) fs.unlinkSync(file); throw error; }
  return { ...plan, created, changed: created.length > 0 };
}

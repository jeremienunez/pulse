#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 24 || (major === 24 && minor < 15)) {
  process.stderr.write('Pulse messaging requires Node.js 24.15 or newer. The core Pulse workflow is unchanged.\n');
  process.exitCode = 1;
} else {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const bundled = path.join(here, 'cli-messaging-runtime.mjs');
  const entry = fs.existsSync(bundled) ? bundled : path.join(here, 'cli-messaging/entry.mjs');
  import(pathToFileURL(entry).href).then(m => m.run()).then(result => { if (result !== undefined) process.stdout.write(JSON.stringify(result, null, 2) + '\n'); }).catch(error => { process.stderr.write((error.code ? error.code + ': ' : '') + error.message + '\n'); process.exitCode = 1; });
}

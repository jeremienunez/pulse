#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { OwnedCodexClient, startOwnedEndpoint } from '../adapters/codex-launcher.mjs';
export { OwnedCodexClient, startOwnedEndpoint };

if (path.basename(fileURLToPath(import.meta.url)) === 'codex-owner-launcher.mjs' && process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [, , directory, binary, overridesFile] = process.argv;
  startOwnedEndpoint({ directory, binary, overrides: JSON.parse(fs.readFileSync(overridesFile, 'utf8')) }).then(endpoint => {
    fs.writeFileSync(path.join(directory, 'codex-owner.json'), JSON.stringify({ pid: endpoint.child.pid, ownerPid: process.pid, url: endpoint.url, tokenFile: endpoint.tokenFile, binary }) + '\n', { mode: 0o600, flag: 'wx' });
    process.stdout.write('Owned Codex endpoint ready\n');
    for (const sig of ['SIGTERM', 'SIGINT']) process.once(sig, () => endpoint.close().then(() => process.exit(0)));
  }).catch(e => { process.stderr.write(e.message + '\n'); process.exitCode = 1; });
}

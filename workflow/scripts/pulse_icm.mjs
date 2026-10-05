#!/usr/bin/env node

import fs from "node:fs";
import { fileURLToPath } from "node:url";

import { runCli } from "../../skills/using-pulse/scripts/pulse_icm.mjs";

export * from "../../skills/using-pulse/scripts/pulse_icm.mjs";

function isDirectExecution() {
  if (!process.argv[1]) return false;
  try {
    return fs.realpathSync.native(process.argv[1]) === fs.realpathSync.native(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isDirectExecution()) {
  try {
    runCli();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

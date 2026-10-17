#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const PAYLOAD = ["SKILL.md", "references/transports.md", "scripts/cli_bridge.mjs"];
const KIND = "pulse-cli-bridge-install";
const hash = (content) => createHash("sha256").update(content).digest("hex");

function inventory(source) {
  return PAYLOAD.map((file) => {
    const location = path.join(source, file);
    const stat = fs.lstatSync(location);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Expected a regular skill file: ${file}`);
    return { path: file, sha256: hash(fs.readFileSync(location)) };
  });
}

export function installCliBridge({ source, dataRoot, targets, dryRun = false }) {
  source = fs.realpathSync(source);
  dataRoot = path.resolve(dataRoot);
  const files = inventory(source), digest = hash(JSON.stringify(files));
  const snapshot = path.join(dataRoot, digest);
  const header = fs.readFileSync(path.join(source, "SKILL.md"), "utf8").match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u)?.[1];
  if (!header || !/^name:\s*cli-bridge\s*$/mu.test(header)) {
    throw new Error("The source must be the canonical cli-bridge skill.");
  }
  const links = Object.entries(targets).map(([surface, root]) => {
    const target = path.join(path.resolve(root), "cli-bridge");
    let previous = null;
    try {
      const stat = fs.lstatSync(target);
      if (!stat.isSymbolicLink()) throw new Error(`Foreign skill destination preserved: ${target}`);
      previous = fs.readlinkSync(target);
      const resolved = path.resolve(path.dirname(target), previous);
      if (path.dirname(resolved) !== dataRoot) throw new Error(`Foreign skill link preserved: ${target}`);
      const manifest = JSON.parse(fs.readFileSync(path.join(resolved, "install-manifest.json"), "utf8"));
      if (manifest.kind !== KIND) throw new Error(`Unmanaged skill link preserved: ${target}`);
    } catch (error) {
      if (error.code !== "ENOENT" || previous !== null) throw error;
    }
    return { surface, target, previous };
  });
  const verifySnapshot = () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(snapshot, "install-manifest.json"), "utf8"));
    if (manifest.kind !== KIND || manifest.digest !== digest || JSON.stringify(inventory(snapshot)) !== JSON.stringify(files)) {
      throw new Error("Existing snapshot differs from the requested skill; preserving it without overwrite.");
    }
  };
  if (fs.existsSync(snapshot)) verifySnapshot();
  const result = { source, snapshot, digest, targets: links.map(({ surface, target }) => ({ surface, target })), dry_run: dryRun };
  if (dryRun) return result;
  if (!fs.existsSync(snapshot)) {
    fs.mkdirSync(dataRoot, { recursive: true, mode: 0o700 });
    const stage = fs.mkdtempSync(path.join(dataRoot, ".stage-"));
    try {
      for (const file of files) {
        const destination = path.join(stage, file.path);
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.copyFileSync(path.join(source, file.path), destination, fs.constants.COPYFILE_EXCL);
      }
      fs.writeFileSync(path.join(stage, "install-manifest.json"), `${JSON.stringify({ kind: KIND, digest, files }, null, 2)}\n`, { flag: "wx", mode: 0o600 });
      fs.renameSync(stage, snapshot);
    } catch (error) {
      fs.rmSync(stage, { recursive: true, force: true });
      throw error;
    }
  }
  const changed = [];
  try {
    for (const entry of links) {
      fs.mkdirSync(path.dirname(entry.target), { recursive: true });
      if (entry.previous === snapshot) continue;
      if (entry.previous === null) {
        fs.symlinkSync(snapshot, entry.target, "dir");
      } else {
        if (fs.readlinkSync(entry.target) !== entry.previous) throw new Error("Skill destination changed during installation.");
        const temporary = `${entry.target}.pulse-${randomUUID()}`;
        try { fs.symlinkSync(snapshot, temporary, "dir"); fs.renameSync(temporary, entry.target); }
        finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
      }
      changed.push(entry);
    }
  } catch (error) {
    for (const entry of changed.reverse()) {
      try {
        if (fs.readlinkSync(entry.target) === snapshot) {
          fs.unlinkSync(entry.target);
          if (entry.previous !== null) fs.symlinkSync(entry.previous, entry.target, "dir");
        }
      } catch { /* A concurrently changed destination remains untouched. */ }
    }
    throw error;
  }
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ options: {
      source: { type: "string", default: fileURLToPath(new URL("../skills/cli-bridge/", import.meta.url)) },
      "data-root": { type: "string", default: path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local/share"), "pulse/cli-bridge") },
      "agents-root": { type: "string", default: path.join(os.homedir(), ".agents/skills") },
      "claude-root": { type: "string", default: path.join(os.homedir(), ".claude/skills") },
      "dry-run": { type: "boolean", default: false },
    } });
    const result = installCliBridge({ source: values.source, dataRoot: values["data-root"], dryRun: values["dry-run"],
      targets: { agents: values["agents-root"], claude: values["claude-root"] } });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
